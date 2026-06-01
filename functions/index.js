const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

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

// ========== CREATE SUPERADMIN BOOTSTRAP ==========
// Crear el primer superadmin (solo funciona si no hay superadmin existente)
exports.createSuperadminBootstrap = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { uid, email } = data;

  if (!uid || !email) {
    throw new functions.https.HttpsError('invalid-argument', 'uid y email son requeridos');
  }

  try {
    // Verificar si ya existe un superadmin
    const usersSnap = await db.collection('users')
      .where('role', '==', 'superadmin')
      .limit(1)
      .get();

    if (!usersSnap.empty) {
      // Ya existe superadmin - verificar si es este usuario
      const existingSuperadmin = usersSnap.docs[0];
      if (existingSuperadmin.id !== uid) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Ya existe un superadmin registrado'
        );
      }
    }

    // Setear custom claims
    await admin.auth().setCustomUserClaims(uid, {
      role: 'superadmin',
      tenantId: 'ej'
    });

    // Actualizar Firestore
    await db.collection('users').doc(uid).set({
      email,
      role: 'superadmin',
      tenantId: 'ej',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, message: 'Superadmin creado exitosamente' };
  } catch (error) {
    console.error('Error creating superadmin:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
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
      const customer = doc.data();
      // Determinar tenantId basado en alguna lógica existente
      // Por defecto se asigna al tenant 'ej' en customers sin tenantId
      batch.update(doc.ref, {
        tenantId: customer.tenantId || 'ej'
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

// ========== CREATE RECHARGE REQUEST ==========
// Crear una solicitud de recarga de saldo (desde el panel admin)
exports.createRechargeRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { customerId, customerName, customerPhone, amount, tenantId } = data;

  if (!customerId || !amount || !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'customerId, amount y tenantId son requeridos');
  }

  if (amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'El monto debe ser mayor a 0');
  }

  try {
    const rechargeRef = await db.collection('recharges').add({
      tenantId,
      customerId,
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      amount,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });

    return {
      success: true,
      rechargeId: rechargeRef.id,
      message: 'Solicitud de recarga creada'
    };
  } catch (error) {
    console.error('Error creating recharge:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== LOAD CUSTOMER BALANCE ==========
// Obtener el saldo actual de un cliente
exports.loadCustomerBalance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { customerId } = data;

  if (!customerId) {
    throw new functions.https.HttpsError('invalid-argument', 'customerId es requerido');
  }

  try {
    const customerDoc = await db.collection('customers').doc(customerId).get();

    if (!customerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
    }

    const customer = customerDoc.data();

    // Verificar acceso al tenant
    const callerClaims = context.auth.token;
    if (customer.tenantId !== callerClaims.tenantId && callerClaims.role !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este cliente');
    }

    return {
      success: true,
      balance: customer.balance || 0,
      customer: {
        id: customerDoc.id,
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email || '',
        phone: customer.phone || ''
      }
    };
  } catch (error) {
    console.error('Error loading balance:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== PROCESS RECHARGE ==========
// Aprobar o rechazar una solicitud de recarga (admin)
exports.processRecharge = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { rechargeId, action } = data; // action: 'approve' | 'reject'

  if (!rechargeId || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'rechargeId y action son requeridos');
  }

  if (!['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'action debe ser "approve" o "reject"');
  }

  try {
    const rechargeRef = db.collection('recharges').doc(rechargeId);
    const rechargeDoc = await rechargeRef.get();

    if (!rechargeDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Solicitud de recarga no encontrada');
    }

    const recharge = rechargeDoc.data();

    if (recharge.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'La recarga ya fue procesada');
    }

    // Verificar acceso al tenant
    const callerClaims = context.auth.token;
    if (recharge.tenantId !== callerClaims.tenantId && callerClaims.role !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a esta recarga');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (action === 'reject') {
      await rechargeRef.update({
        status: 'rejected',
        processedAt: now,
        processedBy: context.auth.uid
      });

      return { success: true, message: 'Recarga rechazada' };
    }

    // Approve: actualizar recarga + saldo + transacción
    const customerRef = db.collection('customers').doc(recharge.customerId);
    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
    }

    const customer = customerDoc.data();

    // Actualizar estado de recarga
    await rechargeRef.update({
      status: 'approved',
      processedAt: now,
      processedBy: context.auth.uid,
      adminEmail: context.auth.token.email || null
    });

    // Actualizar saldo del cliente
    await customerRef.update({
      balance: admin.firestore.FieldValue.increment(recharge.amount)
    });

    // Registrar transacción de balance
    await db.collection('balanceTransactions').add({
      customerId: recharge.customerId,
      amount: recharge.amount,
      type: 'recharge',
      processedBy: context.auth.uid,
      adminEmail: context.auth.token.email || null,
      rechargeId: rechargeRef.id,
      createdAt: now
    });

    return {
      success: true,
      message: 'Recarga aprobada exitosamente',
      amount: recharge.amount,
      newBalance: (customer.balance || 0) + recharge.amount
    };
  } catch (error) {
    console.error('Error processing recharge:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== NOTIFY PRIZE WON ==========
// Notificar cuando un cliente gana un premio en la ruleta
exports.notifyPrizeWon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { customerId, prize, tenantId, customerName } = data;

  if (!customerId || !prize || !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'customerId, prize y tenantId son requeridos');
  }

  try {
    // Registrar el premio ganado
    const prizeRef = await db.collection('prizes').add({
      customerId,
      customerName: customerName || '',
      tenantId,
      prize,
      claimed: false,
      wonAt: admin.firestore.FieldValue.serverTimestamp(),
      notifiedBy: context.auth.uid
    });

    // Si el premio es saldo, acreditarlo automáticamente
    if (prize.type === 'balance' && prize.amount > 0) {
      const customerRef = db.collection('customers').doc(customerId);
      const customerDoc = await customerRef.get();

      if (customerDoc.exists) {
        await customerRef.update({
          balance: admin.firestore.FieldValue.increment(prize.amount)
        });

        // Registrar transacción
        await db.collection('balanceTransactions').add({
          customerId,
          amount: prize.amount,
          type: 'prize',
          processedBy: context.auth.uid,
          prizeId: prizeRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
          success: true,
          message: 'Premio registrado y saldo acreditado',
          prizeId: prizeRef.id,
          creditedAmount: prize.amount
        };
      }
    }

    return {
      success: true,
      message: 'Premio registrado exitosamente',
      prizeId: prizeRef.id
    };
  } catch (error) {
    console.error('Error notifying prize:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ========== TELEGRAM WEBHOOK ==========
// Webhook para el bot de Telegram (maneja comandos y callbacks)
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const { message, callback_query } = req.body;

    // Manejar callback_query (botones inline)
    if (callback_query) {
      const { data, from, message: callbackMessage } = callback_query;
      const chatId = callbackMessage?.chat?.id || from?.id;

      if (!chatId) {
        return res.status(400).send('No chat ID');
      }

      // Procesar según el callback data
      if (data === 'start') {
        await sendTelegramMessage(chatId,
          '¡Bienvenido a EJStore!\n\n' +
          'Selecciona una opción:\n' +
          '/servicios - Ver servicios disponibles\n' +
          '/saldo - Consultar tu saldo\n' +
          '/ayuda - Ayuda y contacto'
        );
      }

      return res.status(200).send('OK');
    }

    // Manejar mensajes de texto (comandos)
    if (message?.text) {
      const chatId = message.chat.id;
      const text = message.text.trim().toLowerCase();
      const firstName = message.from?.first_name || 'Usuario';

      if (text === '/start') {
        await sendTelegramMessage(chatId,
          `¡Hola ${firstName}! Bienvenido a EJStore 🎉\n\n` +
          'Soy tu asistente virtual. Usa los comandos:\n' +
          '🔹 /servicios - Ver servicios\n' +
          '🔹 /saldo - Consultar saldo\n' +
          '🔹 /ayuda - Ayuda y contacto\n' +
          '🔹 /recargar - Recargar saldo'
        );
      } else if (text === '/ayuda' || text === '/help') {
        await sendTelegramMessage(chatId,
          '📞 *Contacto y Ayuda*\n\n' +
          'Si necesitas asistencia, contáctanos:\n' +
          '• WhatsApp: +57 300 123 4567\n' +
          '• Email: soporte@ejstore.com\n\n' +
          'Horario: Lun-Sáb 9:00 AM - 8:00 PM'
        );
      } else if (text === '/servicios') {
        await sendTelegramMessage(chatId,
          '🛒 *Servicios Disponibles*\n\n' +
          'Actualmente puedes consultar nuestros servicios en la tienda web.\n' +
          'Visítanos en: https://ejstore-web.web.app'
        );
      } else if (text === '/saldo') {
        await sendTelegramMessage(chatId,
          '💰 *Consultar Saldo*\n\n' +
          'Para consultar tu saldo, inicia sesión en la tienda web o contacta a nuestro equipo.'
        );
      } else if (text === '/recargar') {
        await sendTelegramMessage(chatId,
          '💳 *Recargar Saldo*\n\n' +
          'Para recargar saldo, contacta a nuestro equipo por WhatsApp:\n' +
          'wa.me/573001234567'
        );
      } else {
        await sendTelegramMessage(chatId,
          'Lo siento, no entendí ese comando. Usa /ayuda para ver los comandos disponibles.'
        );
      }

      return res.status(200).send('OK');
    }

    // Si no hay mensaje ni callback, solo responder OK
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error en telegramWebhook:', error);
    return res.status(500).send('Error interno');
  }
});

// Helper para enviar mensajes a Telegram
async function sendTelegramMessage(chatId, text) {
  const botToken = '7609492059:AAEM4lxZ5d23DhlgIXXEAdifuLgQxSGvD8I';
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', errorText);
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}
