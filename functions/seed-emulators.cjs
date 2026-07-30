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

    // 1b. Create regular admin (for testing — can manage resellers but NOT superadmin)
    let regularAdminUser;
    try {
      regularAdminUser = await auth.createUser({
        email: 'admin2@ejstore.com',
        password: 'admin123456',
      });
      console.log(`✅ Auth user created: ${regularAdminUser.uid} (admin2@ejstore.com)`);
    } catch (e) {
      console.log(`ℹ️  Auth user admin2@ejstore.com already exists (or error): ${e.message}`);
      regularAdminUser = { uid: 'admin2-placeholder' };
    }

    // 2. Set custom claims for users
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

    try {
      await auth.setCustomUserClaims(regularAdminUser.uid, { tenantId: 'ej', role: 'admin' });
      console.log(`✅ Custom claims set for regular admin: tenantId=ej, role=admin`);
    } catch (e) {
      console.log(`ℹ️  Could not set claims for regular admin: ${e.message}`);
    }

    // 3. Create users collection document (solo para admins, NO para customers)
    await db.collection('users').doc(adminUser.uid).set({
      role: 'superadmin',
      tenantId: 'ej',
      email: 'admin@ejstore.com',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: users/${adminUser.uid}`);

    await db.collection('users').doc(regularAdminUser.uid).set({
      role: 'admin',
      tenantId: 'ej',
      email: 'admin2@ejstore.com',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Firestore document created: users/${regularAdminUser.uid} (admin regular)`);

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

    // 8. Create sample services
    const services = [
      {
        name: 'Netflix Premium',
        description: 'Acceso a Netflix Premium 4K con todo el catálogo. Perfil incluido.',
        price: 25000,
        promotionalPrice: 19999,
        wholesalePrice: 15999,
        category: 'streaming',
        tenantId: 'ej',
        isActive: true,
        isPopular: true,
        images: ['https://via.placeholder.com/400x300?text=Netflix'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {
        name: 'Disney+ Premium',
        description: 'Disney+, Marvel, Star Wars, National Geographic y mucho más.',
        price: 15900,
        promotionalPrice: 12999,
        category: 'streaming',
        tenantId: 'ej',
        isActive: true,
        isPopular: true,
        images: ['https://via.placeholder.com/400x300?text=Disney+'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {
        name: 'HBO Max',
        description: 'HBO, DC, Warner Bros. Todo el contenido en un solo lugar.',
        price: 19900,
        category: 'streaming',
        tenantId: 'ej',
        isActive: true,
        images: ['https://via.placeholder.com/400x300?text=HBO+Max'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    ];

    const serviceIds = {};
    for (const svc of services) {
      const ref = await db.collection('services').add(svc);
      serviceIds[svc.name] = ref.id;
      console.log(`✅ Service created: ${svc.name} (${ref.id})`);
    }

    // 9. Create service accounts for Netflix
    const netflixAccounts = [
      { label: 'Netflix #001', credential: { email: 'netflix1@test.com', password: 'passNetflix1' } },
      { label: 'Netflix #002', credential: { email: 'netflix2@test.com', password: 'passNetflix2' } },
      { label: 'Netflix #003', credential: { email: 'netflix3@test.com', password: 'passNetflix3' } },
    ];
    for (const acct of netflixAccounts) {
      await db.collection('services').doc(serviceIds['Netflix Premium']).collection('accounts').add({
        ...acct,
        serviceId: serviceIds['Netflix Premium'],
        tenantId: 'ej',
        status: 'available',
        extras: ['4K', '4 Perfiles'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Account created: ${acct.label}`);
    }

    // 10. Create service accounts for Disney+
    const disneyAccounts = [
      { label: 'Disney+ #001', credential: { email: 'disney1@test.com', password: 'passDisney1' } },
      { label: 'Disney+ #002', credential: { email: 'disney2@test.com', password: 'passDisney2' } },
    ];
    for (const acct of disneyAccounts) {
      await db.collection('services').doc(serviceIds['Disney+ Premium']).collection('accounts').add({
        ...acct,
        serviceId: serviceIds['Disney+ Premium'],
        tenantId: 'ej',
        status: 'available',
        extras: ['Full HD', '4 Perfiles'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Account created: ${acct.label}`);
    }

    // 11. Create a sold account (for historial)
    await db.collection('services').doc(serviceIds['Netflix Premium']).collection('accounts').add({
      label: 'Netflix #004 (vendida)',
      credential: { email: 'netflix4@test.com', password: 'passNetflix4' },
      serviceId: serviceIds['Netflix Premium'],
      tenantId: 'ej',
      status: 'sold',
      soldTo: testUser.uid,
      extras: ['4K', '4 Perfiles'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Sold account created for historial`);

    console.log('\n✅✅✅ SEED COMPLETADO exitosamente ✅✅✅');
    console.log('\n📧 Usuarios de prueba:');
    console.log('   Cliente:    test@ejstore.com / test123456');
    console.log(`   UID:        ${testUser.uid}`);
    console.log('   SuperAdmin: admin@ejstore.com / admin123456');
    console.log(`   UID:        ${adminUser.uid}`);
    console.log('   Admin:      admin2@ejstore.com / admin123456');
    console.log(`   UID:        ${regularAdminUser.uid}`);
    console.log('\n📦 Servicios creados:');
    console.log('   Netflix Premium ($25,000 → $19,999) — 3 cuentas disponibles + 1 vendida');
    console.log('   Disney+ Premium ($15,900 → $12,999) — 2 cuentas disponibles');
    console.log('   HBO Max ($19,900) — sin cuentas (para probar stock 0)');
    console.log('\n💰 Balance cliente: $50,000 COP');
    console.log('\n🌐 Emulator UI: http://localhost:4000');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seed();
