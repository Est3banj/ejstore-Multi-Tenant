const { admin, db } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { sendTelegramAdminNotification } = require('./telegram');
const { getUserRole } = require('./auth');

function parseStrictInteger(value) {
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!/^-?\d+$/.test(asString)) return null;
  const parsed = Number(asString);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function loadCustomerBalance(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { customerId, amount } = data;

  if (!customerId || !amount) {
    throw new HttpsError('invalid-argument', 'customerId y amount son requeridos');
  }

  const parsedAmount = parseStrictInteger(amount);
  if (parsedAmount === null) {
    throw new HttpsError('invalid-argument', 'Monto inválido; debe ser un número entero', { code: 'MONTO_INVALIDO' });
  }
  if (parsedAmount < 1000) {
    throw new HttpsError('invalid-argument', 'El monto mínimo es $1,000 COP', { code: 'MONTO_INVALIDO' });
  }

  const customerRef = db.collection('customers').doc(customerId);
  const customerDoc = await customerRef.get();

  if (!customerDoc.exists) {
    throw new HttpsError('not-found', 'Cliente no encontrado');
  }

  const customerData = customerDoc.data();
  if (role !== 'superadmin' && adminTenantId !== customerData.tenantId) {
    throw new HttpsError('permission-denied', 'No tiene acceso a este cliente');
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
}

async function createReseller(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { email, password, name, phone, commissionPercent } = data;

  if (!email || !password || !name) {
    throw new HttpsError('invalid-argument', 'email, password y name son requeridos');
  }

  if (typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener mínimo 8 caracteres con letras y números', { code: 'PASSWORD_DEBIL' });
  }

  if (commissionPercent !== undefined && commissionPercent !== null && commissionPercent !== '') {
    const commission = typeof commissionPercent === 'number' ? commissionPercent : Number(commissionPercent);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      throw new HttpsError('invalid-argument', 'La comisión debe estar entre 0 y 100', { code: 'COMISION_INVALIDA' });
    }
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
      throw new HttpsError('already-exists', 'El email ya está registrado');
    }
    throw new HttpsError('internal', 'Error al crear subdistribuidor');
  }
}

// TEMPORAL: eliminar distribuidor por email para recrearlo
async function adminDeleteResellerByEmail(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { role } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }
  const { email } = data;
  if (!email) {
    throw new HttpsError('invalid-argument', 'Email requerido');
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
    throw new HttpsError('not-found', 'Usuario no encontrado');
  }
}

async function loadResellerBalance(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { role, tenantId: adminTenantId } = await getUserRole(context.auth.uid);
  if (role !== 'superadmin' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { resellerId, amount } = data;

  if (!resellerId || !amount) {
    throw new HttpsError('invalid-argument', 'resellerId y amount son requeridos');
  }

  const parsedAmount = parseStrictInteger(amount);
  if (parsedAmount === null) {
    throw new HttpsError('invalid-argument', 'Monto inválido; debe ser un número entero', { code: 'MONTO_INVALIDO' });
  }
  if (parsedAmount < 1000) {
    throw new HttpsError('invalid-argument', 'El monto mínimo es $1,000 COP', { code: 'MONTO_INVALIDO' });
  }

  try {
    const resellerRef = db.collection('resellers').doc(resellerId);
    const resellerDoc = await resellerRef.get();

    if (!resellerDoc.exists) {
      throw new HttpsError('not-found', 'Subdistribuidor no encontrado');
    }

    const resellerData = resellerDoc.data();
    if (role !== 'superadmin' && adminTenantId !== resellerData.tenantId) {
      throw new HttpsError('permission-denied', 'No tiene acceso a este subdistribuidor');
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
    if (error instanceof HttpsError) throw error;
    console.error('Error loading reseller balance:', error);
    throw new HttpsError('internal', 'Error al cargar saldo');
  }
}

module.exports = { loadCustomerBalance, createReseller, loadResellerBalance, adminDeleteResellerByEmail };