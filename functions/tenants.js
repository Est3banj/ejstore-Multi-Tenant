const { admin, db } = require('./config');
const { HttpsError } = require('./services/httpsError');

async function createSuperadminBootstrap(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  if (context.auth.token.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo superadmins pueden ejecutar el bootstrap', { code: 'PERMISO_INSUFICIENTE' });
  }

  const uid = data.uid || context.auth.uid;
  const tenantId = data.tenantId || context.auth.token.tenantId;
  const email = data.email || context.auth.token.email || context.auth.token.firebase?.identities?.email?.[0];

  if (!uid || !tenantId || !email) {
    throw new HttpsError('invalid-argument', 'No se pudo determinar uid, tenantId o email');
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: 'superadmin'
    });

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
    throw new HttpsError('internal', error.message);
  }
}

async function setTenantClaims(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { uid, tenantId, role } = data;

  if (!uid || !tenantId) {
    throw new HttpsError('invalid-argument', 'uid y tenantId son requeridos');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo superadmins pueden asignar permisos');
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: role || 'admin'
    });

    await db.collection('users').doc(uid).set({
      tenantId,
      role: role || 'admin',
      email: data.email || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, message: 'Claims actualizados' };
  } catch (error) {
    console.error('Error setting claims:', error);
    throw new HttpsError('internal', error.message);
  }
}

async function createTenant(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo superadmins pueden crear tenants');
  }

  const { name, subdomain, primaryColor, whatsappNumber, contactEmail } = data;

  if (!name || !subdomain) {
    throw new HttpsError('invalid-argument', 'name y subdomain son requeridos');
  }

  try {
    const tenantRef = db.collection('tenants').doc(subdomain);
    const tenantDoc = await tenantRef.get();

    if (tenantDoc.exists) {
      throw new HttpsError('already-exists', 'El subdomain ya existe');
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
    throw new HttpsError('internal', error.message);
  }
}

async function verifyTenantAccess(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado');
  }

  const { tenantId } = data;
  const userClaims = context.auth.token;

  if (userClaims.tenantId !== tenantId && userClaims.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'No tiene acceso a este tenant');
  }

  return { valid: true };
}

async function migrateCustomersTenantId(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const callerClaims = context.auth.token;
  if (callerClaims.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo superadmins pueden migrar customers');
  }

  const { tenantId } = data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId es requerido');
  }

  try {
    const customersSnap = await db.collection('customers').get();
    const batch = db.batch();
    let updatedCount = 0;

    customersSnap.forEach(doc => {
      const data = doc.data();
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
    throw new HttpsError('internal', error.message);
  }
}

module.exports = { createSuperadminBootstrap, createTenant, setTenantClaims, verifyTenantAccess, migrateCustomersTenantId };
