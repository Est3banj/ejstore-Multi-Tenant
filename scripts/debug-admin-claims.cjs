/**
 * Script para debug y fix de custom claims de admin
 * Ejecute: node scripts/debug-admin-claims.js <email>
 */

const admin = require('firebase-admin');

const serviceAccount = require('../ejstore-firebase-adminsdk.json');

async function debugAdminClaims(email) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  const db = admin.firestore();

  try {
    // 1. Buscar usuario por email en Auth
    console.log(`🔍 Buscando usuario con email: ${email}`);
    
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`✅ Usuario encontrado en Auth`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Custom Claims actuales:`, JSON.stringify(userRecord.customClaims, null, 2));

    // 2. Verificar documento en Firestore
    console.log('\n📄 Verificando documento en Firestore...');
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      const data = userDoc.data();
      console.log(`✅ Documento encontrado`);
      console.log(`   tenantId: ${data.tenantId}`);
      console.log(`   role: ${data.role}`);
      console.log(`   email: ${data.email}`);
    } else {
      console.log(`❌ NO existe documento en Firestore para este usuario`);
    }

    // 3. Verificar si el tenant existe
    if (userDoc.exists && data.tenantId) {
      console.log(`\n🏪 Verificando tenant: ${data.tenantId}`);
      const tenantDoc = await db.collection('tenants').doc(data.tenantId).get();
      
      if (tenantDoc.exists) {
        console.log(`✅ Tenant existe: ${tenantDoc.data().name}`);
      } else {
        console.log(`❌ Tenant NO existe: ${data.tenantId}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.log('\n⚠️ El usuario NO existe en Firebase Auth.');
      console.log('   Primero debes crearlo en Firebase Console > Authentication');
    }
    process.exit(1);
  }
}

// Obtener email del argumento
const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/debug-admin-claims.js <email>');
  console.error('Example: node scripts/debug-admin-claims.js usuario@ejemplo.com');
  process.exit(1);
}

debugAdminClaims(email);