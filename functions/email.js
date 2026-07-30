const { functions, admin, db, axios } = require('./config');
const { getUserRole } = require('./auth');
const nodemailer = require('nodemailer');

async function getSmtpConfig(tenantId) {
  try {
    const doc = await db.collection('tenants').doc(tenantId).collection('secrets').doc('smtp').get();
    if (doc.exists) return doc.data();
  } catch (_) {}
  return null;
}

async function getTenantSettings(tenantId) {
  try {
    const doc = await db.collection('tenants').doc(tenantId).get();
    if (doc.exists) {
      const data = doc.data();
      return {
        name: data.name || 'Mi Tienda',
        logoUrl: data.logoUrl || '',
        primaryColor: data.primaryColor || '#3B82F6',
        contactEmail: data.contactEmail || '',
      };
    }
  } catch (_) {}
  return { name: 'Mi Tienda', logoUrl: '', primaryColor: '#3B82F6', contactEmail: '' };
}

function buildEmail(content, tenantSettings) {
  const { name, logoUrl, primaryColor, contactEmail } = tenantSettings;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body,table,td{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
@media only screen and (max-width:600px){
  .main-table{width:100%!important}
  .inner-padding{padding:20px 16px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:24px 12px">
<table class="main-table" role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
<tr><td style="background:${primaryColor};padding:24px 20px;text-align:center">
${logoUrl ? `<img src="${logoUrl}" style="max-height:48px;margin-bottom:8px" alt="${name}" />` : ''}
<h1 style="color:#fff;margin:0;font-size:20px;font-weight:600">${name}</h1>
</td></tr>
<tr><td class="inner-padding" style="padding:32px 30px;font-size:15px;line-height:1.6;color:#374151">${content}</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb">
${name} &mdash; Todos los derechos reservados<br/>
${contactEmail ? `Contacto: <a href="mailto:${contactEmail}" style="color:#6b7280;text-decoration:none">${contactEmail}</a>` : ''}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildPurchaseEmail(data) {
  const { serviceName, credential, profileName, profilePin, expirationDate, ticketId, rules } = data;
  const fecha = formatDate();
  return `
<table style="width:100%;border-spacing:0">
<tr><td style="text-align:center;padding:0 0 5px">
<span style="display:inline-block;width:50px;height:50px;line-height:50px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:20px;font-weight:bold">EJ</span>
</td></tr>
<tr><td style="text-align:center;padding:0 0 15px">
<h2 style="margin:0;color:#16a34a;font-size:22px">Compra Exitosa</h2>
<p style="color:#6b7280;font-size:14px;margin:5px 0 0">Gracias por tu compra. Estos son los datos de tu servicio:</p>
</td></tr>
<tr><td>
<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden">
<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Servicio</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb">${serviceName}</td></tr>
<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Ticket</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb;font-family:monospace">${ticketId}</td></tr>
<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Usuario</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb">${credential?.email || credential?.user || ''}</td></tr>
<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Contrase&#241;a</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb;font-family:monospace">${credential?.password || ''}</td></tr>
${profileName ? `<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Perfil</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb">${profileName}</td></tr>` : ''}
${profilePin ? `<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">PIN</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb;font-family:monospace">${profilePin}</td></tr>` : ''}
${expirationDate ? `<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px;border-bottom:1px solid #e5e7eb">Vence</td>
<td style="padding:10px 16px;color:#111;font-size:14px;border-bottom:1px solid #e5e7eb">${expirationDate}</td></tr>` : ''}
<tr><td style="padding:10px 16px;background:#f3f4f6;font-weight:600;color:#374151;font-size:13px">Comprado</td>
<td style="padding:10px 16px;color:#111;font-size:14px">${fecha}</td></tr>
</table>
</td></tr>
${rules ? `<tr><td style="padding:15px 0 0">
<div style="background:#fffbeb;border:1px solid #fde68a;padding:14px;border-radius:8px;color:#92400e;font-size:13px;line-height:1.5">
<strong style="display:block;margin-bottom:6px">Reglas de uso:</strong>
${rules.replace(/\n/g, '<br/>')}
</div>
</td></tr>` : ''}
<tr><td style="padding:15px 0 0;color:#6b7280;font-size:14px;text-align:center;line-height:1.5">
No compartas estas credenciales con nadie.<br/>
Si ten&#233;s alg&#250;n problema, contactanos desde la secci&#243;n de tickets en tu panel.
</td></tr>
</table>`;
}

function formatDate() {
  return new Date().toLocaleDateString('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function buildRechargeApprovedEmail(data) {
  const fecha = formatDate();
  return `
<table style="width:100%;border-spacing:0">
<tr><td style="text-align:center;padding:0 0 5px">
<span style="display:inline-block;width:50px;height:50px;line-height:50px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:20px;font-weight:bold">EJ</span>
</td></tr>
<tr><td style="text-align:center;padding:0 0 15px">
<h2 style="margin:0;color:#16a34a;font-size:22px">Recarga Aprobada</h2>
</td></tr>
<tr><td>
<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px">
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Monto</span><br/>
<span style="color:#111;font-size:18px;font-weight:bold">$${data.amount?.toLocaleString('es-CO')} COP</span>
</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Nuevo saldo</span><br/>
<span style="color:#111;font-size:16px;font-weight:600">$${data.newBalance?.toLocaleString('es-CO')} COP</span>
</td></tr>
<tr><td style="padding:12px 16px">
<span style="color:#6b7280;font-size:13px">Procesado</span><br/>
<span style="color:#111;font-size:14px">${fecha}</span>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:15px 0 0;color:#6b7280;font-size:14px;text-align:center">
Ya pod&#233;s usar tu saldo para comprar servicios en nuestra tienda.
</td></tr>
</table>`;
}

function buildRechargeRejectedEmail(data) {
  const fecha = formatDate();
  return `
<table style="width:100%;border-spacing:0">
<tr><td style="text-align:center;padding:0 0 5px">
<span style="display:inline-block;width:50px;height:50px;line-height:50px;border-radius:50%;background:#fef2f2;color:#dc2626;font-size:20px;font-weight:bold">EJ</span>
</td></tr>
<tr><td style="text-align:center;padding:0 0 15px">
<h2 style="margin:0;color:#dc2626;font-size:22px">Recarga Rechazada</h2>
</td></tr>
<tr><td>
<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px">
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Monto</span><br/>
<span style="color:#111;font-size:18px;font-weight:bold">$${data.amount?.toLocaleString('es-CO')} COP</span>
</td></tr>
${data.reason ? `<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Motivo</span><br/>
<span style="color:#dc2626;font-size:14px">${data.reason}</span>
</td></tr>` : ''}
<tr><td style="padding:12px 16px">
<span style="color:#6b7280;font-size:13px">Procesado</span><br/>
<span style="color:#111;font-size:14px">${fecha}</span>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:15px 0 0;color:#6b7280;font-size:14px;text-align:center">
Si cre&#233;s que esto es un error, contactanos desde la secci&#243;n de tickets.
</td></tr>
</table>`;
}

function buildTicketResponseEmail(data) {
  const fecha = formatDate();
  return `
<table style="width:100%;border-spacing:0">
<tr><td style="text-align:center;padding:0 0 5px">
<span style="display:inline-block;width:50px;height:50px;line-height:50px;border-radius:50%;background:#eff6ff;color:#2563eb;font-size:20px;font-weight:bold">EJ</span>
</td></tr>
<tr><td style="text-align:center;padding:0 0 15px">
<h2 style="margin:0;color:#2563eb;font-size:22px">Ticket Respondido</h2>
</td></tr>
<tr><td>
<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px">
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Ticket</span><br/>
<span style="color:#111;font-size:16px;font-weight:600">${data.ticketId}</span>
</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
<span style="color:#6b7280;font-size:13px">Respuesta</span><br/>
<div style="background:#eff6ff;border:1px solid #bfdbfe;padding:12px;border-radius:6px;margin-top:6px;color:#1e40af;font-size:14px;line-height:1.5">
${data.response}
</div>
</td></tr>
<tr><td style="padding:12px 16px">
<span style="color:#6b7280;font-size:13px">Respondido</span><br/>
<span style="color:#111;font-size:14px">${fecha}</span>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:15px 0 0;color:#6b7280;font-size:14px;text-align:center">
Pod&#233;s ver el detalle completo desde tu panel en la secci&#243;n de tickets.
</td></tr>
</table>`;
}

async function sendEmail(tenantId, to, subject, htmlContent) {
  try {
    const smtpConfig = await getSmtpConfig(tenantId);
    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
      console.warn(`[email] SMTP not configured for tenant ${tenantId}`);
      return;
    }

    const tenantSettings = await getTenantSettings(tenantId);
    const fullHtml = buildEmail(htmlContent, tenantSettings);

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: smtpConfig.port === 465,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });

    await transporter.sendMail({
      from: smtpConfig.from || `"${tenantSettings.name}" <${smtpConfig.user}>`,
      to,
      subject,
      html: fullHtml,
    });

    console.log(`[email] Sent "${subject}" to ${to} for tenant ${tenantId}`);
  } catch (e) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, e.message);
  }
}

// === Cloud Functions ===

const getSmtpConfigCallable = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  const { role, tenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }
  return await getSmtpConfig(tenantId);
});

const saveSmtpConfigCallable = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  const { role, tenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }
  const { host, port, user, pass, from } = data;
  if (!host || !user || !pass) {
    throw new functions.https.HttpsError('invalid-argument', 'host, user y pass son requeridos');
  }
  await db.collection('tenants').doc(tenantId).collection('secrets').doc('smtp').set({
    host, port: port || 587, user, pass, from: from || '',
  });
  return { success: true };
});

const sendTestEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  const { role, tenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const smtpConfig = await getSmtpConfig(tenantId);
  if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    throw new functions.https.HttpsError('failed-precondition', 'SMTP no está configurado');
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: smtpConfig.port === 465,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
  });

  const adminEmail = context.auth.token.email;
  if (!adminEmail) {
    throw new functions.https.HttpsError('failed-precondition', 'No se pudo obtener tu email');
  }

  try {
    await transporter.sendMail({
      from: smtpConfig.from || smtpConfig.user,
      to: adminEmail,
      subject: 'Prueba SMTP - ejstore',
      text: 'Si recibís este correo, la configuración SMTP funciona correctamente.',
      html: '<h2 style="color:#22c55e;">Prueba exitosa</h2><p>Configuración SMTP funcionando correctamente.</p>',
    });
    return { success: true, message: 'Email de prueba enviado a ' + adminEmail };
  } catch (err) {
    throw new functions.https.HttpsError('internal', 'Error al enviar: ' + (err.message || 'desconocido'));
  }
});

module.exports = { sendEmail, buildPurchaseEmail, buildRechargeApprovedEmail, buildRechargeRejectedEmail, buildTicketResponseEmail, getSmtpConfig: getSmtpConfigCallable, saveSmtpConfig: saveSmtpConfigCallable, sendTestEmail };
