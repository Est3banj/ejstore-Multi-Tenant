const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

const db = admin.firestore();

// ========== CONFIG - Secrets (env vars) ==========
// IMPORTANTE: Configurar en Firebase Console > Functions > Environment Configuration
// Desarrollo: Usar procesos.env
// Producción: firebase functions:config:set telegram.bot_token="TOKEN" telegram.admin_chat_id="CHAT_ID"
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || functions.config().telegram?.bot_token;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || functions.config().telegram?.admin_chat_id;

// Warn en desarrollo
if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.warn('⚠️ Telegram config no encontrada. Usar: firebase functions:config:set telegram.bot_token="TOKEN" telegram.admin_chat_id="CHAT_ID"');
}

// ========== FEATURE FLAGS ==========
// Para deshabilitar Telegram sin eliminar código, cambiar a false
// firebase functions:config:set notifications.enable_telegram="false"
const ENABLE_TELEGRAM_NOTIFICATIONS = process.env.ENABLE_TELEGRAM_NOTIFICATIONS !== 'false'
  && (functions.config().notifications?.enable_telegram !== 'false');

// ========== HELPER: Obtener datos del tenant desde Firestore ==========
async function getTenantById(tenantId) {
  if (!tenantId) return null;
  try {
    const doc = await db.collection('tenants').doc(tenantId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error getting tenant:', error.message);
    return null;
  }
}

// ========== HELPER: Enviar notificación a Discord via Webhook (Embeds) ==========
// Colores Discord: Recarga=Azul(3498DB), Premio=Verde(2ECC71), Saldo=Morado(9B59B6), Test=Naranja(F39C12)
async function sendDiscordNotification(webhookUrl, embedData) {
  if (!webhookUrl) return false;
  try {
    const embed = {
      title: embedData.title,
      color: embedData.color || 0x3498DB,
      fields: embedData.fields || [],
      timestamp: new Date().toISOString(),
      footer: { text: 'EJStore - Sistema de Notificaciones' }
    };

    if (embedData.description) {
      embed.description = embedData.description;
    }

    await axios.post(webhookUrl, {
      embeds: [embed],
      username: 'EJStore Notificaciones',
      avatar_url: 'https://ejstore-web.web.app/logoej.jpg'
    });

    return true;
  } catch (error) {
    console.error('Error sending Discord notification:', error.message);
    return false; // Nunca tirar error que afecte al usuario
  }
}

// ========== BOOTSTRAP - Crear primer superadmin ==========
// Solo funciona si NO existe ningún superadmin en el sistema
// Uso: /createSuperadminBootstrap?uid=XXX&tenantId=xxx&email=xxx
exports.createSuperadminBootstrap = functions.https.onCall(async (data, context) => {
  const { uid, tenantId, email } = data;

  if (!uid || !tenantId || !email) {
    throw new functions.https.HttpsError('invalid-argument', 'uid, tenantId y email son requeridos');
  }

  // Verificar si ya existe algún superadmin
  const superadminSnap = await db.collection('users').where('role', '==', 'superadmin').limit(1).get();
  if (!superadminSnap.empty) {
    throw new functions.https.HttpsError('permission-denied', 'Ya existe un superadmin. Use setTenantClaims');
  }

  try {
    // Setear custom claims
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: 'superadmin'
    });

    // Crear documento en Firestore
    await db.collection('users').doc(uid).set({
      tenantId,
      role: 'superadmin',
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, message: 'Superadmin creado correctamente' };
  } catch (error) {
    console.error('Error bootstrap:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== HELPER: Enviar mensaje a Telegram ==========
async function sendTelegramMessage(chatId, text, keyboard = null) {
  try {
    const payload = { chat_id: chatId, text };
    if (keyboard) {
      payload.reply_markup = keyboard;
    }
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}

// ========== NOTIFICAR PREMIO GANADO ==========
exports.notifyPrizeWon = functions.https.onCall(async (data, context) => {
  const { userName, phone, prize, prizeId, tenantId } = data;

  // No enviar notificación si es "nada"
  if (prizeId === 'nothing') {
    return { success: true, message: 'No se notifica porque no ganó nada' };
  }

  // ========== DISCORD: Enviar notificación si el tenant tiene webhook configurado ==========
  if (tenantId) {
    const tenantData = await getTenantById(tenantId);
    if (tenantData?.discordWebhookUrl) {
      await sendDiscordNotification(tenantData.discordWebhookUrl, {
        title: '🎁 NUEVO PREMIO GANADO',
        color: 0x2ECC71, // Verde
        fields: [
          { name: '👤 Cliente', value: userName, inline: true },
          { name: '📱 WhatsApp', value: phone, inline: true },
          { name: '🎉 Premio', value: prize, inline: false },
          { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }), inline: false }
        ]
      });
    }
  }

  // ========== TELEGRAM (solo si está habilitado) ==========
  if (ENABLE_TELEGRAM_NOTIFICATIONS) {
    const message = `
🎁 *NUEVO GANADOR*
━━━━━━━━━━━━━━━━
👤 *Nombre:* ${userName}
📱 *WhatsApp:* ${phone}
🎉 *Premio:* ${prize}
🕐 *Fecha:* ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
━━━━━━━━━━━━━━━━
`;

    // Crear teclado con botones para marcar como entregado
    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Marcar entregado', callback_data: `delivered_${phone}` }],
        [{ text: '❌ Descartar', callback_data: `discard_${phone}` }]
      ]
    };

    await sendTelegramMessage(ADMIN_CHAT_ID, message, keyboard);
  }

  return { success: true };
});

// ========== CREAR SOLICITUD DE RECARGA ==========
exports.createRechargeRequest = functions.https.onCall(async (data, context) => {
  // Verificar que el usuario esté autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { amount, userName, phone, customerName, customerPhone, transferProof, tenantId } = data;
  const finalUserName = userName || customerName;
  const finalPhone = phone || customerPhone;

  if (!amount || !finalUserName || !finalPhone) {
    throw new functions.https.HttpsError('invalid-argument', 'Monto, nombre y teléfono son requeridos');
  }

  const parsedAmount = parseInt(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Monto inválido');
  }

  // Crear documento de recarga
  const rechargeRef = await db.collection('recharges').add({
    userId: context.auth.uid,
    userName: finalUserName,
    phone: finalPhone,
    customerName: finalUserName,
    customerPhone: finalPhone,
    amount: parsedAmount,
    transferProof: transferProof || null,
    tenantId: tenantId || context.auth.token.tenantId || null,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

  // ========== DISCORD: Enviar notificación si el tenant tiene webhook configurado ==========
  const effectiveTenantId = tenantId || context.auth.token.tenantId;
  if (effectiveTenantId) {
    const tenantData = await getTenantById(effectiveTenantId);
    if (tenantData?.discordWebhookUrl) {
      await sendDiscordNotification(tenantData.discordWebhookUrl, {
        title: '💰 NUEVA SOLICITUD DE RECARGA',
        color: 0x3498DB, // Azul
        fields: [
          { name: '👤 Cliente', value: finalUserName, inline: true },
          { name: '📱 WhatsApp', value: finalPhone, inline: true },
          { name: '💵 Monto', value: `$${parsedAmount.toLocaleString()} COP`, inline: true },
          { name: '🆔 ID Recarga', value: rechargeRef.id, inline: false },
          { name: '🕐 Fecha', value: now, inline: false }
        ]
      });
    }
  }

  // ========== TELEGRAM (solo si está habilitado) ==========
  if (ENABLE_TELEGRAM_NOTIFICATIONS) {
    const message = `
💰 *NUEVA RECARGA*
━━━━━━━━━━━━━━━━
👤 *Nombre:* ${userName}
📱 *WhatsApp:* ${phone}
💵 *Monto:* $${parsedAmount.toLocaleString()} COP
🕐 *Fecha:* ${now}
━━━━━━━━━━━━━━━━
`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Aprobar', callback_data: `approve_${rechargeRef.id}` }],
        [{ text: '❌ Rechazar', callback_data: `reject_${rechargeRef.id}` }]
      ]
    };

    await sendTelegramMessage(ADMIN_CHAT_ID, message, keyboard);
  }

  return { success: true, rechargeId: rechargeRef.id };
});

// ========== CARGAR SALDO A CLIENTE (Admin directo) ==========
exports.loadCustomerBalance = functions.https.onCall(async (data, context) => {
  // Verificar que sea admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { customerId, amount } = data;

  if (!customerId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'customerId y amount son requeridos');
  }

  const parsedAmount = parseInt(amount);
  if (isNaN(parsedAmount) || parsedAmount < 1000) {
    throw new functions.https.HttpsError('invalid-argument', 'El monto mínimo es $1,000 COP');
  }

  // Verificar que el cliente existe
  const customerRef = db.collection('customers').doc(customerId);
  const customerDoc = await customerRef.get();

  if (!customerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }

  // Usar atomic increment para evitar race conditions
  await customerRef.update({
    balance: admin.firestore.FieldValue.increment(parsedAmount)
  });

  // Registrar la transacción
  await db.collection('balanceTransactions').add({
    customerId,
    amount: parsedAmount,
    type: 'admin_load',
    processedBy: context.auth.uid,
    adminEmail: context.auth.token.email || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const customerData = customerDoc.data();

  // ========== DISCORD: Enviar notificación si el tenant tiene webhook configurado ==========
  const customerTenantId = customerData.tenantId || claims.tenantId;
  if (customerTenantId) {
    const tenantData = await getTenantById(customerTenantId);
    if (tenantData?.discordWebhookUrl) {
      await sendDiscordNotification(tenantData.discordWebhookUrl, {
        title: '💵 CARGA DE SALDO (Admin)',
        color: 0x9B59B6, // Morado
        fields: [
          { name: '👤 Cliente', value: `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim(), inline: true },
          { name: '📧 Email', value: customerData.email || '', inline: true },
          { name: '💰 Monto', value: `$${parsedAmount.toLocaleString()} COP`, inline: true },
          { name: '👤 Cargado por', value: context.auth.token.email || 'Admin', inline: false }
        ]
      });
    }
  }

  // ========== TELEGRAM (solo si está habilitado) ==========
  if (ENABLE_TELEGRAM_NOTIFICATIONS) {
    const message = `
💵 *CARGA DE SALDO*
━━━━━━━━━━━━━━━
👤 *Cliente:* ${customerData.firstName} ${customerData.lastName}
📧 *Email:* ${customerData.email}
💰 *Monto:* $${parsedAmount.toLocaleString()} COP
👤 *Cargado por:* ${context.auth.token.email}
━━━━━━━━━━━━━━━
  `;
    await sendTelegramMessage(ADMIN_CHAT_ID, message);
  }

  return { success: true, newAmount: parsedAmount };
});

// ========== TEST DISCORD WEBHOOK ==========
// Envía un mensaje de prueba al webhook de Discord del tenant
exports.testDiscordWebhook = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { webhookUrl } = data;
  if (!webhookUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'webhookUrl es requerido');
  }

  try {
    const result = await sendDiscordNotification(webhookUrl, {
      title: '🔧 Prueba de Webhook - ¡Conexión Exitosa!',
      color: 0xF39C12, // Naranja
      description: 'Este es un mensaje de prueba para verificar que la integración con Discord funciona correctamente.',
      fields: [
        { name: '📅 Fecha de prueba', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }), inline: true },
        { name: '👤 Probado por', value: context.auth.token.email || 'Admin', inline: true }
      ]
    });

    if (result) {
      return { success: true, message: 'Webhook de Discord configurado correctamente' };
    } else {
      throw new functions.https.HttpsError('internal', 'No se pudo enviar el mensaje de prueba');
    }
  } catch (error) {
    console.error('Error testing Discord webhook:', error.message);
    throw new functions.https.HttpsError('internal', 'Error al probar el webhook: ' + error.message);
  }
});

// ========== APROBAR/RECHAZAR RECARGA (Admin) ==========
exports.processRecharge = functions.https.onCall(async (data, context) => {
  // Verificar que sea admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { rechargeId, action } = data; // action: 'approve' | 'reject'

  if (!rechargeId || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'rechargeId y action son requeridos');
  }

  const rechargeRef = db.collection('recharges').doc(rechargeId);
  const rechargeDoc = await rechargeRef.get();

  if (!rechargeDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Recarga no encontrada');
  }

  const rechargeData = rechargeDoc.data();
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Actualizar estado
  await rechargeRef.update({
    status: newStatus,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: context.auth.uid
  });

  // Si se aprueba, actualizar saldo del usuario
  if (action === 'approve') {
    const customerRef = db.collection('customers').doc(rechargeData.userId);
    await customerRef.update({
      balance: admin.firestore.FieldValue.increment(rechargeData.amount)
    });
  }

  // Notificar al usuario por Telegram
  const statusText = action === 'approve' ? '✅ Aprobada' : '❌ Rechazada';
  const userMessage = `Tu recarga de $${rechargeData.amount.toLocaleString()} COP ha sido ${statusText.toLowerCase()}.`;

  if (rechargeData.phone) {
    // Enviar mensaje al usuario (si tiene Telegram linked, si no solo guardamos en Firestore)
    await db.collection('notifications').add({
      userId: rechargeData.userId,
      type: 'recharge_status',
      message: userMessage,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return { success: true, status: newStatus };
});

// ========== TELEGRAM WEBHOOK ==========
// Maneja callbacks (premios, recargas) y comandos de texto (approve/reject admin)
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  const update = req.body;

  // ========== CALLBACKS (botones inline) ==========
  if (update.callback_query) {
    const callbackData = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;

    if (callbackData.startsWith('delivered_')) {
      const phone = callbackData.replace('delivered_', '');
      await sendTelegramMessage(chatId, `✅ Premio marcado como entregado al usuario ${phone}`);
    } else if (callbackData.startsWith('discard_')) {
      const phone = callbackData.replace('discard_', '');
      await sendTelegramMessage(chatId, `❌ Premio descartado para el usuario ${phone}`);
    } else if (callbackData.startsWith('approve_')) {
      const rechargeId = callbackData.replace('approve_', '');
      // Procesar recarga via Cloud Function internamente
      const rechargeRef = db.collection('recharges').doc(rechargeId);
      const doc = await rechargeRef.get();
      if (doc.exists) {
        const data = doc.data();
        await rechargeRef.update({
          status: 'approved',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: 'telegram'
        });
        const customerRef = db.collection('customers').doc(data.userId || data.customerId);
        await customerRef.update({ balance: admin.firestore.FieldValue.increment(data.amount) });
        await sendTelegramMessage(chatId, `✅ Recarga #${rechargeId} APROBADA\nMonto: $${data.amount.toLocaleString()}`);
      }
    } else if (callbackData.startsWith('reject_')) {
      const rechargeId = callbackData.replace('reject_', '');
      const rechargeRef = db.collection('recharges').doc(rechargeId);
      await rechargeRef.update({
        status: 'rejected',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'telegram'
      });
      await sendTelegramMessage(chatId, `❌ Recarga #${rechargeId} RECHAZADA`);
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: update.callback_query.id
    });

    res.status(200).send('OK');
    return;
  }

  // ========== TEXT COMMANDS (admin approve/reject por monto) ==========
  const message = req.body.message;
  if (!message) {
    res.status(200).send('OK');
    return;
  }

  const chatId = message.chat?.id;
  if (chatId !== ADMIN_CHAT_ID) {
    res.status(200).send('OK');
    return;
  }

  const text = message.text || '';

  let action = null;
  let amount = 0;
  let reason = '';

  if (text.startsWith('✅') || text.toLowerCase().startsWith('aprobar')) {
    action = 'approve';
    const match = text.match(/(\d+)/);
    if (match) amount = parseInt(match[1]);
  } else if (text.startsWith('❌') || text.toLowerCase().startsWith('rechazar')) {
    action = 'reject';
    reason = text.replace(/^(❌|rechazar|RECHAZAR)\s*/i, '').trim() || 'Pago no válido';
  }

  if (!action) {
    res.status(200).send('OK');
    return;
  }

  const pendingSnap = await db.collection('recharges')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  let processed = false;

  for (const doc of pendingSnap.docs) {
    const recharge = doc.data();
    const ref = doc.ref;

    if (action === 'approve' && amount > 0 && Math.abs(recharge.amount - amount) < 500) {
      await ref.update({
        status: 'approved',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'telegram'
      });
      const customerRef = db.collection('customers').doc(recharge.customerId || recharge.userId);
      await customerRef.update({ balance: admin.firestore.FieldValue.increment(recharge.amount) });
      await sendTelegramMessage(chatId, `✅ *RECARGA APROBADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName || recharge.userName}`);
      processed = true;
      break;
    } else if (action === 'reject') {
      await ref.update({
        status: 'rejected',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'telegram',
        rejectionReason: reason
      });
      await sendTelegramMessage(chatId, `❌ *RECARGA RECHAZADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName || recharge.userName}\nMotivo: ${reason}`);
      processed = true;
      break;
    }
  }

  if (!processed && action === 'approve' && amount > 0) {
    await sendTelegramMessage(chatId, `⚠️ No se encontró recarga pendiente de ~$${amount.toLocaleString()}`);
  } else if (!processed && action === 'reject') {
    await sendTelegramMessage(chatId, `⚠️ No hay recargas pendientes para rechazar`);
  }

  res.status(200).send('OK');
});

// ========== SET CUSTOM CLAIMS ==========
// Llamada desde el frontend para setear claims del usuario
exports.setTenantClaims = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { uid, tenantId, role } = data;

  if (!uid || !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'uid y tenantId son requeridos');
  }

  // Solo superadmins pueden setear claims de otros usuarios
  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin' && callerClaims.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos');
  }

  try {
    // Setear custom claims en Firebase Auth
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: role || 'admin'
    });

    // Actualizar documento en Firestore
    await db.collection('users').doc(uid).set({
      tenantId,
      role: role || 'admin',
      email: data.email || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, message: 'Claims actualizados' };
  } catch (error) {
    console.error('Error setting claims:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== CREATE TENANT ==========
// Crear un nuevo tenant (solo superadmin)
exports.createTenant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo superadmins pueden crear tenants');
  }

  const { name, subdomain, primaryColor, whatsappNumber, contactEmail } = data;

  if (!name || !subdomain) {
    throw new functions.https.HttpsError('invalid-argument', 'name y subdomain son requeridos');
  }

  try {
    const tenantRef = db.collection('tenants').doc(subdomain);
    const tenantDoc = await tenantRef.get();

    if (tenantDoc.exists) {
      throw new functions.https.HttpsError('already-exists', 'El subdomain ya existe');
    }

    await tenantRef.set({
      name,
      subdomain,
      primaryColor: primaryColor || '#E50914',
      secondaryColor: '#1A1A1A',
      whatsappNumber: whatsappNumber || '',
      contactEmail: contactEmail || '',
      isActive: true,
      discordWebhookUrl: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, tenantId: subdomain };
  } catch (error) {
    console.error('Error creating tenant:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== ON USER CREATE ==========
// Trigger cuando se crea un usuario en Auth, crear documento en users
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const { email, uid } = user;

  await db.collection('users').doc(uid).set({
    email,
    tenantId: null,
    role: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { message: 'User document created' };
});

// ========== VERIFY TENANT ACCESS ==========
// Verificar que el usuario actual tiene acceso al tenant
exports.verifyTenantAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { tenantId } = data;
  const userClaims = context.auth.token;

  if (userClaims.tenantId !== tenantId && userClaims.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este tenant');
  }

  return { valid: true };
});

// ========== MIGRATE CUSTOMERS TENANT ID ==========
// Backfill: agrega tenantId a customers existentes que no lo tienen
exports.migrateCustomersTenantId = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo superadmins pueden ejecutar migraciones');
  }

  try {
    const customersSnap = await db.collection('customers')
      .where('tenantId', '==', null)
      .get();

    let migrated = 0;
    const batch = db.batch();

    customersSnap.forEach((doc) => {
      batch.update(doc.ref, {
        tenantId: 'ej'
      });
      migrated++;
    });

    if (migrated > 0) {
      await batch.commit();
    }

    return {
      success: true,
      message: `Migración completada`,
      migratedCount: migrated
    };
  } catch (error) {
    console.error('Error migrating customers:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
