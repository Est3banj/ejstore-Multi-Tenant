const { functions, admin, db, ImapFlow } = require('./config');
const { getUserRole } = require('./auth');

// ========== HELPERS ==========

function parseSimpleEmail(source) {
  const result = { from: '', subject: '', date: null, text: '', html: '' };

  const fromMatch = source.match(/^From:\s*(.+)$/im);
  if (fromMatch) result.from = fromMatch[1].trim();

  const subjectMatch = source.match(/^Subject:\s*(.+)$/im);
  if (subjectMatch) result.subject = subjectMatch[1].trim();

  const dateMatch = source.match(/^Date:\s*(.+)$/im);
  if (dateMatch) {
    result.date = new Date(dateMatch[1].trim());
    if (isNaN(result.date.getTime())) result.date = null;
  }

  const boundaryMatch = source.match(/boundary="([^"]+)"/);
  const boundary = boundaryMatch ? boundaryMatch[1] : null;

  if (boundary) {
    const parts = source.split(`--${boundary}`);
    for (const part of parts) {
      if (part.includes('text/plain')) {
        const body = part.replace(/^[\s\S]*?\n\n/, '').replace(/\n--[\s\S]*$/, '').trim();
        if (body) result.text = decodeB64IfNeeded(part, body);
      }
      if (part.includes('text/html')) {
        const body = part.replace(/^[\s\S]*?\n\n/, '').replace(/\n--[\s\S]*$/, '').trim();
        if (body) result.html = decodeB64IfNeeded(part, body);
      }
    }
  } else {
    const body = source.replace(/^[\s\S]*?\n\n/, '').trim();
    if (body) result.text = body;
  }

  if (!result.text && !result.html) {
    result.text = source.replace(/^[\s\S]*?\n\n/, '').trim();
  }

  if (result.html && !result.text) {
    result.text = result.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return result;
}

function decodeB64IfNeeded(part, body) {
  if (part.includes('Content-Transfer-Encoding: base64')) {
    try {
      return Buffer.from(body, 'base64').toString('utf-8');
    } catch {
      return body;
    }
  }
  if (part.includes('Content-Transfer-Encoding: quoted-printable')) {
    try {
      return body
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    } catch {
      return body;
    }
  }
  return body;
}

function extractServiceKeywords(serviceName) {
  const kw = [];
  kw.push(serviceName);

  if (serviceName.includes('netflix')) kw.push('netflix', 'código', 'verificación', 'acceso temporal');
  else if (serviceName.includes('disney')) kw.push('disney', 'código', 'verificación');
  else if (serviceName.includes('hbo') || serviceName.includes('max')) kw.push('hbo', 'max', 'código', 'verificación');
  else if (serviceName.includes('win')) kw.push('win', 'código', 'verificación');
  else if (serviceName.includes('chatgpt') || serviceName.includes('tools')) kw.push('chatgpt', 'openai', 'código');
  else kw.push('código', 'verificación', 'code', 'verify', 'access');

  return kw;
}

function extractCodeFromBody(body) {
  if (!body) return null;

  const urlMatch = body.match(/https?:\/\/[^\s"<>]+/);
  if (urlMatch) return urlMatch[0];

  const codeMatch = body.match(/(?<!\d)(\d{4,6})(?!\d)/);
  if (codeMatch) return codeMatch[1];

  return null;
}

// ========== EXPORTED FUNCTIONS ==========

const extraerCodigo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { purchaseId } = data;
  if (!purchaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'purchaseId es requerido');
  }

  try {
    const ahora = new Date().toISOString();

    const purchaseDoc = await db.collection('purchases').doc(purchaseId).get();
    if (!purchaseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Compra no encontrada');
    }
    const purchaseData = purchaseDoc.data();
    const tenantId = purchaseData.tenantId;
    const serviceName = (purchaseData.serviceName || '').toLowerCase();

    const configDoc = await db
      .collection('tenants').doc(tenantId)
      .collection('secrets').doc('emailConfig').get();

    if (!configDoc.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'El administrador aún no configuró el Correo Madre para esta tienda'
      );
    }

    const config = configDoc.data();
    let client;
    try {
      client = new ImapFlow({
        host: config.host || 'imap.gmail.com',
        port: config.port || 993,
        secure: true,
        auth: { user: config.email, pass: config.password },
        logger: false,
        timeout: 15000,
      });
      await client.connect();
    } catch (connErr) {
      console.error('IMAP connection error:', connErr.message);
      throw new functions.https.HttpsError(
        'internal',
        'No se pudo conectar al correo. Verificá la configuración del Correo Madre.'
      );
    }

    let foundEmail = null;
    try {
      const since = new Date(Date.now() - 15 * 60 * 1000);
      await client.mailboxOpen('INBOX');

      const searchResult = await client.search({
        since: since,
      });

      const uids = searchResult || [];
      if (uids.length === 0) {
        console.log('No hay emails en los últimos 15 min');
      } else {
        console.log(`Buscando en ${uids.length} emails recientes...`);

        const recentUids = uids.slice(-20);

        const lock = await client.getMailboxLock('INBOX');
        try {
          for await (const msg of client.fetch(recentUids, {
            uid: true,
            source: true,
          })) {
            const source = msg.source.toString('utf-8');
            const parsed = parseSimpleEmail(source);

            const subject = (parsed.subject || '').toLowerCase();
            const from = (parsed.from || '').toLowerCase();
            const bodyText = (parsed.text || parsed.html || '').toLowerCase();

            const svcKeywords = extractServiceKeywords(serviceName);
            const matches = svcKeywords.some(
              (kw) => subject.includes(kw) || from.includes(kw) || bodyText.includes(kw)
            );

            if (!matches) continue;

            const fullBody = parsed.text || parsed.html || '';
            const extractedCode = extractCodeFromBody(fullBody);

            foundEmail = {
              from: parsed.from || 'Desconocido',
              subject: parsed.subject || 'Sin asunto',
              bodyText: fullBody,
              code: extractedCode,
            };
            break;
          }
        } finally {
          lock.release();
        }
      }
    } catch (searchErr) {
      console.error('IMAP search error:', searchErr.message);
    } finally {
      try { await client.logout(); } catch {}
    }

    if (!foundEmail) {
      return {
        success: false,
        code: null,
        from: '',
        subject: '',
        bodyText: `No se encontró un email de verificación para "${serviceName}" en los últimos 15 minutos.\n\nAsegurate de que:\n1. El cliente solicitó el código desde su dispositivo\n2. La cuenta madre tiene configurado el reenvío de este servicio\n3. El correo llegó en los últimos 15 minutos`,
        extractedAt: ahora,
      };
    }

    return {
      success: true,
      code: foundEmail.code || 'Código no detectado automáticamente. Revisá el contenido del correo.',
      from: foundEmail.from,
      subject: foundEmail.subject,
      bodyText: foundEmail.bodyText,
      extractedAt: ahora,
    };
  } catch (error) {
    console.error('Error en extraerCodigo:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Error al extraer el código');
  }
});

const saveEmailConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { tenantId, email, password, host, port, docId } = data;
  if (!tenantId || !email || !password || !host || !port) {
    throw new functions.https.HttpsError('invalid-argument', 'Todos los campos son requeridos');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  const role = userData?.role;
  const userTenantId = userData?.tenantId;

  if (role !== 'superadmin' && (role !== 'admin' || userTenantId !== tenantId)) {
    throw new functions.https.HttpsError('permission-denied', 'No tienes permisos para esta acción');
  }

  const configDocId = docId || 'emailConfig';
  await db.collection('tenants').doc(tenantId).collection('secrets').doc(configDocId).set({
    email,
    password,
    host,
    port: parseInt(port),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: context.auth.uid,
  }, { merge: true });

  return { success: true };
});

const getEmailConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { tenantId, docId } = data;
  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  const role = userData?.role;
  const userTenantId = userData?.tenantId;

  if (role !== 'superadmin' && (role !== 'admin' || userTenantId !== tenantId)) {
    throw new functions.https.HttpsError('permission-denied', 'No tienes permisos');
  }

  const configDocId = docId || 'emailConfig';
  const configDoc = await db.collection('tenants').doc(tenantId).collection('secrets').doc(configDocId).get();

  if (!configDoc.exists) {
    return { config: null };
  }

  const config = configDoc.data();
  return {
    config: {
      email: config.email,
      host: config.host,
      port: config.port,
      updatedAt: config.updatedAt,
      hasPassword: !!config.password,
    },
  };
});

const testEmailConnection = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { email, password, host, port } = data;
  if (!email || !password || !host || !port) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan campos requeridos');
  }

  let client = null;
  try {
    client = new ImapFlow({
      host,
      port: parseInt(port),
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      timeout: 10000,
    });

    await client.connect();
    await client.mailboxOpen('INBOX');
    await client.logout();

    return { success: true, message: 'Conexión exitosa' };
  } catch (err) {
    if (client) {
      try { await client.logout(); } catch {}
    }
    return {
      success: false,
      message: err.message || 'Error de conexión IMAP',
    };
  }
});

const checkEmailStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  const { role, tenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }
  const { docId } = data;
  const configDoc = await db.collection('tenants').doc(tenantId).collection('secrets').doc(docId || 'emailConfigPayments').get();
  if (!configDoc.exists) {
    return { connected: false, message: 'No hay configuración de correo' };
  }

  const config = configDoc.data();
  const { email: cfgEmail, password: cfgPass, host: cfgHost, port: cfgPort } = config;

  if (!cfgEmail || !cfgPass || !cfgHost) {
    return { connected: false, message: 'Configuración incompleta (falta email, password o host)' };
  }

  // Probar conexión IMAP real
  let client = null;
  try {
    client = new ImapFlow({
      host: cfgHost,
      port: cfgPort || 993,
      secure: true,
      auth: { user: cfgEmail, pass: cfgPass },
      logger: false,
      timeout: 10000,
    });
    await client.connect();
    await client.mailboxOpen('INBOX');
    await client.logout();
    return { connected: true, message: 'Conectado IMAP exitosamente' };
  } catch (err) {
    if (client) {
      try { await client.logout(); } catch {}
    }
    return { connected: false, message: err.message || 'Error de conexión IMAP' };
  }
});

module.exports = { extraerCodigo, saveEmailConfig, getEmailConfig, testEmailConnection, checkEmailStatus };
