const { admin, db, axios, logger, createModuleLogger, wrapWithCorrelationId, setTenantContext, setUserContext } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { sendTelegramAdminNotification } = require('./telegram');
const { sendEmail, buildRechargeApprovedEmail, buildRechargeRejectedEmail } = require('./email');
const { getUserRole } = require('./auth');
const { imapPool } = require('./services/connectionPool');
const { notifyNewRechargeOnce } = require('./services/notificationTriggers');
const { validateIdempotencyKey } = require('./services/idempotencyService');
const { requireVerifiedClient } = require('./services/authVerification');

const log = createModuleLogger('recharges');

const RECHARGE_MIN = 1000;
const RECHARGE_MAX = (() => {
  const fromEnv = parseInt(process.env.RECHARGE_MAX_AMOUNT, 10);
  return Number.isSafeInteger(fromEnv) && fromEnv > RECHARGE_MIN ? fromEnv : 5_000_000;
})();

function parseRechargeAmount(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    value = Number(trimmed);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  return value;
}

function isValidRechargeAmount(value) {
  const amount = parseRechargeAmount(value);
  return amount !== null && amount >= RECHARGE_MIN && amount <= RECHARGE_MAX;
}

function invalidAmountError() {
  return new HttpsError(
    'invalid-argument',
    `Monto inválido (mín $${RECHARGE_MIN.toLocaleString('es-CO')} / máximo $${RECHARGE_MAX.toLocaleString('es-CO')} COP)`,
    { code: 'MONTO_INVALIDO' }
  );
}

