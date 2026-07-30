const { functions, admin, db } = require('./config');
const { sendTelegramAdminNotification, sendTelegramResellerNotification } = require('./telegram');
const { sendEmail, buildTicketResponseEmail } = require('./email');
const { getUserRole } = require('./auth');

const loadCustomerBalance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid, context.auth.token);
  if (role !== 'superadmin' && role !== 'admin') {
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

  const customerRef = db.collection('customers').doc(customerId);
  const customerDoc = await customerRef.get();

  if (!customerDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
  }

  const customerData = customerDoc.data();
  if (role !== 'superadmin' && adminTenantId !== customerData.tenantId) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este cliente');
  }

  const now = new Date().toISOString();
  await customerRef.update({
    balance: (customerData.balance || 0) + parsedAmount,
    updatedAt: now,
  });

  await db.collection('balanceTransactions').add({
    customerId,
    amount: parsedAmount,
    type: 'admin_load',
    processedBy: context.auth.uid,
    adminEmail: context.auth.token.email || null,
    createdAt: now,
  });

  const loadTenantId = adminTenantId;
  if (loadTenantId) {
    const customerName = `${customerData.firstName || ''} ${customerData.lastName || ''}`.trim() || customerData.email || 'Desconocido';
    const msg = `💵 <b>Carga de Saldo</b>\n\n👤 <b>Cliente:</b> ${customerName}\n📞 <b>Teléfono:</b> ${customerData.phone || '—'}\n🆔 <b>ID:</b> ${customerId}\n💰 <b>Monto:</b> $${parsedAmount.toLocaleString('es-CO')} COP\n💳 <b>Nuevo saldo:</b> $${((customerData.balance || 0) + parsedAmount).toLocaleString('es-CO')} COP\n👤 <b>Cargado por:</b> ${context.auth.token.email || 'Admin'}\n🕐 <b>Fecha:</b> ${new Date(now).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;
    sendTelegramAdminNotification(loadTenantId, msg);
  }

  return { success: true, newAmount: parsedAmount };
});

const createReseller = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid, context.auth.token);
  if (role !== 'superadmin' && role !== 'admin') {
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
      tenantId: adminTenantId,
      role: 'reseller',
      parentTenantId: adminTenantId,
    });

    const now = new Date().toISOString();
    await db.collection('resellers').doc(userRecord.uid).set({
      uid: userRecord.uid,
      tenantId: adminTenantId,
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
      tenantId: adminTenantId,
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

// TEMPORAL: eliminar distribuidor por email para recrearlo
const adminDeleteResellerByEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { role } = await getUserRole(context.auth.uid, context.auth.token);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }
  const { email } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email requerido');
  }
  try {
    const user = await admin.auth().getUserByEmail(email);
    const uid = user.uid;
    await Promise.allSettled([
      admin.auth().deleteUser(uid),
      db.collection('resellers').doc(uid).delete(),
      db.collection('users').doc(uid).delete(),
    ]);
    return { success: true, message: `Distribuidor ${email} eliminado` };
  } catch (e) {
    throw new functions.https.HttpsError('not-found', 'Usuario no encontrado');
  }
});

const loadResellerBalance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid, context.auth.token);
  if (role !== 'superadmin' && role !== 'admin') {
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
    if (role !== 'superadmin' && adminTenantId !== resellerData.tenantId) {
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

const onTicketCreated = functions.firestore
  .document('tickets/{ticketId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data || !data.tenantId) return;

    const userName = data.userName || data.userEmail || 'Desconocido';
    const ticketCode = data.purchaseId?.startsWith?.('TKT-')
      ? data.purchaseId
      : `TKT-${(context.params.ticketId || '').slice(0, 6).toUpperCase()}-?`;
    const userLabel = data.userType === 'reseller' ? 'Subdistribuidor' : 'Cliente';
    const msg = `🎫 <b>Nuevo Reporte</b>\n\n👤 <b>${userLabel}:</b> ${userName}\n📧 <b>Email:</b> ${data.userEmail || '—'}\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${data.subject || 'Sin asunto'}\n📝 <b>Descripción:</b> ${(data.description || '').substring(0, 300)}\n📦 <b>Servicio:</b> ${data.serviceName || '—'}\n📧 <b>Email servicio:</b> ${data.customerEmail || '—'}`;
    sendTelegramAdminNotification(data.tenantId, msg);
  });

const onTicketUpdated = functions.firestore
  .document('tickets/{ticketId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (!after || !before) return;

    if (before.status === 'open' && after.status === 'resolved' && after.userId) {
      const ticketCode = after.purchaseId?.startsWith?.('TKT-')
        ? after.purchaseId
        : `TKT-${(context.params.ticketId || '').slice(0, 6).toUpperCase()}-?`;
      const msg = `✅ <b>Tu reporte fue respondido</b>\n\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${after.subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${(after.adminNotes || '').substring(0, 300)}`;

      if (after.userRole === 'reseller') {
        sendTelegramResellerNotification(after.userId, msg);
      }

      if (after.tenantId) {
        const userLabel = after.userRole === 'reseller' ? 'Subdistribuidor' : 'Cliente';
        const adminMsg = `✅ <b>Reporte Resuelto</b>\n\n👤 <b>${userLabel}:</b> ${after.userName || after.userEmail || 'Desconocido'}\n🆔 <b>Ticket:</b> ${ticketCode}\n📋 <b>Asunto:</b> ${after.subject || 'Sin asunto'}\n📝 <b>Respuesta:</b> ${(after.adminNotes || '').substring(0, 200)}`;
        sendTelegramAdminNotification(after.tenantId, adminMsg);
      }

      const ticketId = context.params.ticketId;
      // purchaseId almacena el código TKT- que el usuario conoce (ej: TKT-ABC123-1)
      const displayId = after.purchaseId || ticketId;
      // userEmail = email del usuario que reportó (NO customerEmail que es el email del servicio)
      const recipientEmail = after.userEmail || after.customerEmail;
      if (recipientEmail) {
        const emailHtml = buildTicketResponseEmail({
          ticketId: displayId,
          response: after.adminNotes || '',
        });
        sendEmail(after.tenantId, recipientEmail, 'Ticket Respondido - ' + displayId, emailHtml);
      }
    }
  });

module.exports = { loadCustomerBalance, createReseller, loadResellerBalance, onTicketCreated, onTicketUpdated, adminDeleteResellerByEmail };
