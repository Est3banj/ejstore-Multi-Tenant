const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

const db = admin.firestore();

// Genera un token alfanumérico de 20 caracteres para links públicos
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ========== [DEPRECADO] Telegram config ==========
// Eliminado el 2026-06-02 — migrado a Discord.
// Las notificaciones ahora se envían vía Discord webhook desde Firestore.
// TELEGRAM_BOT_TOKEN y ADMIN_CHAT_ID ya no son necesarios.
// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || functions.config().telegram?.bot_token;
// const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || functions.config().telegram?.admin_chat_id;
// 
// // Warn en desarrollo
// if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
//   console.warn('⚠️ Telegram config no encontrada. Usar: firebase functions:config:set telegram.bot_token="TOKEN" telegram.admin_chat_id="CHAT_ID"');
// }

// ========== FEATURE FLAGS ==========
// Para deshabilitar Telegram sin eliminar código, cambiar a false
// firebase functions:config:set notifications.enable_telegram="false"
const ENABLE_TELEGRAM_NOTIFICATIONS = process.env.ENABLE_TELEGRAM_NOTIFICATIONS !== 'false'
  && (functions.config().notifications?.enable_telegram !== 'false');

// ========== HELPER: Obtener datos del tenant desde Firestore ==========
async function getTenantById(tenantId) {
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') return null;
  try {
    const doc = await db.collection('tenants').doc(tenantId.trim()).get();
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

// ========== BOOTSTRAP - Crear/Reparar documento de superadmin ==========
// Crea o repara el documento users/{uid} con rol superadmin
// Uso desde consola del browser:
//   const f = getFunctions(getApp(), 'us-central1');
//   const b = httpsCallable(f, 'createSuperadminBootstrap');
//   b({ tenantId: 'ej', email: 'tu@email.com' });
exports.createSuperadminBootstrap = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = data.uid || context.auth.uid;
  const tenantId = data.tenantId || context.auth.token.tenantId;
  const email = data.email || context.auth.token.email || context.auth.token.firebase?.identities?.email?.[0];

  if (!uid || !tenantId || !email) {
    throw new functions.https.HttpsError('invalid-argument', 'No se pudo determinar uid, tenantId o email');
  }

  try {
    // Setear custom claims (siempre)
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: 'superadmin'
    });

    // Crear o reparar documento en Firestore
    await db.collection('users').doc(uid).set({
      tenantId,
      role: 'superadmin',
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, message: `Documento users/${uid} creado/reparado con rol superadmin` };
  } catch (error) {
    console.error('Error bootstrap:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== [DEPRECADO] Telegram notification helper ==========
// Comentado el 2026-06-02 durante migración a Discord.
// Reemplazado por sendDiscordWebhook().
// Mantener comentado por 30 días. Eliminar después de verificación.
// async function sendTelegramMessage(chatId, text, keyboard = null) {
//   try {
//     const payload = { chat_id: chatId, text };
//     if (keyboard) {
//       payload.reply_markup = keyboard;
//     }
//     await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
//   } catch (error) {
//     console.error('Error sending Telegram message:', error.message);
//   }
// }

// ========== HELPER: Enviar notificación a Discord ==========
async function sendDiscordWebhook(tenantId, embedPayload) {
  try {
    const webhookSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('secrets')
      .doc('webhook')
      .get();

    if (!webhookSnap.exists || !webhookSnap.data().discordUrl) {
      console.warn(`No Discord webhook configured for tenant ${tenantId}`);
      return false;
    }

    const { discordUrl } = webhookSnap.data();
    console.log(`Sending Discord notification for tenant ${tenantId}: ${embedPayload.title}`);

    await axios.post(discordUrl, { embeds: [embedPayload] });
    console.log(`Discord notification sent successfully for tenant ${tenantId}`);
    return true;
  } catch (error) {
    console.error(`Error sending Discord notification for tenant ${tenantId}:`, error.message);
    if (error.response) {
      console.error('Discord API response:', error.response.status, error.response.data);
    }
    return false;
  }
}

// ========== SELECT PRIZE (Weighted Random) ==========
function selectPrize(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
  let random = Math.random() * totalWeight;
  let cumulative = 0;
  for (const prize of prizes) {
    cumulative += prize.probability;
    if (random <= cumulative) {
      return prize;
    }
  }
  return prizes[prizes.length - 1];
}

// ========== STOCK HELPERS (Pity System) ==========
function hasStock(prize) {
  // stock=0 o undefined = sin límite (∞)
  return prize.stock === undefined || prize.stock === null || prize.stock > 0;
}

function decrementStock(prizes, prizeId) {
  return prizes.map(p => {
    if (p.id === prizeId && p.stock && p.stock > 0) {
      return { ...p, stock: p.stock - 1 };
    }
    return p;
  });
}

function selectPrizeWithStockCheck(prizes) {
  // Usa effectiveProbability para weighted random (soporta Rule 2: Candado)
  const totalWeight = prizes.reduce((sum, p) => sum + ((p.effectiveProbability ?? p.probability) || 0), 0);

  if (totalWeight <= 0) {
    // Fallback: nadie pasa el filtro del Candado → devolver Nada
    return prizes.find(p => p.id === 'nothing') ||
      { id: 'nothing', name: 'Nada', type: 'nothing', cost: 0 };
  }

  let random = Math.random() * totalWeight;
  let cumulative = 0;

  for (const prize of prizes) {
    cumulative += prize.effectiveProbability ?? prize.probability ?? 0;
    if (random <= cumulative) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

// ========== NOTIFICAR PREMIO GANADO ==========
exports.notifyPrizeWon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { transactionId } = data;

  if (!transactionId) {
    throw new functions.https.HttpsError('invalid-argument', 'transactionId es requerido');
  }

  // Look up transaction
  const txnRef = db.collection('spinTransactions').doc(transactionId);
  const txnDoc = await txnRef.get();

  if (!txnDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Transacción no encontrada');
  }

  const txn = txnDoc.data();

  // Verify ownership
  if (txn.customerId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a esta transacción');
  }

  // Idempotency check: skip if already notified
  if (txn.notified) {
    return { success: true, notified: true };
  }

  // Skip if no real prize (solo por prizeId, prizeType puede ser null/undefined)
  if (txn.prizeId === 'nothing') {
    await txnRef.update({
      notified: true,
      notifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, notified: true };
  }

  // Look up customer info for the old format
  let customerName = 'Desconocido';
  let customerPhone = 'Sin teléfono';
  try {
    const customerSnap = await db.collection('customers').doc(txn.customerId).get();
    if (customerSnap.exists) {
      const cust = customerSnap.data();
      customerName = `${cust.firstName || ''} ${cust.lastName || ''}`.trim() || cust.email || 'Desconocido';
      customerPhone = cust.phone || 'Sin teléfono';
    }
  } catch (e) {
    console.warn('Could not look up customer for notification:', e.message);
  }

  // Send Discord notification (formato legacy que el usuario espera)
  const notified = await sendDiscordWebhook(txn.tenantId, {
    title: '🎁 NUEVO PREMIO GANADO',
    color: 0xffd700,
    fields: [
      { name: '👤 Cliente', value: customerName, inline: true },
      { name: '📱 WhatsApp', value: customerPhone, inline: true },
      { name: '🎉 Premio', value: txn.prizeName, inline: true },
      { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
    ],
    timestamp: new Date().toISOString()
  });

  // Mark as notified regardless of webhook result
  await txnRef.update({
    notified: true,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true, notified };
});

// ========== CREAR SOLICITUD DE RECARGA ==========
exports.createRechargeRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  // TODO: Add tenantId validation once tenantId is stored on recharge documents

  const { amount, customerName, customerPhone, transferProof } = data;

  if (!amount || !customerName || !customerPhone) {
    throw new functions.https.HttpsError('invalid-argument', 'Monto, nombre y teléfono son requeridos');
  }

  // Leer datos del customer (UNA SOLA VEZ para tenantId + Discord)
  let rechargeTenantId = null;
  try {
    const customerDoc = await db.collection('customers').doc(context.auth.uid).get();
    if (customerDoc.exists) {
      rechargeTenantId = customerDoc.data().tenantId || null;
    }
  } catch (_) {
    // Si falla la lectura, continuamos sin tenantId (no blocker)
  }

  // Crear documento de recarga
  const rechargeRef = await db.collection('recharges').add({
    userId: context.auth.uid,
    customerName,
    customerPhone,
    amount: parseInt(amount),
    tenantId: rechargeTenantId,
    transferProof: transferProof || null,
    status: 'pending', // pending, approved, rejected
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // [DEPRECATED] Notificación Telegram — reemplazada por Discord
  const message = `
💰 *NUEVA RECARGA*
━━━━━━━━━━━━━━━━
👤 *Nombre:* ${customerName}
📱 *WhatsApp:* ${customerPhone}
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

  // [DEPRECATED] Telegram notification removed — replaced by Discord sendDiscordWebhook()
  // await sendTelegramMessage(ADMIN_CHAT_ID, message, keyboard);

  // Notificar a Discord (no bloqueante) — rechargeTenantId ya se obtuvo arriba
  if (rechargeTenantId) {
    await sendDiscordWebhook(rechargeTenantId, {
      title: '💰 NUEVA SOLICITUD DE RECARGA',
      color: 0x00ff00,
      fields: [
        { name: '👤 Cliente', value: customerName, inline: true },
        { name: '📱 WhatsApp', value: customerPhone, inline: true },
        { name: '💵 Monto', value: `$${parseInt(amount).toLocaleString()} COP`, inline: true },
        { name: '🆔 ID Recarga', value: rechargeRef.id, inline: false },
        { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
      ],
      timestamp: new Date().toISOString()
    });
  } else {
    console.warn(`No tenantId found for customer ${context.auth.uid}, cannot send Discord notification`);
  }

  return { success: true, rechargeId: rechargeRef.id };
});

// ========== TRIGGER: NOTIFICAR NUEVA RECARGA (desde frontend) ==========
// El frontend escribe directamente a Firestore (addDoc), no pasa por
// createRechargeRequest CF. Este trigger captura los nuevos docs.
exports.onNewRecharge = functions.firestore
  .document('recharges/{rechargeId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();

    // Obtener tenantId del cliente (userId en el doc de recarga)
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
      console.warn(`No tenantId found for customer ${data.userId}, cannot send Discord notification`);
      return;
    }

    const rechargeId = context.params.rechargeId;

    await sendDiscordWebhook(tenantId, {
      title: '💰 NUEVA SOLICITUD DE RECARGA',
      color: 0x00ff00,
      fields: [
        { name: '👤 Cliente', value: data.customerName || 'Desconocido', inline: true },
        { name: '📱 WhatsApp', value: data.phone || 'Sin teléfono', inline: true },
        { name: '💵 Monto', value: `$${(data.amount || 0).toLocaleString()} COP`, inline: true },
        { name: '🆔 ID Recarga', value: rechargeId, inline: false },
        { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
      ],
      timestamp: new Date().toISOString()
    });
  });

// ========== CARGAR SALDO A CLIENTE (Admin directo) ==========
exports.loadCustomerBalance = functions.https.onCall(async (data, context) => {
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

  const customerData = customerDoc.data();
  if (claims.role !== 'superadmin' && claims.tenantId !== customerData.tenantId) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este cliente');
  }

  // Actualizar balance
  const now = new Date().toISOString();
  await customerRef.update({
    balance: (customerData.balance || 0) + parsedAmount,
    updatedAt: now,
  });

  // Registrar la transacción
  await db.collection('balanceTransactions').add({
    customerId,
    amount: parsedAmount,
    type: 'admin_load',
    processedBy: context.auth.uid,
    adminEmail: context.auth.token.email || null,
    createdAt: now,
  });

  // [DEPRECATED] Telegram notification removed — replaced by Discord sendDiscordWebhook()
  // const message = `
  // 💵 *CARGA DE SALDO*
  // ━━━━━━━━━━━━━━━
  // 👤 *Cliente:* ${customerData.firstName} ${customerData.lastName}
  // 📧 *Email:* ${customerData.email}
  // 💰 *Monto:* $${parsedAmount.toLocaleString()} COP
  // 👤 *Cargado por:* ${context.auth.token.email}
  // ━━━━━━━━━━━━━━━
  // `;
  // await sendTelegramMessage(ADMIN_CHAT_ID, message);

  // Notificar a Discord (no bloqueante)
  const adminTenantId = context.auth.token.tenantId;
  await sendDiscordWebhook(adminTenantId, {
    title: '💰 CARGA DE SALDO',
    color: 0x3498db,
    fields: [
      { name: '👤 Cliente', value: `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim() || customerData.email, inline: true },
      { name: '💵 Monto', value: `$${parsedAmount.toLocaleString()} COP`, inline: true },
      { name: '👤 Cargado por', value: context.auth.token.email || 'Admin', inline: true },
      { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
    ],
    timestamp: new Date().toISOString()
  });

  return { success: true, newAmount: parsedAmount };
});

// ========== APROBAR/RECHAZAR RECARGA (Admin) ==========
exports.processRecharge = functions.https.onCall(async (data, context) => {
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

  if (claims.role !== 'superadmin') {
    const customerSnap = await db.collection('customers').doc(rechargeData.userId).get();
    if (!customerSnap.exists || claims.tenantId !== customerSnap.data().tenantId) {
      throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a esta recarga');
    }
  }

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

  const notifPhone = rechargeData.customerPhone || rechargeData.phone;
  if (notifPhone) {
    // Enviar mensaje al usuario (si tiene Telegram linked, si no solo guardamos en Firestore)
    await db.collection('notifications').add({
      userId: rechargeData.userId,
      type: 'recharge_status',
      message: userMessage,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Notificar a Discord (no bloqueante)
  const processTenantId = context.auth.token.tenantId;
  await sendDiscordWebhook(processTenantId, {
    title: newStatus === 'approved' ? '✅ Recarga Aprobada' : '❌ Recarga Rechazada',
    color: newStatus === 'approved' ? 0x00ff00 : 0xff0000,
    fields: [
      { name: 'Usuario', value: rechargeData.customerName || 'N/A', inline: true },
      { name: 'Monto', value: `$${(rechargeData.amount || 0).toLocaleString()} COP`, inline: true },
      { name: 'Estado', value: newStatus === 'approved' ? '✅ Aprobada' : '❌ Rechazada', inline: true },
      { name: 'Procesado por', value: context.auth.token.email || 'Admin', inline: true },
      { name: 'Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
    ],
    timestamp: new Date().toISOString()
  });

  return { success: true, status: newStatus };
});

// ========== [DEPRECADO] TELEGRAM WEBHOOK ==========
// Comentado el 2026-06-02 durante migración a Discord.
// Mantener comentado por 30 días como seguro. Eliminar después de verificar
// que todas las notificaciones funcionan correctamente via Discord.
// Historial: Esta función manejaba callbacks de botones (delivered_, discard_, approve_, reject_)
// y comandos de texto (aprobar/rechazar) desde Telegram.
// exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
//   if (req.method !== 'POST') {
//     res.status(405).send('Method Not Allowed');
//     return;
//   }

//   const update = req.body;
//   if (!update) {
//     res.status(200).send('OK');
//     return;
//   }

  // ====== MANEJAR CALLBACKS (botones presionados) ======
//   if (update.callback_query) {
//     const callbackData = update.callback_query.data;
//     const chatId = update.callback_query.message.chat.id;

//     if (callbackData.startsWith('delivered_')) {
//       const phone = callbackData.replace('delivered_', '');
//       await sendTelegramMessage(chatId, `✅ Premio marcado como entregado al usuario ${phone}`);
//     } else if (callbackData.startsWith('discard_')) {
//       const phone = callbackData.replace('discard_', '');
//       await sendTelegramMessage(chatId, `❌ Premio descartado para el usuario ${phone}`);
//     } else if (callbackData.startsWith('approve_')) {
//       const rechargeId = callbackData.replace('approve_', '');
//       await sendTelegramMessage(chatId, `ℹ️ Para aprobar la recarga ${rechargeId}, hazlo desde el panel admin`);
//     } else if (callbackData.startsWith('reject_')) {
//       const rechargeId = callbackData.replace('reject_', '');
//       await sendTelegramMessage(chatId, `ℹ️ Para rechazar la recarga ${rechargeId}, hazlo desde el panel admin`);
//     }

//     await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
//       callback_query_id: update.callback_query.id
//     });

//     res.status(200).send('OK');
//     return;
//   }

  // ====== MANEJAR COMANDOS DE TEXTO ("aprobar 10000", "rechazar pago no válido") ======
//   const message = update.message;
//   if (!message) {
//     res.status(200).send('OK');
//     return;
//   }

//   const chatId = message.chat?.id;
//   if (chatId !== ADMIN_CHAT_ID) {
//     res.status(200).send('OK');
//     return;
//   }

//   const text = message.text || '';
  
//   let action = null;
//   let amount = 0;
//   let reason = '';
  
//   if (text.startsWith('✅') || text.startsWith('aprobar') || text.startsWith('APROBAR')) {
//     action = 'approve';
//     const match = text.match(/(\d+)/);
//     if (match) amount = parseInt(match[1]);
//   } else if (text.startsWith('❌') || text.startsWith('rechazar') || text.startsWith('RECHAZAR')) {
//     action = 'reject';
//     reason = text.replace(/^(❌|rechazar|RECHAZAR)\s*/i, '').trim() || 'Pago no válido o no verificado';
//   }

//   if (!action) {
//     res.status(200).send('OK');
//     return;
//   }

  // Buscar recargas pendientes
//   const pendingSnap = await db.collection('recharges')
//     .where('status', '==', 'pending')
//     .orderBy('createdAt', 'desc')
//     .limit(10)
//     .get();

//   let processed = false;
  
//   for (const doc of pendingSnap.docs) {
//     const recharge = doc.data();
    
//     if (action === 'approve') {
//       if (amount > 0 && Math.abs(recharge.amount - amount) < 500) {
//         await doc.ref.update({
//           status: 'approved',
//           processedAt: admin.firestore.FieldValue.serverTimestamp(),
//           processedBy: 'telegram'
//         });
        
//         const customerRef = db.collection('customers').doc(recharge.customerId);
//         const customerSnap = await customerRef.get();
//         if (customerSnap.exists) {
//           const currentBalance = customerSnap.data().balance || 0;
//           await customerRef.update({
//             balance: currentBalance + recharge.amount
//           });
//         }
        
//         await sendTelegramMessage(chatId, `✅ *RECARGA APROBADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName}\nSaldo agregado exitosamente.`);
//         processed = true;
//         break;
//       }
//     } else if (action === 'reject') {
//       await doc.ref.update({
//         status: 'rejected',
//         processedAt: admin.firestore.FieldValue.serverTimestamp(),
//         processedBy: 'telegram',
//         rejectionReason: reason
//       });
      
//       await sendTelegramMessage(chatId, `❌ *RECARGA RECHAZADA*\n\nMonto: $${recharge.amount.toLocaleString()}\nCliente: ${recharge.customerName}\nMotivo: ${reason}`);
//       processed = true;
//       break;
//     }
//   }

//   if (!processed) {
//     if (action === 'approve' && amount > 0) {
//       await sendTelegramMessage(chatId, `⚠️ No se encontró recarga pendiente de ~$${amount.toLocaleString()}`);
//     } else if (action === 'reject' && amount === 0) {
//       await sendTelegramMessage(chatId, `⚠️ No hay recargas pendientes para rechazar`);
//     }
//   }

//   res.status(200).send('OK');
// });

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
  if (callerClaims.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo superadmins pueden asignar permisos');
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

// ========== MIGRAR CUSTOMERS SIN tenantId ==========
// Busca customers que no tengan el campo `tenantId` y les asigna uno.
// Útil para reparar customers registrados antes de que se implementara el tenantId passthrough.
// Uso desde el frontend: const result = await httpsCallable(functions, 'migrateCustomersTenantId')({ tenantId: 'ej' });
exports.migrateCustomersTenantId = functions.https.onCall(async (data, context) => {
  // Solo superadmins pueden ejecutar migración
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo superadmins pueden migrar customers');
  }

  const { tenantId } = data;
  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  try {
    // Buscar customers que NO tengan el campo tenantId
    // Firestore no soporta "field does not exist" directamente, así que:
    // 1. Traemos todos los customers
    // 2. Filtramos los que no tienen tenantId o lo tienen vacío
    const customersSnap = await db.collection('customers').get();
    const batch = db.batch();
    let updatedCount = 0;

    customersSnap.forEach(doc => {
      const data = doc.data();
      // Si no tiene tenantId, está vacío, o es null, asignarle el tenantId
      if (!data.tenantId || data.tenantId === '' || data.tenantId === null) {
        batch.update(doc.ref, { 
          tenantId,
          migratedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    return {
      success: true,
      message: `Migración completada: ${updatedCount} customers actualizados con tenantId "${tenantId}"`,
      updatedCount
    };
  } catch (error) {
    console.error('Error migrating customers:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== PROCESS SPIN ==========
exports.processSpin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const tenantId = data.tenantId || context.auth.token.tenantId;

  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  try {
    // Atomic transaction — TODO DENTRO para consistencia (stock, config, balance juntos)
    const result = await db.runTransaction(async (transaction) => {
      const customerRef = db.collection('customers').doc(uid);
      const spinDataRef = db.collection('customers').doc(uid).collection('spinData').doc('default');
      const configRef = db.collection('rouletteConfig').doc(tenantId);

      const [customerDoc, spinDataDoc, configDoc] = await Promise.all([
        transaction.get(customerRef),
        transaction.get(spinDataRef),
        transaction.get(configRef),
      ]);

      if (!customerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
      }

      if (!configDoc.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'Ruleta no configurada para este tenant');
      }

      const customer = customerDoc.data();
      const config = configDoc.data();
      const spinData = spinDataDoc.exists ? spinDataDoc.data() : {};

      // Rate limiting: 3s cooldown entre giros
      const lastUpdated = spinData.updatedAt;
      if (lastUpdated) {
        const elapsed = Date.now() - new Date(lastUpdated).getTime();
        if (elapsed < 3000) {
          throw new functions.https.HttpsError('failed-precondition', 'Debe esperar antes de girar de nuevo');
        }
      }

      // Max spins per minute (10/min)
      const spinTimestamps = spinData.spinTimestamps || [];
      const oneMinuteAgo = Date.now() - 60000;
      const recentTimestamps = spinTimestamps.filter(ts => ts > oneMinuteAgo);
      if (recentTimestamps.length >= 10) {
        throw new functions.https.HttpsError('failed-precondition', 'Demasiados giros por minuto');
      }

      if (!config.isEnabled) {
        throw new functions.https.HttpsError('failed-precondition', 'Ruleta deshabilitada');
      }

      // ===== FREE SPIN LOGIC (paidSpinsCount acumulativo) =====
      const paidSpinsCount = spinData.paidSpinsCount || 0;
      const spinsNeeded = config.spinsForFreeSpin || 3;
      const spinType = paidSpinsCount >= spinsNeeded ? 'free' : 'paid';
      const price = spinType === 'free' ? 0 : (config.pricePerSpin ?? 1000);
      const newPaidSpinsCount = spinType === 'free' ? 0 : paidSpinsCount + 1;

      // Verify balance
      if (customer.balance < price) {
        throw new functions.https.HttpsError('failed-precondition', 'Saldo insuficiente');
      }

      const balanceBefore = customer.balance || 0;
      const balanceAfter = balanceBefore - price;
      // Usar FieldValue.increment para operación atómica (más robusto contra race conditions)
      transaction.update(customerRef, { balance: admin.firestore.FieldValue.increment(-price) });

      // ===== DAILY TRACKING =====
      const today = new Date().toISOString().split('T')[0];
      const lastSpinDate = spinData.lastSpinDate || '';
      const isNewDay = lastSpinDate !== today;

      const spinsPaidToday = isNewDay ? 0 : (spinData.spinsPaidToday || 0);
      const spinsFreeToday = isNewDay ? 0 : (spinData.spinsFreeToday || 0);

      // Daily spending limit check
      const dailySpendingLimit = config.dailySpendingLimit || Infinity;
      if (spinType === 'paid' && dailySpendingLimit !== Infinity) {
        const spentToday = spinsPaidToday * price;
        if (spentToday + price > dailySpendingLimit) {
          throw new functions.https.HttpsError('failed-precondition', 'Límite diario de gasto alcanzado');
        }
      }

      // ===== PITY SYSTEM =====
      const totalGastado = spinData.totalGastadoEnRuleta || 0;
      const updatedTotalGastado = totalGastado + price;

      // Filter active prizes
      let prizes = (config.prizes || []).filter(p => p.isActive !== false);

      if (prizes.length === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'No hay premios activos');
      }

      // Make mutable copies
      prizes = prizes.map(p => ({ ...p }));
      let selectedPrize;
      let pityMode = 'none'; // 'none' | 'garantizado' | 'azar'
      let gastadoDeduction = 0;

      // ---- RULE 1: GARANTIZADO (Fuerza Bruta) ----
      // Si totalGastado >= 200% del costo de algún premio CON stock → auto-win
      selectedPrize = prizes.find(p =>
        p.cost > 0 &&
        updatedTotalGastado >= p.cost * 2 &&
        hasStock(p)
      );

      if (selectedPrize) {
        pityMode = 'garantizado';
        gastadoDeduction = selectedPrize.cost * 2;
        // Decrement stock
        prizes = decrementStock(prizes, selectedPrize.id);
      }

      // ---- RULE 2 + 3: CANDADO + AZAR REAL ----
      if (!selectedPrize) {
        // Rule 2: Candado — si totalGastado < costo del premio, prob = 0%
        const filteredPrizes = prizes.map(p => ({
          ...p,
          effectiveProbability: (p.cost > 0 && updatedTotalGastado < p.cost) ? 0 : p.probability,
        }));

        // Rule 3: Azar real con weighted random
        selectedPrize = selectPrizeWithStockCheck(filteredPrizes);

        // Post-selection stock check
        if (selectedPrize.id !== 'nothing' && selectedPrize.cost > 0) {
          if (!hasStock(selectedPrize)) {
            // Sin stock → degradar a Nada, no cobrar gastado
            selectedPrize = prizes.find(p => p.id === 'nothing') ||
              { id: 'nothing', name: 'Nada', type: 'nothing', cost: 0 };
            gastadoDeduction = 0;
          } else {
            // Con stock → ganó de verdad
            pityMode = 'azar';
            gastadoDeduction = selectedPrize.cost;
            prizes = decrementStock(prizes, selectedPrize.id);
          }
        }
      }

      // Update config with new stock values
      transaction.update(configRef, { prizes });

      // Update spinData
      const updatedTimestamps = [...recentTimestamps, Date.now()];
      transaction.set(spinDataRef, {
        spinsPaidToday: spinType === 'paid' ? spinsPaidToday + 1 : spinsPaidToday,
        spinsFreeToday: spinType === 'free' ? spinsFreeToday + 1 : spinsFreeToday,
        lastSpinDate: today,
        totalSpinsPaid: (spinData.totalSpinsPaid || 0) + (spinType === 'paid' ? 1 : 0),
        totalSpinsFree: (spinData.totalSpinsFree || 0) + (spinType === 'free' ? 1 : 0),
        totalGastadoEnRuleta: Math.max(0, updatedTotalGastado - gastadoDeduction),
        paidSpinsCount: newPaidSpinsCount,
        spinTimestamps: updatedTimestamps,
        updatedAt: new Date().toISOString()
      });

      // Log transaction
      const transactionRef = db.collection('spinTransactions').doc();
      transaction.set(transactionRef, {
        customerId: uid,
        tenantId,
        prizeId: selectedPrize.id,
        prizeName: selectedPrize.name,
        prizeType: selectedPrize.type || null,
        price,
        spinType,
        balanceBefore,
        balanceAfter,
        pityMode,
        notified: false,
        createdAt: new Date().toISOString()
      });

      return {
        transactionId: transactionRef.id,
        prize: selectedPrize,
        newBalance: balanceAfter,
        spinType,
        pityMode
      };
    });

    // Notificación manejada por notifyPrizeWon desde el frontend
    // (separación de responsabilidades: processSpin solo procesa el spin)

    return {
      success: true,
      transactionId: result.transactionId,
      prize: {
        id: result.prize.id,
        name: result.prize.name,
        type: result.prize.type || 'nothing'
      },
      newBalance: result.newBalance,
      spinType: result.spinType,
      pityMode: result.pityMode
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('Error in processSpin:', error);
    throw new functions.https.HttpsError('internal', 'Error al procesar el giro');
  }
});

// ========== SET DISCORD WEBHOOK (Admin) ==========
// Guarda el webhook de Discord en tenants/{tenantId}/secrets/webhook
exports.setDiscordWebhook = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  const { tenantId, discordUrl } = data;

  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  if (claims.role !== 'superadmin' && (claims.role !== 'admin' || claims.tenantId !== tenantId)) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos para este tenant');
  }

  try {
    const webhookRef = db.collection('tenants').doc(tenantId).collection('secrets').doc('webhook');

    if (!discordUrl || discordUrl.trim() === '') {
      // Limpiar webhook si se envía URL vacía
      await webhookRef.delete();
      await db.collection('tenants').doc(tenantId).update({
        discordConfigured: false
      });
      return { success: true, configured: false };
    }

    await webhookRef.set({
      discordUrl: discordUrl.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Marcar como configurado en el tenant doc para que la UI lo lea
    await db.collection('tenants').doc(tenantId).update({
      discordConfigured: true
    });

    return { success: true, configured: true, updatedAt: new Date().toISOString() };
  } catch (error) {
    console.error('Error setting Discord webhook:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== TEST DISCORD WEBHOOK ==========
// Envía un mensaje de prueba al webhook configurado para verificar que funciona
// Acepta webhookUrl opcional para probar URLs antes de guardarlas
exports.testDiscordWebhook = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  const { tenantId, webhookUrl } = data;

  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  if (claims.role !== 'superadmin' && (claims.role !== 'admin' || claims.tenantId !== tenantId)) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos para este tenant');
  }

  try {
    let discordUrl;

    if (webhookUrl && webhookUrl.trim() !== '') {
      // Usar URL proporcionada por el frontend (antes de guardar)
      discordUrl = webhookUrl.trim();
    } else {
      // Leer webhook URL desde secrets (ya configurada)
      const webhookSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('secrets')
        .doc('webhook')
        .get();

      if (!webhookSnap.exists || !webhookSnap.data().discordUrl) {
        return { success: false, error: 'No hay webhook configurado. Ingresa una URL primero.' };
      }

      discordUrl = webhookSnap.data().discordUrl;
    }

    // Validar formato básico de URL de Discord
    if (!discordUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false, error: 'La URL no parece ser un webhook de Discord válido. Debe comenzar con https://discord.com/api/webhooks/' };
    }

    // Enviar mensaje de prueba
    await axios.post(discordUrl, {
      embeds: [{
        title: '🔧 Prueba de Conexión',
        description: '✅ Si estás viendo este mensaje, la configuración del webhook de Discord funciona correctamente.',
        color: 0x00ff00,
        footer: { text: 'EJ Store Web - Configuración' },
        timestamp: new Date().toISOString()
      }]
    });

    return { success: true, message: webhookUrl ? 'Webhook probado correctamente. No olvides guardar los cambios.' : '✅ Conexión exitosa' };
  } catch (error) {
    console.error('Error testing Discord webhook:', error.message);
    return { success: false, error: error.message };
  }
});

// ========== DEBUG DISCORD WEBHOOK ==========
// Función de diagnóstico para verificar el estado del webhook
exports.debugDiscordWebhook = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  const { tenantId } = data;
  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'tenantId es requerido');
  }

  if (claims.role !== 'superadmin' && (claims.role !== 'admin' || claims.tenantId !== tenantId)) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos para este tenant');
  }

  console.log(`🔍 Debug Discord webhook for tenant: ${tenantId}`);

  const result = {
    tenantId,
    timestamp: new Date().toISOString()
  };

  // 1. Verificar que el doc secrets/webhook existe
  const webhookSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('secrets')
    .doc('webhook')
    .get();

  result.secretDocExists = webhookSnap.exists;
  if (webhookSnap.exists) {
    result.hasDiscordUrl = !!webhookSnap.data().discordUrl;
    result.discordUrlPrefix = webhookSnap.data().discordUrl
      ? webhookSnap.data().discordUrl.substring(0, 50) + '...'
      : null;
  }

  // 2. Verificar que el tenant doc tiene discordConfigured
  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  result.tenantDocExists = tenantSnap.exists;
  if (tenantSnap.exists) {
    result.discordConfigured = tenantSnap.data().discordConfigured;
  }

  // 3. Probar sendDiscordWebhook DIRECTAMENTE
  console.log(`🔍 Testing sendDiscordWebhook for tenant ${tenantId}...`);
  try {
    const webhookResult = await sendDiscordWebhook(tenantId, {
      title: '🔬 Debug: sendDiscordWebhook directo',
      description: 'Si ves esto, sendDiscordWebhook funciona correctamente desde debugDiscordWebhook',
      color: 0x9b59b6,
      fields: [
        { name: 'Tenant', value: tenantId, inline: true },
        { name: 'Timestamp', value: result.timestamp, inline: true }
      ],
      timestamp: result.timestamp
    });
    result.sendDiscordWebhookResult = webhookResult;
    console.log(`🔍 sendDiscordWebhook result: ${webhookResult}`);
  } catch (error) {
    result.sendDiscordWebhookError = error.message;
    console.error(`🔍 sendDiscordWebhook threw:`, error.message);
  }

  return result;
});

// ========== PROCESAR COMPRA DIRECTA (Marketplace) ==========
exports.processPurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { serviceId, tenantId } = data;

  if (!serviceId || !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId y tenantId son requeridos');
  }

  // Step 1: Find an available account (outside transaction — queries can't be in transactions)
  const accountsSnapshot = await db
    .collection('services')
    .doc(serviceId)
    .collection('accounts')
    .where('status', '==', 'available')
    .limit(10)
    .get();

  if (accountsSnapshot.empty) {
    throw new functions.https.HttpsError('failed-precondition',
      'Servicio agotado, contacta al administrador'
    );
  }

  // Get account references for the transaction
  const availableAccounts = accountsSnapshot.docs.map(doc => ({
    ref: doc.ref,
    id: doc.id,
    data: doc.data()
  }));

  // Step 2: Execute transaction to atomically process the purchase
  try {
    // Leer servicio fuera de la transacción para saber si aplica URL
    const serviceRef = db.collection('services').doc(serviceId);
    const serviceDocPre = await serviceRef.get();
    const hasCodeExtraction = serviceDocPre.exists && serviceDocPre.data().hasCodeExtraction === true;

    const result = await db.runTransaction(async (transaction) => {
      // Verify customer exists and has balance
      const customerRef = db.collection('customers').doc(context.auth.uid);
      const customerDoc = await transaction.get(customerRef);

      if (!customerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
      }

      const customerData = customerDoc.data();

      if (customerData.tenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este servicio');
      }

      // Get service info (dentro de la transacción por consistencia)
      const serviceDoc = await transaction.get(serviceRef);

      if (!serviceDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
      }

      const serviceData = serviceDoc.data();
      const price = serviceData.promotionalPrice || serviceData.price;
      const currentBalance = customerData.balance || 0;

      if (currentBalance < price) {
        throw new functions.https.HttpsError('failed-precondition',
          `Saldo insuficiente. Necesitas $${price.toLocaleString()}, tenés $${currentBalance.toLocaleString()}`
        );
      }

      // Try each account until we find one that's still available
      let selectedAccount = null;
      for (const acct of availableAccounts) {
        const acctDoc = await transaction.get(acct.ref);
        if (acctDoc.exists && acctDoc.data().status === 'available') {
          selectedAccount = acct;
          break;
        }
      }

      if (!selectedAccount) {
        throw new functions.https.HttpsError('failed-precondition',
          'Servicio agotado, contacta al administrador'
        );
      }

      // --- All checks passed, execute the purchase ---

      // Deduct balance — usamos el valor ya leído dentro de la transacción
      transaction.update(customerRef, {
        balance: currentBalance - price
      });

      // Mark account as sold
      const now = new Date().toISOString();
      transaction.update(selectedAccount.ref, {
        status: 'sold',
        soldTo: context.auth.uid,
        updatedAt: now
      });

      // Create purchase document
      const purchaseRef = db.collection('purchases').doc();
      transaction.set(purchaseRef, {
        customerId: context.auth.uid,
        customerEmail: context.auth.token.email || '',
        serviceId,
        serviceName: serviceData.name,
        accountId: selectedAccount.id,
        price,
        status: 'active',
        tenantId,
        createdAt: now
      });

      // Link purchase to account
      transaction.update(selectedAccount.ref, {
        purchaseId: purchaseRef.id
      });

      return {
        purchaseId: purchaseRef.id,
        accountId: selectedAccount.id,
        credential: selectedAccount.data.credential,
        serviceName: serviceData.name,
        price,
        newBalance: currentBalance - price
      };
    });

    // ─── Generar link público si el servicio aplica ──────────────
    let linkToken;
    if (hasCodeExtraction) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      linkToken = generateToken();

      await db.collection('public_links').doc(linkToken).set({
        token: linkToken,
        resellerId: null,
        accountId: result.accountId || '',
        serviceId,
        serviceName: result.serviceName,
        purchaseId: result.purchaseId,
        accountIndex: 0,
        credential: result.credential || {},
        createdAt: now,
        expiresAt,
        status: 'active',
      });

      // Guardar token en el purchase doc
      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens: [linkToken] });
    }

    // ─── Registrar transacción de balance ─────────────────
    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId: context.auth.uid,
      amount: -result.price,
      type: 'purchase',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    // Non-blocking: Discord notification
    setTimeout(() => {
      sendDiscordWebhook(tenantId, {
        title: '🛒 NUEVA COMPRA',
        color: 0x00ff00,
        fields: [
          { name: '👤 Cliente', value: context.auth.token.email || 'Desconocido', inline: true },
          { name: '📦 Servicio', value: result.serviceName, inline: true },
          { name: '💵 Monto', value: `$${result.price.toLocaleString()} COP`, inline: true },
          { name: '🆔 Compra', value: result.purchaseId, inline: false },
          { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
        ],
        timestamp: new Date().toISOString()
      }).catch(err => console.warn('Discord notification failed:', err.message));
    }, 0);

    return {
      success: true,
      purchaseId: result.purchaseId,
      account: {
        credential: result.credential,
        serviceName: result.serviceName
      },
      newBalance: result.newBalance,
      hasCodeExtraction,
      linkToken: linkToken || null,
      message: hasCodeExtraction
        ? `✅ Compra exitosa. Accedé al link público para compartir o extraer el código.`
        : `✅ Compra exitosa. ¡Disfrutá ${result.serviceName}!`
    };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('Error in processPurchase:', error);
    throw new functions.https.HttpsError('internal', 'Error al procesar la compra. Intentalo de nuevo.');
  }
});

// ========== CREAR SUBDISTRIBUIDOR (Admin) ==========
exports.createReseller = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { email, password, name, phone, commissionPercent } = data;

  if (!email || !password || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'email, password y name son requeridos');
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, {
      tenantId: claims.tenantId,
      role: 'reseller',
      parentTenantId: claims.tenantId,
    });

    const now = new Date().toISOString();
    await db.collection('resellers').doc(userRecord.uid).set({
      uid: userRecord.uid,
      tenantId: claims.tenantId,
      email,
      name,
      phone: phone || '',
      balance: 0,
      commissionPercent: commissionPercent || 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      tenantId: claims.tenantId,
      role: 'reseller',
      createdAt: now,
    });

    return {
      success: true,
      uid: userRecord.uid,
      email,
      message: `Subdistribuidor ${name} creado exitosamente`,
    };
  } catch (error) {
    console.error('Error creating reseller:', error);
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'El email ya está registrado');
    }
    throw new functions.https.HttpsError('internal', 'Error al crear subdistribuidor');
  }
});

// ========== CARGAR SALDO A SUBDISTRIBUIDOR (Admin) ==========
exports.loadResellerBalance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { resellerId, amount } = data;

  if (!resellerId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'resellerId y amount son requeridos');
  }

  const parsedAmount = parseInt(amount);
  if (isNaN(parsedAmount) || parsedAmount < 1000) {
    throw new functions.https.HttpsError('invalid-argument', 'El monto mínimo es $1,000 COP');
  }

  try {
    const resellerRef = db.collection('resellers').doc(resellerId);
    const resellerDoc = await resellerRef.get();

    if (!resellerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Subdistribuidor no encontrado');
    }

    const resellerData = resellerDoc.data();
    if (claims.role !== 'superadmin' && claims.tenantId !== resellerData.tenantId) {
      throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este subdistribuidor');
    }

    const now = new Date().toISOString();
    const newBalance = (resellerData.balance || 0) + parsedAmount;
    await resellerRef.update({
      balance: newBalance,
      updatedAt: now,
    });

    await db.collection('balanceTransactions').add({
      customerId: resellerId,
      amount: parsedAmount,
      type: 'admin_load',
      processedBy: context.auth.uid,
      description: 'Carga de saldo a subdistribuidor',
      createdAt: now,
    });

    return { success: true, newBalance };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error loading reseller balance:', error);
    throw new functions.https.HttpsError('internal', 'Error al cargar saldo');
  }
});

// ========== COMPRA AL POR MAYOR (Subdistribuidor) ==========
exports.processBulkPurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'reseller') {
    throw new functions.https.HttpsError('permission-denied', 'Solo disponible para subdistribuidores');
  }

  const { serviceId, tenantId, quantity } = data;

  if (!serviceId || !tenantId || !quantity) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId, tenantId y quantity son requeridos');
  }

  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 1 || qty > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'La cantidad debe ser entre 1 y 50');
  }

  try {
    const resellerRef = db.collection('resellers').doc(context.auth.uid);
    const resellerDoc = await resellerRef.get();

    if (!resellerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Subdistribuidor no encontrado');
    }

    const resellerData = resellerDoc.data();
    if (!resellerData.isActive) {
      throw new functions.https.HttpsError('permission-denied', 'Subdistribuidor inactivo');
    }

    const serviceDoc = await db.collection('services').doc(serviceId).get();
    if (!serviceDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    const serviceData = serviceDoc.data();
    const hasCodeExtraction = serviceData.hasCodeExtraction === true;
    
    const basePrice = serviceData.promotionalPrice || serviceData.price;
    const wholesalePrice = serviceData.wholesalePrice 
      || Math.round(basePrice * (1 - (resellerData.commissionPercent || 0) / 100));
    
    const totalPrice = wholesalePrice * qty;
    const currentBalance = resellerData.balance || 0;

    if (currentBalance < totalPrice) {
      throw new functions.https.HttpsError('failed-precondition',
        `Saldo insuficiente. Necesitas $${totalPrice.toLocaleString()}, tenés $${currentBalance.toLocaleString()}`
      );
    }

    const accountsSnapshot = await db
      .collection('services').doc(serviceId).collection('accounts')
      .where('status', '==', 'available')
      .limit(qty)
      .get();

    if (accountsSnapshot.size < qty) {
      throw new functions.https.HttpsError('failed-precondition',
        `Stock insuficiente. Hay ${accountsSnapshot.size} cuenta(s) disponible(s), pediste ${qty}`
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshResellerDoc = await transaction.get(resellerRef);
      const freshBalance = freshResellerDoc.data().balance || 0;
      if (freshBalance < totalPrice) {
        throw new functions.https.HttpsError('failed-precondition', 'Saldo insuficiente');
      }

      transaction.update(resellerRef, {
        balance: freshBalance - totalPrice,
        updatedAt: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      const purchaseRef = db.collection('purchases').doc();
      const assignedCredentials = [];

      accountsSnapshot.docs.forEach((acctDoc, index) => {
        const acctRef = db.collection('services').doc(serviceId).collection('accounts').doc(acctDoc.id);
        
        transaction.update(acctRef, {
          status: 'sold',
          soldTo: context.auth.uid,
          purchaseId: `${purchaseRef.id}_${index}`,
          updatedAt: now,
        });

        assignedCredentials.push(acctDoc.data().credential || {});
      });

      transaction.set(purchaseRef, {
        resellerId: context.auth.uid,
        customerId: context.auth.uid,
        customerEmail: claims.email || '',
        serviceId,
        serviceName: serviceData.name,
        accountIds: accountsSnapshot.docs.map(d => d.id),
        credentials: assignedCredentials,
        price: totalPrice,
        quantity: qty,
        unitPrice: wholesalePrice,
        status: 'active',
        type: 'bulk',
        tenantId,
        createdAt: now,
      });

      return {
        purchaseId: purchaseRef.id,
        credentials: assignedCredentials,
        serviceName: serviceData.name,
        quantity: qty,
        newBalance: freshBalance - totalPrice,
      };
    });

    // ─── Generar links públicos si el servicio aplica ────────────
    const linkTokens = [];
    if (hasCodeExtraction) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const accountsArray = accountsSnapshot.docs;

      for (let i = 0; i < accountsArray.length; i++) {
        const token = generateToken();
        const acctDoc = accountsArray[i];
        const credential = acctDoc.data().credential || {};

        await db.collection('public_links').doc(token).set({
          token,
          resellerId: context.auth.uid,
          accountId: acctDoc.id,
          serviceId,
          serviceName: serviceData.name,
          purchaseId: result.purchaseId,
          accountIndex: i,
          credential,
          createdAt: now,
          expiresAt,
          status: 'active',
        });
        linkTokens.push(token);
      }

      // Guardar tokens en el purchase doc para que el frontend los lea
      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens });
    }

    // ─── Registrar transacción de balance ─────────────────
    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId: context.auth.uid,
      amount: -totalPrice,
      type: 'bulk_purchase',
      description: 'Compra al por mayor',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    setTimeout(() => {
      sendDiscordWebhook(tenantId, {
        title: '📦 COMPRA AL POR MAYOR',
        color: 0x9b59b6,
        fields: [
          { name: '👤 Subdistribuidor', value: claims.email || 'Desconocido', inline: true },
          { name: '📦 Servicio', value: result.serviceName, inline: true },
          { name: '🔢 Cantidad', value: String(result.quantity), inline: true },
          { name: '💵 Total', value: `$${totalPrice.toLocaleString()} COP`, inline: true },
          { name: '🕐 Fecha', value: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) },
        ],
        timestamp: new Date().toISOString(),
      }).catch(err => console.warn('Discord notification failed:', err.message));
    }, 0);

    return {
      success: true,
      purchaseId: result.purchaseId,
      credentials: result.credentials,
      serviceName: result.serviceName,
      quantity: result.quantity,
      newBalance: result.newBalance,
      hasCodeExtraction,
      linkTokens: linkTokens.length > 0 ? linkTokens : undefined,
      message: hasCodeExtraction
        ? `✅ Compra exitosa. Recibiste ${result.quantity} link(s) de acceso para compartir con tus clientes.`
        : `✅ Compra exitosa. Recibiste ${result.quantity} cuenta(s) de ${result.serviceName}.`,
    };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in processBulkPurchase:', error);
    throw new functions.https.HttpsError('internal', 'Error al procesar la compra');
  }
});

// ========== EXTRAER CÓDIGO DE VERIFICACIÓN ==========
// Busca en la Cuenta Madre (Gmail API) el email con el código de verificación
// para un servicio comprado. Devuelve: bodyText (el email completo), code, from, subject.
// MODO MOCK: simula la búsqueda en Gmail sin conexión real.
// TODO: Reemplazar con Gmail API real + OAuth2 (Client ID + Refresh Token).
exports.extraerCodigo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { purchaseId } = data;
  if (!purchaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'purchaseId es requerido');
  }

  try {
    const ahora = new Date().toISOString();
    const codigo = String(Math.floor(100000 + Math.random() * 900000));

    console.log(`extraerCodigo mock: purchaseId=${purchaseId}, codigo=${codigo}`);

    // ─── Plantillas de email por servicio (mock) ─────────────────────────
    // Cada plantilla simula el email REAL que llega a la Cuenta Madre.
    // Cuando implementemos Gmail API real, reemplazar el bodyText dinámico
    // y dejar solo las credenciales + code como campos extraídos.
    const plantillas = {
      netflix: {
        from: 'Netflix <info@account.netflix.com>',
        subject: 'Tu código de verificación Netflix',
        bodyText: [
          '',
          `  Ingresa este código para iniciar sesión`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en tu dispositivo para iniciar`,
          `  sesión en Netflix. El código vence en 15 minutos.`,
          '',
          `  Si no enviaste esta solicitud, ignora este email`,
          `  o revisa la actividad reciente de tus dispositivos.`,
          '',
          `  Por motivos de seguridad, no compartas este código`,
          `  con personas que no viven contigo.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Netflix`,
          '',
          `  ¿Preguntas? Comunícate al 0800 591 8943`,
          `  Netflix Entretenimento Brasil, Ltda.`,
          `  Términos de uso • Privacidad • Centro de ayuda`,
          '',
          `  Netflix te envió este mensaje a`,
          `  [cuentamadre@gmail.com] como parte de tu membresía.`,
          '',
        ].join('\n'),
      },
      disney: {
        from: 'Disney+ <no-reply@accounts.disneyplus.com>',
        subject: 'Código de verificación Disney+',
        bodyText: [
          '',
          `  Tu código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en la pantalla de inicio de`,
          `  sesión de Disney+.`,
          '',
          `  Este código vence en 10 minutos.`,
          '',
          `  Si no solicitaste este código, puedes ignorar`,
          `  este mensaje de forma segura.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Disney+`,
          '',
          `  Ayuda • Privacidad • Términos`,
          `  © Disney. Todos los derechos reservados.`,
          '',
        ].join('\n'),
      },
      hbo: {
        from: 'HBO Max <no-reply@hbomax.com>',
        subject: 'Código de verificación HBO Max',
        bodyText: [
          '',
          `  Código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Usa este código para iniciar sesión en tu cuenta`,
          `  de HBO Max.`,
          '',
          `  El código expira en 15 minutos.`,
          '',
          `  Si no pediste este código, no reenvíes este`,
          `  mensaje.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de HBO Max`,
          `  Centro de ayuda`,
          '',
        ].join('\n'),
      },
    };

    // Determinar servicio — leemos el purchaseId para sacar el servicio
    let plantilla = plantillas.netflix; // default
    try {
      const purchaseDoc = await db.collection('purchases').doc(purchaseId).get();
      if (purchaseDoc.exists) {
        const svcName = (purchaseDoc.data().serviceName || '').toLowerCase();
        if (svcName.includes('disney')) plantilla = plantillas.disney;
        else if (svcName.includes('hbo') || svcName.includes('max')) plantilla = plantillas.hbo;
      }
    } catch {
      // si falla la lectura, usar default (netflix)
    }

    return {
      success: true,
      code: codigo,
      from: plantilla.from,
      subject: plantilla.subject,
      bodyText: plantilla.bodyText,
      extractedAt: ahora,
    };
  } catch (error) {
    console.error('Error en extraerCodigo:', error);
    throw new functions.https.HttpsError('internal', 'Error al extraer el código');
  }
});

// Lee una cuenta pública mediante token (sin autenticación).
// El token es generado por un reseller al crear un link de acceso.
exports.getPublicAccount = functions.https.onCall(async (data, context) => {
  const { token } = data;
  if (!token) {
    throw new functions.https.HttpsError('invalid-argument', 'Token es requerido');
  }

  try {
    const linkDoc = await db.collection('public_links').doc(token).get();

    if (!linkDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Link no encontrado o inválido');
    }

    const link = linkDoc.data();
    const ahora = Date.now();
    const expira = link.expiresAt?.toMillis?.() || 0;

    if (link.status !== 'active' || (expira > 0 && ahora > expira)) {
      // Marcar como expirado si no lo está
      if (link.status === 'active') {
        await linkDoc.ref.update({ status: 'expired', updatedAt: new Date().toISOString() });
      }
      return {
        success: false,
        error: 'Este link ha expirado. Contactá a tu vendedor para obtener uno nuevo.',
        account: null,
      };
    }

    const svcName = (link.serviceName || '').toLowerCase();
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const plantillas = {
      netflix: {
        from: 'Netflix <info@account.netflix.com>',
        subject: 'Tu código de verificación Netflix',
        bodyText: [
          '',
          `  Ingresa este código para iniciar sesión`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en tu dispositivo para iniciar`,
          `  sesión en Netflix. El código vence en 15 minutos.`,
          '',
          `  Si no enviaste esta solicitud, ignora este email`,
          `  o revisa la actividad reciente de tus dispositivos.`,
          '',
          `  Por motivos de seguridad, no compartas este código`,
          `  con personas que no viven contigo.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Netflix`,
          '',
          `  ¿Preguntas? Comunícate al 0800 591 8943`,
          `  Netflix Entretenimento Brasil, Ltda.`,
          `  Términos de uso • Privacidad • Centro de ayuda`,
          '',
          `  Netflix te envió este mensaje a`,
          `  [cuentamadre@gmail.com] como parte de tu membresía.`,
        ].join('\n'),
      },
      disney: {
        from: 'Disney+ <no-reply@accounts.disneyplus.com>',
        subject: 'Código de verificación Disney+',
        bodyText: [
          '',
          `  Tu código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en la pantalla de inicio de`,
          `  sesión de Disney+.`,
          '',
          `  Este código vence en 10 minutos.`,
          '',
          `  Si no solicitaste este código, puedes ignorar`,
          `  este mensaje de forma segura.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Disney+`,
          '',
          `  Ayuda • Privacidad • Términos`,
          `  © Disney. Todos los derechos reservados.`,
        ].join('\n'),
      },
      hbo: {
        from: 'HBO Max <no-reply@hbomax.com>',
        subject: 'Código de verificación HBO Max',
        bodyText: [
          '',
          `  Código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Usa este código para iniciar sesión en tu cuenta`,
          `  de HBO Max.`,
          '',
          `  El código expira en 15 minutos.`,
          '',
          `  Si no pediste este código, no reenvíes este`,
          `  mensaje.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de HBO Max`,
          `  Centro de ayuda`,
        ].join('\n'),
      },
    };
    let plantilla = plantillas.netflix;
    if (svcName.includes('disney')) plantilla = plantillas.disney;
    else if (svcName.includes('hbo') || svcName.includes('max')) plantilla = plantillas.hbo;

    // Devolver datos de la cuenta + mock del último email
    return {
      success: true,
      account: {
        serviceName: link.serviceName || 'Servicio',
        credential: link.credential || {},
        status: 'active',
        createdAt: link.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        expiresAt: link.expiresAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      },
      lastEmail: {
        subject: plantilla.subject,
        from: plantilla.from,
        bodyText: plantilla.bodyText,
        code: codigo,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error en getPublicAccount:', error);
    throw new functions.https.HttpsError('internal', 'Error al obtener la cuenta');
  }
});
