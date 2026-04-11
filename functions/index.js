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
  const { userName, phone, prize, prizeId } = data;

  // No enviar notificación si es "nada"
  if (prizeId === 'nothing') {
    return { success: true, message: 'No se notifica porque no ganó nada' };
  }

  const message = `
🎁 *NUEVO GANADOR*
━━━━━━━━━━━━━━━━
👤 *Nombre:* ${userName}
📱 *WhatsApp:* ${phone}
🎉 *Premio:* ${prize}
🕐 *Fecha:* ${new Date().toLocaleString('America/Bogota', { timeZone: 'America/Bogota' })}
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
  return { success: true };
});

// ========== CREAR SOLICITUD DE RECARGA ==========
exports.createRechargeRequest = functions.https.onCall(async (data, context) => {
  // Verificar que el usuario esté autenticado
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { amount, userName, phone, transferProof } = data;

  if (!amount || !userName || !phone) {
    throw new functions.https.HttpsError('invalid-argument', 'Monto, nombre y teléfono son requeridos');
  }

  // Crear documento de recarga
  const rechargeRef = await db.collection('recharges').add({
    userId: context.auth.uid,
    userName,
    phone,
    amount: parseInt(amount),
    transferProof: transferProof || null,
    status: 'pending', // pending, approved, rejected
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Notificar al admin por Telegram
  const message = `
💰 *NUEVA RECARGA*
━━━━━━━━━━━━━━━━
👤 *Nombre:* ${userName}
📱 *WhatsApp:* ${phone}
💵 *Monto:* $${parseInt(amount).toLocaleString()} COP
🕐 *Fecha:* ${new Date().toLocaleString('America/Bogota', { timeZone: 'America/Bogota' })}
━━━━━━━━━━━━━━━━
`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Aprobar', callback_data: `approve_${rechargeRef.id}` }],
      [{ text: '❌ Rechazar', callback_data: `reject_${rechargeRef.id}` }]
    ]
  };

  await sendTelegramMessage(ADMIN_CHAT_ID, message, keyboard);

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

  // Notificar por Telegram
  const customerData = customerDoc.data();
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

  return { success: true, newAmount: parsedAmount };
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

// ========== WEBHOOK PARA CALLBACKS DE TELEGRAM ==========
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  const update = req.body;

  // Manejar callbacks (botones presionados)
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
      // Aquí podrías llamar a la función internamente o hacer un redirect
      await sendTelegramMessage(chatId, `ℹ️ Para aprobar la recarga ${rechargeId}, hazlo desde el panel admin`);
    } else if (callbackData.startsWith('reject_')) {
      const rechargeId = callbackData.replace('reject_', '');
      await sendTelegramMessage(chatId, `ℹ️ Para rechazar la recarga ${rechargeId}, hazlo desde el panel admin`);
    }

    // Responder al callback
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: update.callback_query.id
    });
  }

  res.status(200).send('OK');
});

// ========== SET CUSTOM CLAIMS ==========
// LLamada desde el frontend para setear claims del usuario
exports.setTenantClaims = functions.https.onCall(async (data, context) => {
  // Verificar que quien llama es superadmin
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
    // Setear custom claims
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: role || 'admin'
    });

    // Crear/actualizar documento en colección users
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

  // Buscar si hay un tenant registrado para este email
  // Esta lógica puede expandirse según necesidades
  
  await db.collection('users').doc(uid).set({
    email,
    tenantId: null, // Se setea manualmente o por setTenantClaims
    role: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { message: 'User document created' };
});

// ========== VERIFY TENANT OWNER ==========
// Verificar que el usuario actual es owner del tenant
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

// ========== TELEGRAM WEBHOOK ==========
// Procesa comandos de approve/reject desde Telegram
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const update = req.body.message || req.body.callback_query;
  if (!update) {
    res.status(200).send('OK');
    return;
  }

  // Verificar que es del admin
  const chatId = update.chat?.id || update.message?.chat?.id;
  if (chatId !== ADMIN_CHAT_ID) {
    res.status(200).send('OK');
    return;
  }

  const text = update.text || '';
  
  // Parsear comando: ✅ 10000 o ❌ pago no válido
  let action = null;
  let amount = 0;
  let reason = '';
  
  if (text.startsWith('✅') || text.startsWith('aprobar') || text.startsWith('APROBAR')) {
    action = 'approve';
    // Extraer monto: "✅ 10000" o "aprobar 10000"
    const match = text.match(/(\d+)/);
    if (match) amount = parseInt(match[1]);
  } else if (text.startsWith('❌') || text.startsWith('rechazar') || text.startsWith('RECHAZAR')) {
    action = 'reject';
    reason = text.replace(/^(❌|rechazar|RECHAZAR)\s*/i, '').trim() || 'Pago no válido o no verificado';
  }

  if (!action) {
    res.status(200).send('OK');
    return;
  }

  // Buscar recargas pendientes
  const pendingSnap = await db.collection('recharges')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  let processed = false;
  
  for (const doc of pendingSnap.docs) {
    const recharge = doc.data();
    
    if (action === 'approve') {
      // Buscar coincidencia por monto
      if (amount > 0 && Math.abs(recharge.amount - amount) < 500) {
        // Aprobar
        await doc.ref.update({
          status: 'approved',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: 'telegram'
        });
        
        // Agregar saldo al cliente
        const customerRef = db.collection('customers').doc(recharge.customerId);
        const customerSnap = await customerRef.get();
        if (customerSnap.exists) {
          const currentBalance = customerSnap.data().balance || 0;
          await customerRef.update({
            balance: currentBalance + recharge.amount
          });
        }
        
        await sendTelegramMessage(chatId, `✅ *RECARGA APROBADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName}\nSaldo agregado exitosamente.`);
        processed = true;
        break;
      }
    } else if (action === 'reject') {
      // Rechazar el primero pendiente
      await doc.ref.update({
        status: 'rejected',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: 'telegram',
        rejectionReason: reason
      });
      
await sendTelegramMessage(chatId, `❌ *RECARGA RECHAZADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName}\nMotivo: ${reason}`);
      processed = true;
      break;
    }
  }

  if (!processed) {
    if (action === 'approve' && amount > 0) {
      await sendTelegramMessage(chatId, `⚠️ No se encontró recarga pendiente de ~$${amount.toLocaleString()}`);
    } else if (action === 'reject' && amount === 0) {
      await sendTelegramMessage(chatId, `⚠️ No hay recargas pendientes para rechazar`);
    }
  }

  res.status(200).send('OK');
});