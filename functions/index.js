const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

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