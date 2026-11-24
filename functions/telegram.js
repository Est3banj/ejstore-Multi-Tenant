const { admin, db, axios, getTelegramBotToken, getTelegramBotUsername, createModuleLogger } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getUserRole } = require('./auth');
const { generateSecureToken, timingSafeEqual } = require('./utils/crypto');

const log = createModuleLogger('telegram');

const WEBHOOK_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
const REPLAY_CACHE_TTL_SEC = 24 * 60 * 60;

async function sendTelegramMessage(chatId, text) {
  const token = await getTelegramBotToken();
  if (!token || !chatId) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return true;
  } catch (error) {
    log.error({ err: error, chatId }, 'Error sending Telegram message');
    return false;
  }
}

async function sendTelegramAdminNotification(tenantId, text) {
  const childLog = log.child({ tenantId, operation: 'sendAdminNotification' });
  try {
    const snap = await db.collection('tenants').doc(tenantId).collection('secrets').doc('telegram').get();
    if (!snap.exists || !snap.data().adminChatId) {
      childLog.warn('No admin chat ID configured for tenant');
      return false;
    }
    childLog.info('Sending admin notification');
    return await sendTelegramMessage(snap.data().adminChatId, text);
  } catch (e) {
    childLog.error({ err: e }, 'Error sending admin notification');
    return false;
  }
}

async function sendTelegramResellerNotification(resellerUid, text) {
  const childLog = log.child({ resellerUid, operation: 'sendResellerNotification' });
  try {
    const snap = await db.collection('resellers').doc(resellerUid).get();
    if (!snap.exists || !snap.data().telegramChatId) {
      childLog.warn('No Telegram chat ID for reseller');
      return false;
    }
    childLog.info('Sending reseller notification');
    return await sendTelegramMessage(snap.data().telegramChatId, text);
  } catch (e) {
    childLog.error({ err: e }, 'Error sending reseller notification');
    return false;
  }
}

async function generateTelegramToken(data, context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId: userTenantId } = await getUserRole(uid);

  const childLog = log.child({ uid, role, tenantId: userTenantId, operation: 'generateTelegramToken' });

  if (!role) {
    childLog.warn('Role not determined for user');
    throw new HttpsError('failed-precondition', 'No se pudo determinar tu rol');
  }

  const token = generateSecureToken(32);
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await db.collection('telegram_tokens').doc(token).set({
    uid,
    tenantId: userTenantId,
    role,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const botUsername = await getTelegramBotUsername();
  childLog.info({ tokenPreview: token.substring(0, 8) + '...' }, 'Telegram token generated');

  return {
    success: true,
    token,
    botUsername: botUsername || 'pendiente',
    expiresIn: 300,
  };
}

function validateTelegramWebhookSecret(req) {
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken || !expectedSecret) {
    return false;
  }
  return timingSafeEqual(secretToken, expectedSecret);
}

