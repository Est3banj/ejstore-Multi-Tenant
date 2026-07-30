const { functions, admin, db, axios, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME } = require('./config');
const { getUserRole } = require('./auth');

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
    return false;
  }
}

async function sendTelegramAdminNotification(tenantId, text) {
  try {
    const snap = await db.collection('tenants').doc(tenantId).collection('secrets').doc('telegram').get();
    if (!snap.exists || !snap.data().adminChatId) return false;
    return await sendTelegramMessage(snap.data().adminChatId, text);
  } catch (e) {
    return false;
  }
}

async function sendTelegramResellerNotification(resellerUid, text) {
  try {
    const snap = await db.collection('resellers').doc(resellerUid).get();
    if (!snap.exists || !snap.data().telegramChatId) return false;
    return await sendTelegramMessage(snap.data().telegramChatId, text);
  } catch (e) {
    return false;
  }
}

const generateTelegramToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId: userTenantId } = await getUserRole(uid);

  if (!role) throw new functions.https.HttpsError('failed-precondition', 'No se pudo determinar tu rol');

  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await db.collection('telegram_tokens').doc(token).set({
    uid,
    tenantId: userTenantId,
    role,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    token,
    botUsername: TELEGRAM_BOT_USERNAME || 'pendiente',
    expiresIn: 300,
  };
});

const telegramWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('Telegram webhook: TELEGRAM_BOT_TOKEN not configured');
    res.status(500).send('Server not configured');
    return;
  }

  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  // Si Telegram envía el secret token, validarlo; si no lo envía, permitir igual
  // (compatibilidad con webhooks configurados sin secret_token)
  if (secretToken && secretToken !== TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram webhook: invalid secret token');
    res.status(403).send('Forbidden');
    return;
  }

  try {
    const update = req.body;
    const message = update.message;

    if (!message || !message.text) {
      res.status(200).send('OK');
      return;
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const senderName = message.from?.first_name || 'Usuario';

    let token;
    if (text.startsWith('/start ')) {
      token = text.replace('/start ', '').trim().toUpperCase();
    } else {
      // Aceptar solo el token directamente (sin /start)
      token = text.trim().toUpperCase();
      // Validar que sean exactamente 6 caracteres alfanuméricos (formato del token)
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
      await sendTelegramMessage(chatId, '❌ Token no encontrado o ya expiró. Generá uno nuevo desde el panel.');
      res.status(200).send('OK');
      return;
    }

    const tokenData = tokenDoc.data();
    if (Date.now() > tokenData.expiresAt) {
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

    res.status(200).send('OK');
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
    res.status(200).send('OK');
  }
});

const checkTelegramStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId: userTenantId } = await getUserRole(uid);

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

  return { linked, role };
});

const sendTestTelegram = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');

  const uid = context.auth.uid;
  const { role, tenantId } = await getUserRole(uid);

  let sent = false;
  if (role === 'admin' || role === 'superadmin') {
    sent = await sendTelegramAdminNotification(tenantId, '🔔 <b>Notificación de prueba</b>\n\nSi estás viendo esto, el sistema de Telegram funciona correctamente. ✅');
  } else if (role === 'reseller') {
    sent = await sendTelegramResellerNotification(uid, '🔔 <b>Notificación de prueba</b>\n\nSi estás viendo esto, el sistema de Telegram funciona correctamente. ✅');
  }

  return { success: sent, message: sent ? 'Mensaje enviado' : 'No hay Telegram vinculado' };
});

module.exports = { sendTelegramMessage, sendTelegramAdminNotification, sendTelegramResellerNotification, generateTelegramToken, telegramWebhook, checkTelegramStatus, sendTestTelegram };
