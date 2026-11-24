const { admin, auth, db } = require('./config');
const { HttpsError } = require('./services/httpsError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getUserRole(uid) {
  try {
    const user = await auth.getUser(uid);
    if (user.customClaims && user.customClaims.role) {
      return {
        role: user.customClaims.role,
        tenantId: user.customClaims.tenantId || null,
        permissions: user.customClaims.permissions || [],
      };
    }
  } catch (e) {
    console.warn(`[auth] Failed to get user ${uid}:`, e.message);
  }

  return { role: null, tenantId: null, permissions: [] };
}

async function getUserRoleHandler(data, context) {
  if (!context.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  const uid = (data && data.uid) || context.auth.uid;
  if (uid !== context.auth.uid) {
    const caller = await getUserRole(context.auth.uid);
    if (caller.role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'No autorizado para esta operación', { code: 'NO_AUTORIZADO' });
    }
  }
  return await getUserRole(uid);
}

// Crea un usuario admin/reseller: sólo superadmin. Nota: el Admin SDK NO tiene
// createUserWithEmailAndPassword (es de la client SDK) — el equivalente es
// admin.auth().createUser({ email, password }); el código de duplicado del
// Admin SDK es auth/email-already-exists (se acepta también auth/email-already-in-use
// por paridad con el enunciado). Cualquier fallo posterior a la creación del
// usuario hace rollback (deleteUser) para no dejar cuentas huérfanas.
async function createAdmin(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  if (context.auth.token.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo superadmins pueden crear administradores');
  }

  const payload = data || {};
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = payload.password;
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId.trim() : '';
  const role = payload.role || 'admin';

  if (!email) {
    throw new HttpsError('invalid-argument', 'El email es requerido');
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'El formato del email no es válido');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener mínimo 8 caracteres');
  }
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'El tenant es requerido');
  }
  if (role !== 'admin' && role !== 'reseller') {
    throw new HttpsError('invalid-argument', "El rol debe ser 'admin' o 'reseller'");
  }

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    throw new HttpsError('invalid-argument', 'El tenant indicado no existe');
  }

  let uid;
  try {
    const userRecord = await auth.createUser({ email, password });
    uid = userRecord.uid;
  } catch (error) {
    if (error.code === 'auth/email-already-exists' || error.code === 'auth/email-already-in-use') {
      throw new HttpsError('already-exists', 'Ese email ya está registrado');
    }
    console.error('Error creating admin user:', error);
    throw new HttpsError('internal', 'Error al crear el usuario');
  }

  try {
    await auth.setCustomUserClaims(uid, { role, tenantId });
    await db.collection('users').doc(uid).set({
      email,
      role,
      tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error configuring admin user, rolling back:', error);
    try {
      await auth.deleteUser(uid);
    } catch (rollbackError) {
      console.error('createAdmin rollback failed:', rollbackError);
    }
    throw new HttpsError('internal', 'Error al configurar el usuario');
  }

  return { success: true, uid };
}

module.exports = { getUserRole, getUserRoleHandler, createAdmin };
