const { functions, admin, db, axios, ImapFlow } = require('./config');
const { sendTelegramAdminNotification } = require('./telegram');
const { sendEmail, buildRechargeApprovedEmail, buildRechargeRejectedEmail } = require('./email');
const { getUserRole } = require('./auth');

function decodeContent(part, body) {
  if (part.includes('base64')) { try { return Buffer.from(body, 'base64').toString('utf-8'); } catch { return body; } }
  if (part.includes('quoted-printable')) { try { return body.replace(/=\r\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); } catch { return body; } }
  return body;
}

function decodeHtmlEntities(text) {
  const entities = {
    '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
    '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
    '&ntilde;': 'ñ', '&Ntilde;': 'Ñ', '&iquest;': '¿', '&iexcl;': '¡',
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&nbsp;': ' ', '&#160;': ' ', '&#39;': "'", '&#x27;': "'",
    '&dollar;': '$', '&excl;': '!', '&quest;': '?',
  };
  return text.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, (match) => entities[match] || match);
}

function extractAllBodies(source) {
  const boundaryMatch = source.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) return { text: extractPlainFromSource(source), html: source };
  const boundary = boundaryMatch[1];
  const parts = source.split(new RegExp(`--${boundary}`));
  let text = '', html = '';
  for (const part of parts) {
    const ct = part.match(/Content-Type:\s*([^;\n]+)/i);
    if (!ct) continue;
    const encoding = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const bodyStart = part.search(/\r?\n\r?\n/);
    if (bodyStart === -1) continue;
    const body = part.slice(bodyStart).trim();
    const decoded = encoding ? decodeContent(encoding[1], body) : body;
    if (ct[1].includes('text/plain')) text += decoded;
    else if (ct[1].includes('text/html')) html += decoded;
  }
  return { text, html };
}

function extractPlainFromSource(source) {
  const start = source.search(/\r?\n\r?\n/);
  return start === -1 ? source : source.slice(start).trim();
}

function extractEmailBody(source) {
  const { text, html } = extractAllBodies(source);
  const body = text || html || source;
  const cleaned = decodeHtmlEntities(body)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function matchPayment(body, customerName, amount) {
  const lowerBody = body.toLowerCase();
  const patterns = [
    { name: /recibiste un pago de\s+([^.]+?)\s+por\s+\$/i, amount: /por\s+\$?([0-9,]+\.?[0-9]*)/i },
    { name: /recibiste un pago de\s+([^.]+?)(?:\.|,|$)/i, amount: /\$?([0-9,]+\.?[0-9]*)/i },
    { name: /pago de\s+([^.]+?)\s+por\s+\$/i, amount: /por\s+\$?([0-9,]+\.?[0-9]*)/i },
  ];
  let matchResult = null;
  for (const p of patterns) {
    const nameMatch = lowerBody.match(p.name);
    if (!nameMatch) continue;
    const amountMatch = lowerBody.match(p.amount);
    if (!amountMatch) continue;
    matchResult = { name: nameMatch[1].trim(), amount: amountMatch[1] };
    break;
  }
  if (!matchResult) {
    const backupName = lowerBody.match(/recibiste un pago de\s+(.+?)(?:por\s+\$|\.)/i);
    const backupAmount = lowerBody.match(/\$?\s*([0-9,]+\.?[0-9]*)\s*/);
    if (backupName && backupAmount) matchResult = { name: backupName[1].trim(), amount: backupAmount[1] };
  }
  if (!matchResult) return null;

  const emailName = matchResult.name.toLowerCase();
  const rawAmount = matchResult.amount.replace(/,/g, '');
  const emailAmount = parseFloat(rawAmount);
  const nameParts = customerName.toLowerCase().split(/\s+/).filter(Boolean);
  const emailNameParts = emailName.split(/\s+/).filter(Boolean);
  const nameOk = nameParts.some(p => emailNameParts.some(ep => ep.includes(p) || p.includes(ep)));
  const amountOk = !isNaN(emailAmount) && Math.abs(emailAmount - amount) <= 200;
  return { nameOk, amountOk, emailName, emailAmount, matchedName: matchResult.name };
}

const createRechargeRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { amount, customerName, customerPhone, transferProof } = data;

  if (!amount || !customerName || !customerPhone) {
    throw new functions.https.HttpsError('invalid-argument', 'Monto, nombre y teléfono son requeridos');
  }

  const userId = context.auth.uid;
  let rechargeTenantId = null;
  let resellerId = null;

  // Obtener datos del customer (o reseller) que crea la recarga
  try {
    const customerDoc = await db.collection('customers').doc(userId).get();
    if (customerDoc.exists) {
      const data = customerDoc.data();
      rechargeTenantId = data.tenantId || null;
      // Si el customer tiene un reseller asignado, lo vinculamos
      if (data.createdBy) resellerId = data.createdBy;
    }
  } catch (_) {
  }

  // Si el que crea la recarga es un reseller/admin, se vincula a sí mismo
  if (!resellerId) {
    try {
      const { role } = await getUserRole(userId);
      if (role === 'reseller' || role === 'admin' || role === 'superadmin') {
        resellerId = userId;
      }
    } catch (_) {
    }
  }

  const rechargeRef = await db.collection('recharges').add({
    userId,
    resellerId, // <-- NUEVO: identificador del distribuidor
    customerName,
    customerPhone,
    amount: parseInt(amount),
    tenantId: rechargeTenantId,
    transferProof: transferProof || null,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, rechargeId: rechargeRef.id };
});