async function telegramWebhook(req, res) {
  const webhookLog = log.child({ operation: 'webhook', method: req.method });
  
  if (req.method !== 'POST') {
    webhookLog.debug('Non-POST request received');
    res.status(200).send('OK');
    return;
  }

  const botToken = await getTelegramBotToken();
  if (!botToken) {
    webhookLog.error('TELEGRAM_BOT_TOKEN not configured');
    return sendErrorResponse(res, 'CONFIG_ERROR', 'Server not configured', 500);
  }

  if (!validateTelegramWebhookSecret(req)) {
    webhookLog.warn('Invalid secret token in webhook');
    return sendErrorResponse(res, 'INVALID_SIGNATURE', 'Unauthorized', 401);
  }

  const update = req.body;
  
  if (!update || !update.update_id) {
    webhookLog.warn('Missing update_id in webhook');
    return sendErrorResponse(res, 'INVALID_PAYLOAD', 'Missing update_id', 400);
  }

  try {
    const replayRef = db.collection('telegram_webhook_replay').doc(String(update.update_id));
    try {
      await replayRef.create({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + REPLAY_CACHE_TTL_SEC * 1000),
      });
    } catch (e) {
      if (e.code === 6 || e.code === 'already-exists' || e.code === 'ALREADY_EXISTS') {
        webhookLog.warn({ updateId: update.update_id }, 'Replay attack detected');
        res.status(200).send('OK');
        return;
      }
      throw e;
    }

    if (update.message && update.message.date) {
      const messageTimestamp = update.message.date * 1000;
      const now = Date.now();
      if (Math.abs(now - messageTimestamp) > WEBHOOK_TIMESTAMP_WINDOW_MS) {
        webhookLog.warn({ messageTimestamp, now, diff: Math.abs(now - messageTimestamp) }, 'Message timestamp outside allowed window');
        return sendErrorResponse(res, 'TIMESTAMP_EXPIRED', 'Message too old', 400);
      }
    }

    const message = update.message;

    if (!message || !message.text) {
      webhookLog.debug('No message text in update');
      res.status(200).send('OK');
      return;
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const senderName = message.from?.first_name || 'Usuario';

    webhookLog.info({ chatId, senderName, textPreview: text.substring(0, 50) }, 'Webhook received');

    let token;
    if (text.startsWith('/start ')) {
      token = text.replace('/start ', '').trim().toUpperCase();
    } else {
      token = text.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(token)) {
        await sendTelegramMessage(chatId, `Hola ${senderName}! 👋\n\nPara vincular tu cuenta, enviá el token que generaste en el panel.\n\nEjemplo: \`${token}\``);
        res.status(200).send('OK');
        return;
      }
    }
    if (!token) {
      await sendTelegramMessage(chatId, '❌ Token inválido. Generá uno nuevo desde el panel.');
      res.status(200).send('OK');
      return;
    }

    const tokenDoc = await db.collection('telegram_tokens').doc(token).get();
    if (!tokenDoc.exists) {
      webhookLog.warn({ token: token.substring(0, 8) + '...' }, 'Token not found');
      await sendTelegramMessage(chatId, '❌ Token no encontrado o ya expiró. Generá uno nuevo desde el panel.');
      res.status(200).send('OK');
      return;
    }

    const tokenData = tokenDoc.data();
    if (Date.now() > tokenData.expiresAt) {
      webhookLog.warn({ token: token.substring(0, 8) + '...' }, 'Token expired');
      await tokenDoc.ref.delete();
      await sendTelegramMessage(chatId, '❌ Token expirado. Generá uno nuevo desde el panel.');
      res.status(200).send('OK');
      return;
    }

    const { uid, tenantId, role: userRole } = tokenData;

    if (userRole === 'admin' || userRole === 'superadmin') {
      await db.collection('tenants').doc(tenantId).collection('secrets').doc('telegram').set({
        adminChatId: String(chatId),
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        linkedBy: uid,
      }, { merge: true });
    } else if (userRole === 'reseller') {
      await db.collection('resellers').doc(uid).update({
        telegramChatId: String(chatId),
      });
    }

    await tokenDoc.ref.delete();

    const roleName = userRole === 'superadmin' ? 'Admin' : userRole === 'admin' ? 'Admin' : 'Subdistribuidor';
    await sendTelegramMessage(chatId, `✅ <b>Vinculación exitosa</b>\n\nTu cuenta de Telegram fue vinculada como <b>${roleName}</b>.\nA partir de ahora recibirás notificaciones aquí.`);

    webhookLog.info({ uid, tenantId, userRole }, 'Telegram account linked successfully');
    res.status(200).send('OK');
  } catch (error) {
    webhookLog.error({ err: error }, 'Telegram webhook error');
    return sendErrorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

function sendErrorResponse(res, code, message, statusCode) {
  res.status(statusCode).json({
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

async function checkTelegramStatus(data, context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId: userTenantId } = await getUserRole(uid);

  const childLog = log.child({ uid, role, tenantId: userTenantId, operation: 'checkTelegramStatus' });

  let linked = false;

  if (role === 'admin' || role === 'superadmin') {
    if (userTenantId) {
      const snap = await db.collection('tenants').doc(userTenantId).collection('secrets').doc('telegram').get();
      linked = snap.exists && !!snap.data().adminChatId;
    }
  } else if (role === 'reseller') {
    const snap = await db.collection('resellers').doc(uid).get();
    linked = snap.exists && !!snap.data().telegramChatId;
  }

  childLog.info({ linked }, 'Telegram status checked');
  return { linked, role };
}

async function sendTestTelegram(data, context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId } = await getUserRole(uid);

  const childLog = log.child({ uid, role, tenantId, operation: 'sendTestTelegram' });

  let sent = false;
  if (role === 'admin' || role === 'superadmin') {
    sent = await sendTelegramAdminNotification(tenantId, '🔔 <b>Notificación de prueba</b>\n\nSi estás viendo esto, el sistema de Telegram funciona correctamente. ✅');
  } else if (role === 'reseller') {
    sent = await sendTelegramResellerNotification(uid, '🔔 <b>Notificación de prueba</b>\n\nSi estás viendo esto, el sistema de Telegram funciona correctamente. ✅');
  }

  childLog.info({ sent }, 'Test Telegram sent');
  return { success: sent, message: sent ? 'Mensaje enviado' : 'No hay Telegram vinculado' };
}

module.exports = { sendTelegramMessage, sendTelegramAdminNotification, sendTelegramResellerNotification, generateTelegramToken, telegramWebhook, checkTelegramStatus, sendTestTelegram };