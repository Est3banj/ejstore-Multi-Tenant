const { sendTelegramAdminNotification, sendTelegramResellerNotification } = require('../telegram');
const { sendEmail, buildPurchaseEmail } = require('../email');

async function sendPurchaseNotifications({ tenantId, customerEmail, customerName, resellerId, resellerName, serviceName, credential, profileName, profilePin, price, newBalance, ticketCode, rules, hasCodeExtraction, purchaseId, quantity = 1, unitPrice = null }) {
  const promises = [];

  // Customer email
  if (customerEmail) {
    const purchaseEmailHtml = buildPurchaseEmail({
      serviceName,
      credential,
      profileName,
      profilePin,
      ticketId: ticketCode,
      rules,
    });
    promises.push(sendEmail(tenantId, customerEmail, `Compra Exitosa - ${serviceName}`, purchaseEmailHtml));
  }

  // Admin Telegram
  let purchaseMsg;
  if (quantity > 1) {
    purchaseMsg = `🏪 <b>Compra al Por Mayor</b>\n\n👤 <b>Distribuidor:</b> ${resellerName || customerName}\n📧 <b>Email:</b> ${customerEmail || '—'}\n🆔 <b>ID:</b> ${resellerId || '—'}\n📦 <b>Servicio:</b> ${serviceName}\n🔢 <b>Cantidad:</b> ${quantity}\n💵 <b>Precio unitario:</b> $${unitPrice?.toLocaleString('es-CO') || '—'} COP\n💰 <b>Total:</b> $${price.toLocaleString('es-CO')} COP\n💳 <b>Saldo restante:</b> $${newBalance.toLocaleString('es-CO')} COP\n🆔 <b>Ticket:</b> ${ticketCode}`;
  } else {
    purchaseMsg = `🛒 <b>Nueva Compra</b>\n\n👤 <b>Cliente:</b> ${customerName}\n🆔 <b>ID:</b> ${resellerId || '—'}\n📦 <b>Servicio:</b> ${serviceName}\n📧 <b>Email:</b> ${credential?.email || '—'}\n👤 <b>Perfil:</b> ${profileName || '—'}\n💵 <b>Precio:</b> $${price.toLocaleString('es-CO')} COP\n💳 <b>Saldo restante:</b> $${newBalance.toLocaleString('es-CO')} COP\n🆔 <b>Ticket:</b> ${ticketCode}`;
  }
  promises.push(sendTelegramAdminNotification(tenantId, purchaseMsg));

  // Reseller Telegram (for bulk purchases)
  if (resellerId && resellerId !== customerName) {
    promises.push(sendTelegramResellerNotification(resellerId, purchaseMsg));
  }

  await Promise.allSettled(promises);
}

async function sendBalanceLoadNotification({ tenantId, customerId, customerName, customerPhone, amount, newBalance, adminEmail, isReseller = false }) {
  const label = isReseller ? 'Subdistribuidor' : 'Cliente';
  const msg = `💵 <b>Carga de Saldo</b>\n\n👤 <b>${label}:</b> ${customerName}\n📞 <b>Teléfono:</b> ${customerPhone || '—'}\n🆔 <b>ID:</b> ${customerId}\n💰 <b>Monto:</b> $${amount.toLocaleString('es-CO')} COP\n💳 <b>Nuevo saldo:</b> $${newBalance.toLocaleString('es-CO')} COP\n👤 <b>Cargado por:</b> ${adminEmail || 'Admin'}\n🕐 <b>Fecha:</b> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;
  await sendTelegramAdminNotification(tenantId, msg);
}

async function sendTicketNotifications({ tenantId, ticketId, userName, userEmail, userRole, subject, description, serviceName, customerEmail, adminNotes, userId }) {
  const promises = [];

  // Admin notification on new ticket
  if (!adminNotes) {
    const userLabel = userRole === 'reseller' ? 'Subdistribuidor' : 'Cliente';
    const msg = `🎫 <b>Nuevo Reporte</b>\n\n👤 <b>${userLabel}:</b> ${userName}\n📧 <b>Email:</b> ${userEmail || '—'}\n🆔 <b>Ticket:</b> ${ticketId}\n📋 <b>Asunto:</b> ${subject || 'Sin asunto'}\n📝 <b>Descripción:</b> ${(description || '').substring(0, 300)}\n📦 <b>Servicio:</b> ${serviceName || '—'}\n📧 <b>Email servicio:</b> ${customerEmail || '—'}`;
    promises.push(sendTelegramAdminNotification(tenantId, msg));
  }

  // Notifications on ticket resolved
  if (adminNotes) {
    const msg = `✅ <b>Tu reporte fue respondido</b>\n\n🆔 <b>Ticket:</b> ${ticketId}\n📋 <b>Asunto:</b> ${subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${adminNotes.substring(0, 300)}`;

    if (userRole === 'reseller') {
      promises.push(sendTelegramResellerNotification(userId, msg));
    }

    if (tenantId) {
      const userLabel = userRole === 'reseller' ? 'Subdistribuidor' : 'Cliente';
      const adminMsg = `✅ <b>Reporte Resuelto</b>\n\n👤 <b>${userLabel}:</b> ${userName || userEmail || 'Desconocido'}\n🆔 <b>Ticket:</b> ${ticketId}\n📋 <b>Asunto:</b> ${subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${adminNotes.substring(0, 200)}`;
      promises.push(sendTelegramAdminNotification(tenantId, adminMsg));
    }

    // Email to user
    const recipientEmail = userEmail || customerEmail;
    if (recipientEmail) {
      const { buildTicketResponseEmail } = require('../email');
      const emailHtml = buildTicketResponseEmail({
        ticketId,
        response: adminNotes,
      });
      promises.push(sendEmail(tenantId, recipientEmail, 'Ticket Respondido - ' + ticketId, emailHtml));
    }
  }

  await Promise.allSettled(promises);
}

module.exports = {
  sendPurchaseNotifications,
  sendBalanceLoadNotification,
  sendTicketNotifications,
};