const onNewRecharge = functions.firestore
  .document('recharges/{rechargeId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();

    let tenantId = null;
    try {
      const customerSnap = await db.collection('customers').doc(data.userId).get();
      if (customerSnap.exists) {
        tenantId = customerSnap.data().tenantId;
      }
    } catch (e) {
      console.warn('Error looking up customer for recharge notification:', e.message);
    }

    if (!tenantId) {
      console.warn(`No tenantId found for customer ${data.userId}, cannot send Telegram notification`);
      return;
    }

    const rechargeId = context.params.rechargeId;

    const customerName = data.customerName || 'Desconocido';
    const amount = data.amount || 0;
    const statusEmoji = data.status === 'pending' ? '⏳' : data.status === 'approved' ? '✅' : '❌';
    const msg = `💰 <b>Nueva Recarga Solicitada</b>\n\n👤 <b>Cliente:</b> ${customerName}\n📞 <b>Teléfono:</b> ${data.customerPhone || '—'}\n💵 <b>Monto:</b> $${amount.toLocaleString('es-CO')} COP\n🆔 <b>ID Recarga:</b> ${rechargeId}\n📌 <b>Estado:</b> ${data.status || 'pending'}\n🕐 <b>Fecha:</b> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;
    sendTelegramAdminNotification(tenantId, msg);
  });

const processRecharge = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: userTenantId } = await getUserRole(context.auth.uid);

  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { rechargeId, action, reason } = data;

  if (!rechargeId || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'rechargeId y action son requeridos');
  }

  const rechargeRef = db.collection('recharges').doc(rechargeId);
  const rechargeDoc = await rechargeRef.get();

  if (!rechargeDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Recarga no encontrada');
  }

  const rechargeData = rechargeDoc.data();

  if (role !== 'superadmin') {
    const customerSnap = await db.collection('customers').doc(rechargeData.userId).get();
    if (!customerSnap.exists || userTenantId !== customerSnap.data().tenantId) {
      throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a esta recarga');
    }
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const updateData = {
    status: newStatus,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: context.auth.uid,
  };
  if (action === 'reject' && reason) {
    updateData.rejectedReason = reason;
  }
  await rechargeRef.update(updateData);

  if (action === 'approve') {
    const customerRef = db.collection('customers').doc(rechargeData.userId);
    await customerRef.update({
      balance: admin.firestore.FieldValue.increment(rechargeData.amount)
    });
  }

  const statusText = action === 'approve' ? '✅ Aprobada' : '❌ Rechazada';
  const userMessage = `Tu recarga de $${rechargeData.amount.toLocaleString()} COP ha sido ${statusText.toLowerCase()}.`;
  await db.collection('notifications').add({
    userId: rechargeData.userId,
    type: 'recharge_status',
    title: statusText,
    message: userMessage,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const customerDoc = await db.collection('customers').doc(rechargeData.userId).get();
  const customerEmail = customerDoc.exists ? customerDoc.data().email || '' : '';

  const rechargeTenantId = rechargeData.tenantId || userTenantId;
  if (rechargeTenantId) {
    const icon = newStatus === 'approved' ? '✅' : '❌';
    const label = newStatus === 'approved' ? 'Aprobada' : 'Rechazada';
    let extra = '';
    if (newStatus === 'rejected' && reason) extra = `\n📝 <b>Motivo:</b> ${reason}`;
    const msg = `${icon} <b>Recarga ${label}</b>\n\n👤 <b>Cliente:</b> ${rechargeData.customerName || 'N/A'}\n📞 <b>Teléfono:</b> ${rechargeData.customerPhone || '—'}\n💵 <b>Monto:</b> $${(rechargeData.amount || 0).toLocaleString('es-CO')} COP\n🆔 <b>ID:</b> ${data.rechargeId || ''}\n👤 <b>Procesado por:</b> ${context.auth.token.email || 'Admin'}${extra}`;
    sendTelegramAdminNotification(rechargeTenantId, msg);
  }

  if (customerEmail && rechargeTenantId) {
    if (newStatus === 'approved') {
      const newBalance = customerDoc.exists ? (customerDoc.data().balance || 0) : 0;
      const emailHtml = buildRechargeApprovedEmail({ amount: rechargeData.amount, newBalance });
      sendEmail(rechargeTenantId, customerEmail, 'Recarga Aprobada', emailHtml);
    } else {
      const emailHtml = buildRechargeRejectedEmail({ amount: rechargeData.amount, reason: updateData.rejectedReason || '' });
      sendEmail(rechargeTenantId, customerEmail, 'Recarga Rechazada', emailHtml);
    }
  }

  return { success: true, status: newStatus };
});

const checkRechargePayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { rechargeId } = data;
  if (!rechargeId) {
    throw new functions.https.HttpsError('invalid-argument', 'rechargeId es requerido');
  }

  const rechargeRef = db.collection('recharges').doc(rechargeId);
  const rechargeDoc = await rechargeRef.get();

  if (!rechargeDoc.exists) {
    return { found: false, processed: false, status: null, message: 'Recarga no encontrada' };
  }

  const rechargeData = rechargeDoc.data();
  
  // Si ya fue procesada, devolver estado actual
  if (rechargeData.status !== 'pending') {
    return {
      found: true,
      processed: true,
      status: rechargeData.status,
      message: rechargeData.status === 'approved'
        ? 'Pago confirmado. Saldo actualizado.'
        : 'La recarga fue rechazada.'
    };
  }

  // Intentar verificar pago vía IMAP
  const tenantId = rechargeData.tenantId;
  if (tenantId) {
    try {
      const configDoc = await db.collection('tenants').doc(tenantId)
        .collection('secrets').doc('emailConfigPayments').get();
      
      if (configDoc.exists) {
        const config = configDoc.data();
        const host = config.host || 'imap.gmail.com';
        const port = config.port || 993;
        const email = config.email;
        const password = config.password;

        if (email && password) {
          const client = new ImapFlow({
            host, port,
            secure: port === 993,
            auth: { user: email, pass: password },
            logger: false,
          });

          await client.connect();
          const lock = await client.getMailboxLock('INBOX');
          try {
            const since = new Date(Date.now() - 30 * 60 * 1000); // últimos 30 min
            const messages = await client.search({ since });
            
            for (const uid of messages.slice(-10)) {
              const msg = await client.fetchOne(uid, { source: true });
              if (!msg?.source?.toString()) continue;
              
              const source = msg.source.toString();
              const body = extractEmailBody(source);
              const result = matchPayment(body, rechargeData.customerName || '', rechargeData.amount || 0);
              
              if (result && result.nameOk && result.amountOk) {
                // Auto-aprobar recarga
                await rechargeRef.update({
                  status: 'approved',
                  emailUid: String(uid),
                  processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                const customerRef = db.collection('customers').doc(rechargeData.userId);
                await customerRef.update({
                  balance: admin.firestore.FieldValue.increment(rechargeData.amount)
                });

                // Notificar
                const msgTelegram = `✅ <b>Recarga Aprobada Automáticamente</b>\n\n👤 <b>Cliente:</b> ${rechargeData.customerName || 'N/A'}\n💵 <b>Monto:</b> $${(rechargeData.amount || 0).toLocaleString('es-CO')} COP\n📧 <b>Email detectado:</b> ${result.matchedName}`;
                sendTelegramAdminNotification(tenantId, msgTelegram);

                return {
                  found: true,
                  processed: true,
                  status: 'approved',
                  message: 'Pago confirmado. Saldo actualizado.',
                };
              }
            }
          } finally {
            lock.release();
            await client.logout();
          }
        }
      }
    } catch (err) {
      console.error('Error verificando pago por IMAP:', err);
    }
  }

  // Sin cambios
  return {
    found: true,
    processed: false,
    status: 'pending',
    message: 'Recarga pendiente de aprobación.'
  };
});

const getRechargeHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role } = await getUserRole(context.auth.uid);
  const uid = context.auth.uid;
  const toISO = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return String(val);
  };
  const mapDoc = (doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      userId: d.userId || '',
      customerName: d.customerName || '',
      customerPhone: d.customerPhone || '',
      amount: d.amount || 0,
      status: d.status || 'pending',
      tenantId: d.tenantId || '',
      transferProof: d.transferProof || null,
      processedAt: toISO(d.processedAt),
      createdAt: toISO(d.createdAt),
      rejectedReason: d.rejectedReason || null,
      emailUid: d.emailUid || null,
      resellerId: d.resellerId || null,
    };
  };

  let recharges = [];

  if (role === 'customer') {
    // Cliente: solo sus propias recargas
    const snap = await db.collection('recharges')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    recharges = snap.docs.map(mapDoc);
  } else {
    // Reseller/Admin: recargas donde resellerId == uid (clientes del distribuidor)
    // + sus propias recargas (userId == uid)
    const [snapReseller, snapOwn] = await Promise.all([
      db.collection('recharges')
        .where('resellerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      db.collection('recharges')
        .where('userId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
    ]);

    const seen = new Set();
    recharges = [...snapReseller.docs.map(mapDoc), ...snapOwn.docs.map(mapDoc)]
      .filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .sort((a, b) => {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, 50);
  }

  return { success: true, recharges };
});

module.exports = { createRechargeRequest, onNewRecharge, processRecharge, checkRechargePayment, getRechargeHistory };