function toIsoTimestamp(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function pendingRechargeResponse(rechargeId, data) {
  return {
    success: true,
    alreadyPending: true,
    rechargeId,
    status: data.status || 'pending',
    amount: data.amount || 0,
    createdAt: toIsoTimestamp(data.createdAt),
  };
}

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
    '&': '&', '<': '<', '>': '>', '"': '"', '&apos;': "'",
    '&nbsp;': ' ', '&#160;': ' ', '&lsquo;': "'", '&rsquo;': "'",
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
    .replace(/&/g, '&')
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

async function createRechargeRequest(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated recharge request attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  requireVerifiedClient(context);

  const { amount, customerName, customerPhone, transferProof, tenantId: payloadTenantId, idempotencyKey } = data;
  const userId = context.auth.uid;

  const childLog = log.child({ userId, amount, customerName, operation: 'createRechargeRequest' });
  setUserContext(userId);

  const parsedAmount = parseRechargeAmount(amount);
  if (parsedAmount === null || parsedAmount < RECHARGE_MIN || parsedAmount > RECHARGE_MAX) {
    childLog.warn({ amount }, 'Invalid recharge amount');
    throw invalidAmountError();
  }

  let rechargeTenantId = null;
  let resellerId = null;
  let docPhone = '';
  let customerDocExists = false;

  try {
    const customerDoc = await db.collection('customers').doc(userId).get();
    if (customerDoc.exists) {
      customerDocExists = true;
      const data = customerDoc.data();
      rechargeTenantId = data.tenantId || null;
      if (data.createdBy) resellerId = data.createdBy;
      if (typeof data.phone === 'string') docPhone = data.phone.trim();
    }
  } catch (_) {}

  const rechargeTenantIdFromDoc = rechargeTenantId;
  const phone = (typeof customerPhone === 'string' ? customerPhone : '').trim() || docPhone;

  if (!customerName) {
    childLog.warn('Missing customer name');
    throw new HttpsError('invalid-argument', 'Monto, nombre y teléfono son requeridos');
  }

  if (!phone) {
    childLog.warn('Missing phone in payload and customer doc');
    throw new HttpsError('invalid-argument', 'El teléfono es requerido', { code: 'TELEFONO_REQUERIDO' });
  }

  // ── Resolución de tenantId (fix post-cutover: recharges con tenantId null
  // eran zombis invisibles para el admin y sin poll IMAP). Precedencia:
  // customer doc (verdad de servidor, difícil de forzar) → payload (contexto
  // de tienda del front) → FAIL EARLY. Nunca crear la recarga sin tenant.
  const payloadTenant = typeof payloadTenantId === 'string' ? payloadTenantId.trim() : '';
  if (!rechargeTenantId && payloadTenant) {
    rechargeTenantId = payloadTenant;
    childLog.info({ tenantId: rechargeTenantId }, 'Tenant resolved from payload (customer doc missing tenantId)');
  } else if (rechargeTenantId && payloadTenant && payloadTenant !== rechargeTenantId) {
    childLog.warn({ customerTenantId: rechargeTenantId, payloadTenant }, 'Payload tenantId differs from customer doc — using customer doc');
  }

  if (!rechargeTenantId) {
    childLog.warn('Tenant could not be resolved from customer doc nor payload');
    throw new HttpsError(
      'failed-precondition',
      'No se pudo determinar la tienda de tu cuenta. Contactá con soporte.',
      { code: 'TENANT_NO_RESUELTO' }
    );
  }

  const tenantSnap = await db.collection('tenants').doc(rechargeTenantId).get().catch(() => null);
  if (!tenantSnap || !tenantSnap.exists) {
    childLog.warn({ tenantId: rechargeTenantId }, 'Resolved tenant does not exist');
    throw new HttpsError('invalid-argument', 'La tienda indicada no existe.', { code: 'TENANT_INVALIDO' });
  }

  if (!resellerId) {
    try {
      const { role } = await getUserRole(userId);
      if (role === 'reseller' || role === 'admin' || role === 'superadmin') {
        resellerId = userId;
      }
    } catch (_) {}
  }

  setTenantContext(rechargeTenantId);
  childLog.info({ tenantId: rechargeTenantId }, 'Tenant ID resolved for recharge');

  // Backfill best-effort: si el customer doc existe sin tenantId y lo
  // resolvimos (payload), persistirlo para futuras recargas. No fatal.
  if (customerDocExists && !rechargeTenantIdFromDoc) {
    try {
      await db.collection('customers').doc(userId).set({ tenantId: rechargeTenantId }, { merge: true });
      childLog.info({ tenantId: rechargeTenantId }, 'Customer doc tenantId backfilled');
    } catch (err) {
      childLog.warn({ err }, 'Customer tenantId backfill failed (non-fatal)');
    }
  }

  // ── Dedupe (L1): prevención de recargas duplicadas — doble submit, retorno
  // al sitio y replay de API. Dos mecanismos complementarios:
  //   1. CUALQUIER pending del uid bloquea (sin ventana de edad — un pending
  //      viejo debe seguir VISIBLE para el usuario, no silenciosamente salteado).
  //   2. idempotencyKey opcional → doc-id determinístico `${uid}__${key}` con
  //      get-before-write en la misma transacción (replay devuelve el doc
  //      existente). Un lock doc por uid (`recharge_locks/{uid}`) serializa
  //      creates paralelos SIN key: el conflicto de transacción sobre un doc
  //      determinístico garantiza ≤1 doc nuevo por corrida.
  // No se reutiliza withIdempotency (colección aparte, TTL 24h, espera de
  // 30s y errores crudos en inglés): su forma pelea con el pending-lookup y
  // con el contrato de errores en español; el key vivo en el propio doc es
  // la fuente de verdad única.
  const rawIdempotencyKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (rawIdempotencyKey) {
    const keyValidation = validateIdempotencyKey(rawIdempotencyKey);
    if (!keyValidation.valid) {
      childLog.warn('Invalid idempotency key');
      throw new HttpsError('invalid-argument', 'La clave de idempotencia es inválida', { code: 'IDEMPOTENCIA_INVALIDA' });
    }
  }

  const pendingSnap = await db.collection('recharges')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  const pendingDoc = pendingSnap.docs.find((doc) => doc.data().status === 'pending');
  if (pendingDoc) {
    childLog.info({ rechargeId: pendingDoc.id }, 'Blocked: user already has a pending recharge');
    return pendingRechargeResponse(pendingDoc.id, pendingDoc.data());
  }

  const lockRef = db.collection('recharge_locks').doc(userId);
  const keyedRef = rawIdempotencyKey ? db.collection('recharges').doc(`${userId}__${rawIdempotencyKey}`) : null;

  const created = await db.runTransaction(async (transaction) => {
    if (keyedRef) {
      const existing = await transaction.get(keyedRef);
      if (existing.exists) {
        childLog.info({ rechargeId: existing.id }, 'Idempotency key replay: returning existing recharge');
        return pendingRechargeResponse(existing.id, existing.data());
      }
    }

    const lockSnap = await transaction.get(lockRef);
    if (lockSnap.exists) {
      const lockRechargeId = lockSnap.data().rechargeId;
      if (lockRechargeId) {
        const lockedDoc = await transaction.get(db.collection('recharges').doc(lockRechargeId));
        if (lockedDoc.exists && lockedDoc.data().status === 'pending') {
          childLog.info({ rechargeId: lockedDoc.id }, 'Lock points to a pending recharge: blocking create');
          return pendingRechargeResponse(lockedDoc.id, lockedDoc.data());
        }
      }
    }

    const newRef = keyedRef || db.collection('recharges').doc();
    transaction.set(newRef, {
      userId,
      resellerId,
      customerName,
      customerPhone: phone,
      amount: parsedAmount,
      tenantId: rechargeTenantId,
      transferProof: transferProof || null,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(rawIdempotencyKey ? { idempotencyKey: rawIdempotencyKey } : {}),
    });
    transaction.set(lockRef, {
      rechargeId: newRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { alreadyPending: false, success: true, rechargeId: newRef.id };
  });

  if (created.alreadyPending) {
    return created;
  }

  childLog.info({ rechargeId: created.rechargeId }, 'Recharge request created');
  notifyNewRechargeOnce(created.rechargeId).catch((err) => {
    childLog.warn({ err }, 'Post-write recharge notification failed');
  });
  return { success: true, rechargeId: created.rechargeId };
}

async function processRecharge(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated process recharge attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: userTenantId } = await getUserRole(context.auth.uid);
  const uid = context.auth.uid;

  const childLog = log.child({ uid, role, tenantId: userTenantId, operation: 'processRecharge' });
  setTenantContext(userTenantId);
  setUserContext(uid);

  if (role !== 'superadmin' && role !== 'admin') {
    childLog.warn('Non-admin attempted to process recharge');
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { rechargeId, action, reason } = data;

  if (!rechargeId || !action) {
    childLog.warn('Missing required parameters');
    throw new HttpsError('invalid-argument', 'rechargeId y action son requeridos');
  }

  if (action !== 'approve' && action !== 'reject') {
    childLog.warn({ action }, 'Invalid recharge action');
    throw new HttpsError('invalid-argument', 'Acción no válida', { code: 'ACCION_INVALIDA' });
  }

  const rechargeRef = db.collection('recharges').doc(rechargeId);
  const rechargeDoc = await rechargeRef.get();

  if (!rechargeDoc.exists) {
    childLog.warn('Recharge not found');
    throw new HttpsError('not-found', 'Recarga no encontrada');
  }

  const rechargeData = rechargeDoc.data();

  if (role !== 'superadmin') {
    const customerSnap = await db.collection('customers').doc(rechargeData.userId).get();
    if (!customerSnap.exists || userTenantId !== customerSnap.data().tenantId) {
      childLog.warn({ rechargeTenantId: rechargeData.tenantId, userTenantId }, 'Tenant mismatch for recharge');
      throw new HttpsError('permission-denied', 'No tiene acceso a esta recarga');
    }
  }

  if (action === 'approve' && !isValidRechargeAmount(rechargeData.amount)) {
    childLog.warn({ rechargeId, amount: rechargeData.amount }, 'Recharge amount out of bounds, approval blocked');
    throw invalidAmountError();
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  childLog.info({ rechargeId, action, newStatus }, 'Processing recharge');

  const updateData = {
    status: newStatus,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: uid,
  };
  if (action === 'reject' && reason) {
    updateData.rejectedReason = reason;
  }
  await rechargeRef.update(updateData);

  // Lock de dedupe (L1): el doc verdad es la recarga; limpiar el puntero
  // mantiene `recharge_locks` acorde. Best-effort: el create re-verifica
  // el estado real del doc apuntado (self-healing) si el delete falla.
  await db.collection('recharge_locks').doc(rechargeData.userId).delete().catch((err) => {
    childLog.warn({ err }, 'Recharge lock cleanup failed (non-fatal)');
  });

  if (action === 'approve') {
    const customerRef = db.collection('customers').doc(rechargeData.userId);
    await customerRef.update({
      balance: admin.firestore.FieldValue.increment(rechargeData.amount)
    });
    childLog.info({ userId: rechargeData.userId, amount: rechargeData.amount }, 'Balance updated for approved recharge');
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
    const msg = `${icon} <b>Recarga ${label}</b>\n\n👤 <b>Cliente:</b> ${rechargeData.customerName || 'N/A'}\n📞 <b>Teléfono:</b> ${rechargeData.customerPhone || '—'}\n💵 <b>Monto:</b> $${(rechargeData.amount || 0).toLocaleString('es-CO')} COP\n🆔 <b>ID:</b> ${rechargeId || ''}\n👤 <b>Procesado por:</b> ${context.auth.token.email || 'Admin'}${extra}`;
    sendTelegramAdminNotification(rechargeTenantId, msg);
    childLog.info({ tenantId: rechargeTenantId }, 'Telegram notification sent for processed recharge');
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
    childLog.info({ customerEmail }, 'Email notification sent for processed recharge');
  }

  childLog.info({ rechargeId, newStatus }, 'Recharge processed successfully');
  return { success: true, status: newStatus };
}

async function checkRechargePayment(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated check recharge payment attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { rechargeId } = data;
  const uid = context.auth.uid;

  const childLog = log.child({ uid, rechargeId, operation: 'checkRechargePayment' });
  setUserContext(uid);

  if (!rechargeId) {
    childLog.warn('Missing rechargeId parameter');
    throw new HttpsError('invalid-argument', 'rechargeId es requerido');
  }

  const rechargeRef = db.collection('recharges').doc(rechargeId);
  const rechargeDoc = await rechargeRef.get();

  if (!rechargeDoc.exists) {
    childLog.warn('Recharge not found');
    return { found: false, processed: false, status: null, message: 'Recarga no encontrada' };
  }

  const rechargeData = rechargeDoc.data();

  const isOwner = rechargeData.userId === uid || rechargeData.resellerId === uid;
  if (!isOwner) {
    const { role, tenantId: callerTenantId } = await getUserRole(uid);
    const isAdminOfTenant = role === 'admin' && !!callerTenantId && callerTenantId === rechargeData.tenantId;
    if (role !== 'superadmin' && !isAdminOfTenant) {
      childLog.warn({ rechargeId, uid }, 'Unauthorized recharge poll');
      throw new HttpsError('permission-denied', 'No autorizado para esta operación', { code: 'NO_AUTORIZADO' });
    }
  }

  childLog.info({ status: rechargeData.status }, 'Checking recharge payment');

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

  const tenantId = rechargeData.tenantId;
  if (tenantId) {
    childLog.info({ tenantId }, 'Checking IMAP for payment confirmation');
    setTenantContext(tenantId);
    try {
      const configDoc = await db.collection('tenants').doc(tenantId)
        .collection('secrets').doc('emailConfigPayments').get();
      
      if (configDoc.exists) {
        let client = null;
        try {
          childLog.info('Getting IMAP connection from pool');
          client = await imapPool.getConnection(tenantId, 'emailConfigPayments');
          const lock = await client.getMailboxLock('INBOX');
          try {
            const since = new Date(Date.now() - 30 * 60 * 1000);
            const messages = await client.search({ since });
            
            childLog.info({ messageCount: messages.length }, 'Emails found in IMAP search');

            for (const uid of messages.slice(-10)) {
              const msg = await client.fetchOne(uid, { source: true });
              if (!msg?.source?.toString()) continue;
              
              const source = msg.source.toString();
              const body = extractEmailBody(source);
              const result = matchPayment(body, rechargeData.customerName || '', rechargeData.amount || 0);
              
              if (result && result.nameOk && result.amountOk) {
                if (!isValidRechargeAmount(rechargeData.amount)) {
                  childLog.warn({ rechargeId, amount: rechargeData.amount }, 'Recharge amount out of bounds, skipping IMAP auto-approve');
                  continue;
                }

                childLog.info({ emailUid: uid, matchedName: result.matchedName, emailAmount: result.emailAmount }, 'Payment matched in email');

                await rechargeRef.update({
                  status: 'approved',
                  emailUid: String(uid),
                  processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                await db.collection('recharge_locks').doc(rechargeData.userId).delete().catch((imapErr) => {
                  childLog.warn({ err: imapErr }, 'Recharge lock cleanup failed after IMAP auto-approve (non-fatal)');
                });

                const customerRef = db.collection('customers').doc(rechargeData.userId);
                await customerRef.update({
                  balance: admin.firestore.FieldValue.increment(rechargeData.amount)
                });

                const msgTelegram = `✅ <b>Recarga Aprobada Automáticamente</b>\n\n👤 <b>Cliente:</b> ${rechargeData.customerName || 'N/A'}\n💵 <b>Monto:</b> $${(rechargeData.amount || 0).toLocaleString('es-CO')} COP\n📧 <b>Email detectado:</b> ${result.matchedName}`;
                sendTelegramAdminNotification(tenantId, msgTelegram);

                // Email al cliente — paridad golden con processRecharge (approved).
                // allSettled: un fallo de SMTP NUNCA tumba el auto-approve.
                await Promise.allSettled([
                  (async () => {
                    const autoCustomerDoc = await db.collection('customers').doc(rechargeData.userId).get();
                    const autoCustomerEmail = autoCustomerDoc.exists ? autoCustomerDoc.data().email || '' : '';
                    if (!autoCustomerEmail) return null;
                    const autoNewBalance = autoCustomerDoc.exists ? (autoCustomerDoc.data().balance || 0) : 0;
                    const autoEmailHtml = buildRechargeApprovedEmail({ amount: rechargeData.amount, newBalance: autoNewBalance });
                    return sendEmail(tenantId, autoCustomerEmail, 'Recarga Aprobada', autoEmailHtml);
                  })(),
                ]);

                childLog.info({ rechargeId, newStatus: 'approved' }, 'Recharge auto-approved via IMAP');

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
          }
        } finally {
          if (client) {
            imapPool.releaseConnection(tenantId, client);
            childLog.debug('IMAP connection released');
          }
        }
      } else {
        // Tenant sin buzón de pagos configurado. No es error del poll: la
        // recarga queda pending y el front reintenta.
        childLog.info(
          { tenantId, doc: `tenants/${tenantId}/secrets/emailConfigPayments` },
          'Configuración de correo no encontrada para esta tienda'
        );
      }
    } catch (err) {
      childLog.error({ err: err }, 'Error verifying payment via IMAP');
    }
  }

  childLog.info('No payment found, recharge remains pending');
  return {
    found: true,
    processed: false,
    status: 'pending',
    message: 'Recarga pendiente de aprobación.'
  };
}

async function getRechargeHistory(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated get recharge history attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role } = await getUserRole(context.auth.uid);
  const uid = context.auth.uid;

  const childLog = log.child({ uid, role, operation: 'getRechargeHistory' });
  setUserContext(uid);

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
      processedAt: toIsoTimestamp(d.processedAt),
      createdAt: toIsoTimestamp(d.createdAt),
      rejectedReason: d.rejectedReason || null,
      emailUid: d.emailUid || null,
      resellerId: d.resellerId || null,
    };
  };

  let recharges = [];

  if (role === 'customer') {
    const snap = await db.collection('recharges')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    recharges = snap.docs.map(mapDoc);
  } else {
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

  childLog.info({ count: recharges.length }, 'Recharge history retrieved');
  return { success: true, recharges };
}

module.exports = { createRechargeRequest, processRecharge, checkRechargePayment, getRechargeHistory };