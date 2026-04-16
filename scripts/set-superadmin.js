/**
 * Script para setear superadmin por primera vez
 * Ejecute: node scripts/set-superadmin.js
 */

const admin = require('firebase-admin');

// Cargar credenciales de service account
const serviceAccount = require('../ejstore-firebase-adminsdk.json');

async function setSuperadmin() {
  // Inicializar Firebase Admin
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const uid = 'o2J9pBuDbCMAg4Nr7uOMqkssKOw2'; // juradoesteban001@gmail.com
  const tenantId = 'ej';

  try {
    // 1. Setear Custom Claims en Firebase Auth
    await admin.auth().setCustomUserClaims(uid, {
      tenantId,
      role: 'superadmin'
    });
    console.log('✅ Custom claims setados');

    // 2. Crear documento en Firestore /users
    await admin.firestore().collection('users').doc(uid).set({
      tenantId,
      role: 'superadmin',
      email: 'juradoesteban001@gmail.com',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('✅ Documento en Firestore creado');

    console.log('\n🎉 Listo! Tu usuario ahora es superadmin');
    console.log('Uid:', uid);
    console.log('Tenant:', tenantId);
    console.log('Role: superadmin');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setSuperadmin();