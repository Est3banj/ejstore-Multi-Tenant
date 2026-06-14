// Seed script usando Admin SDK (bypassea rules de Firestore)
// Ejecutar con: node scripts/seed-emulators-admin.js

const admin = require('firebase-admin');

// Conectar a emuladores
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const app = admin.initializeApp({
  projectId: 'ejstore-web'
});

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  console.log('🌱 Sembrando datos via Admin SDK...\n');

  try {
    // 1. Create test user in Auth
    let testUser, adminUser;
    try {
      testUser = await auth.createUser({
        email: 'test@ejstore.com',
        password: 'test123456',
      });
      console.log(`✅ Auth user created: ${testUser.uid} (test@ejstore.com)`);
    } catch (e) {
      console.log(`ℹ️  Auth user test@ejstore.com already exists (or error): ${e.message}`);
      testUser = { uid: 'test-user-placeholder' };
    }

    try {
      adminUser = await auth.createUser({
        email: 'admin@ejstore.com',
        password: 'admin123456',
      });
      console.log(`✅ Auth user created: ${adminUser.uid} (admin@ejstore.com)`);
    } catch (e) {
      console.log(`ℹ️  Auth user admin@ejstore.com already exists (or error): ${e.message}`);
      adminUser = { uid: 'admin-user-placeholder' };
    }

    // 2. Set custom claims for both users
    try {
      await auth.setCustomUserClaims(testUser.uid, { tenantId: 'ej', role: 'customer' });
      console.log(`✅ Custom claims set for test user: tenantId=ej, role=customer`);
    } catch (e) {
      console.log(`ℹ️  Could not set claims for test user: ${e.message}`);
    }

    try {
      await auth.setCustomUserClaims(adminUser.uid, { tenantId: 'ej', role: 'superadmin' });
      console.log(`✅ Custom claims set for admin user: tenantId=ej, role=superadmin`);
    } catch (e) {
      console.log(`ℹ️  Could not set claims for admin user: ${e.message}`);
    }

    // 3. Create users collection document
    await db.collection('users').doc(testUser.uid).set({
      role: 'customer',
      tenantId: 'ej',
      email: 'test@ejstore.com',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: users/${testUser.uid}`);

    await db.collection('users').doc(adminUser.uid).set({
      role: 'superadmin',
      tenantId: 'ej',
      email: 'admin@ejstore.com',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: users/${adminUser.uid}`);

    // 4. Create customer document with balance
    await db.collection('customers').doc(testUser.uid).set({
      balance: 50000,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@ejstore.com',
      tenantId: 'ej',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: customers/${testUser.uid} (balance: 50000)`);

    // 5. Create tenant document
    await db.collection('tenants').doc('ej').set({
      name: 'EJ Store',
      subdomain: 'ej',
      isActive: true,
      primaryColor: '#E50914',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: tenants/ej`);

    // 6. Create rouletteConfig
    await db.collection('rouletteConfig').doc('ej').set({
      isEnabled: true,
      pricePerSpin: 1000,
      spinsForFreeSpin: 3,
      prizes: [
        { id: 'nothing', name: 'Nada', type: 'nothing', probability: 0.85, isActive: true },
        { id: 'netflix', name: 'Netflix 1 Mes', type: 'subscription', probability: 0.02, isActive: true },
        { id: 'disney', name: 'Disney+ 1 Mes', type: 'subscription', probability: 0.02, isActive: true },
        { id: 'hbo', name: 'HBO Max 1 Mes', type: 'subscription', probability: 0.03, isActive: true },
        { id: 'prime', name: 'Amazon Prime 1 Mes', type: 'subscription', probability: 0.03, isActive: true },
        { id: 'crunchyroll', name: 'Crunchyroll 1 Mes', type: 'subscription', probability: 0.05, isActive: true },
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: rouletteConfig/ej (6 prizes)`);

    // 7. Create Discord webhook secret
    await db.collection('tenants').doc('ej').collection('secrets').doc('webhook').set({
      discordUrl: 'https://discord.com/api/webhooks/test-local-emulator',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: tenants/ej/secrets/webhook`);

    console.log('\n✅✅✅ SEED COMPLETADO exitosamente ✅✅✅');
    console.log('\n📧 Usuarios de prueba:');
    console.log('   Cliente:    test@ejstore.com / test123456');
    console.log(`   UID:        ${testUser.uid}`);
    console.log('   Admin:      admin@ejstore.com / admin123456');
    console.log(`   UID:        ${adminUser.uid}`);
    console.log('\n🎰 Ruleta: 6 premios, $1,000/giro, 3 giros = 1 free spin');
    console.log('💰 Balance: $50,000 COP (cliente de prueba)');
    console.log('\n🌐 Emulator UI: http://localhost:4000');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seed();
