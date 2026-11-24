const { admin, db, createModuleLogger } = require('../config');
const { HttpsError } = require('./httpsError');
const { sendTelegramAdminNotification, sendTelegramResellerNotification } = require('../telegram');
const { sendEmail, buildTicketResponseEmail } = require('../email');

const log = createModuleLogger('notificationTriggers');

async function notifyNewRechargeOnce(rechargeId) {
  if (!rechargeId) return { notified: false };

  const ref = db.collection('recharges').doc(rechargeId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.notifiedAt) return null;
    tx.update(ref, { notifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    return data;
  });

  if (!claimed) return { notified: false };

  const childLog = log.child({ rechargeId, operation: 'onNewRecharge' });

  let tenantId = null;
  try {
    const customerSnap = await db.collection('customers').doc(claimed.userId).get();
    if (customerSnap.exists) {
      tenantId = customerSnap.data().tenantId;
    }
  } catch (e) {
    childLog.warn({ err: e }, 'Error looking up customer for recharge notification');
  }

  if (!tenantId) {
    childLog.warn({ userId: claimed.userId }, 'No tenantId found for customer, cannot send Telegram notification');
    return { notified: false };
  }

  childLog.info({ tenantId }, 'Sending new recharge notification');

  const customerName = claimed.customerName || 'Desconocido';
  const amount = claimed.amount || 0;
  const msg = `💰 <b>Nueva Recarga Solicitada</b>\n\n👤 <b>Cliente:</b> ${customerName}\n📞 <b>Teléfono:</b> ${claimed.customerPhone || '—'}\n💵 <b>Monto:</b> $${amount.toLocaleString('es-CO')} COP\n🆔 <b>ID Recarga:</b> ${rechargeId}\n📌 <b>Estado:</b> ${claimed.status || 'pending'}\n🕐 <b>Fecha:</b> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;
  sendTelegramAdminNotification(tenantId, msg);

  return { notified: true };
}

async function notifyTicketCreatedOnce(ticketId) {
  if (!ticketId) return { notified: false };

  const ref = db.collection('tickets').doc(ticketId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || !data.tenantId) return null;
    if (data.notifiedAt) return null;
    tx.update(ref, { notifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    return data;
  });

  if (!claimed) return { notified: false };

  const userName = claimed.userName || claimed.userEmail || 'Desconocido';
  const ticketCode = claimed.purchaseId?.startsWith?.('TKT-')
    ? claimed.purchaseId
    : `TKT-${(ticketId || '').slice(0, 6).toUpperCase()}-?`;
  const userLabel = claimed.userType === 'reseller' ? 'Subdistribuidor' : 'Cliente';
  const msg = `🎫 <b>Nuevo Reporte</b>\n\n👤 <b>${userLabel}:</b> ${userName}\n📧 <b>Email:</b> ${claimed.userEmail || '—'}\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${claimed.subject || 'Sin asunto'}\n📝 <b>Descripción:</b> ${(claimed.description || '').substring(0, 300)}\n📦 <b>Servicio:</b> ${claimed.serviceName || '—'}\n📧 <b>Email servicio:</b> ${claimed.customerEmail || '—'}`;
  sendTelegramAdminNotification(claimed.tenantId, msg);

  return { notified: true };
}

async function notifyTicketResolvedOnce(ticketId) {
  if (!ticketId) return { notified: false };

  const ref = db.collection('tickets').doc(ticketId);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || data.status !== 'resolved' || !data.userId) return null;
    if (data.resolvedNotifiedAt) return null;
    tx.update(ref, { resolvedNotifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    return data;
  });

  if (!claimed) return { notified: false };

  const ticketCode = claimed.purchaseId?.startsWith?.('TKT-')
    ? claimed.purchaseId
    : `TKT-${(ticketId || '').slice(0, 6).toUpperCase()}-?`;
  const msg = `✅ <b>Tu reporte fue respondido</b>\n\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${claimed.subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${(claimed.adminNotes || '').substring(0, 300)}`;

  if (claimed.userRole === 'reseller') {
    sendTelegramResellerNotification(claimed.userId, msg);
  }

  if (claimed.tenantId) {
    const userLabel = claimed.userRole === 'reseller' ? 'Subdistribuidor' : 'Cliente';
    const adminMsg = `✅ <b>Reporte Resuelto</b>\n\n👤 <b>${userLabel}:</b> ${claimed.userName || claimed.userEmail || 'Desconocido'}\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${claimed.subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${(claimed.adminNotes || '').substring(0, 200)}`;
    sendTelegramAdminNotification(claimed.tenantId, adminMsg);
  }

  const displayId = claimed.purchaseId || ticketId;
  const recipientEmail = claimed.userEmail || claimed.customerEmail;
  if (recipientEmail) {
    const emailHtml = buildTicketResponseEmail({
      ticketId: displayId,
      response: claimed.adminNotes || '',
    });
    sendEmail(claimed.tenantId, recipientEmail, 'Ticket Respondido - ' + displayId, emailHtml);
  }

  return { notified: true };
}

async function onUsuarioCreado(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email || null;

  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();

  const payload = {};
  if (email) payload.email = email;
  if (!existing.exists) {
    payload.tenantId = null;
    payload.role = null;
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await userRef.set(payload, { merge: true });

  return { success: true };
}

async function onNuevaRecarga(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { rechargeId } = data || {};
  if (!rechargeId || typeof rechargeId !== 'string') {
    throw new HttpsError('invalid-argument', 'rechargeId es requerido');
  }
  const { notified } = await notifyNewRechargeOnce(rechargeId);
  return { success: true, notified };
}

async function onTicketCreated(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { ticketId } = data || {};
  if (!ticketId || typeof ticketId !== 'string') {
    throw new HttpsError('invalid-argument', 'ticketId es requerido');
  }
  const { notified } = await notifyTicketCreatedOnce(ticketId);
  return { success: true, notified };
}

async function onTicketUpdated(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { ticketId } = data || {};
  if (!ticketId || typeof ticketId !== 'string') {
    throw new HttpsError('invalid-argument', 'ticketId es requerido');
  }
  const { notified } = await notifyTicketResolvedOnce(ticketId);
  return { success: true, notified };
}

module.exports = {
  notifyNewRechargeOnce,
  notifyTicketCreatedOnce,
  notifyTicketResolvedOnce,
  onUsuarioCreado,
  onNuevaRecarga,
  onTicketCreated,
  onTicketUpdated,
};
