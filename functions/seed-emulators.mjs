import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp({ projectId: 'ejstore-web' });
const db = getFirestore(app);
const auth = getAuth(app);

async function seed() {
  await db.collection('tenants').doc('demo').set({
    name: 'Tienda Demo',
    subdomain: 'demo',
    primaryColor: '#E50914',
    secondaryColor: '#1A1A1A',
    whatsappNumber: '+573001234567',
    contactEmail: 'admin@demo.com',
    isActive: true,
  });
  console.log('✓ Tenant created: demo');

  let uid;
  try {
    const user = await auth.getUserByEmail('admin@demo.com');
    uid = user.uid;
    console.log('✓ Existing user:', uid);
  } catch {
    const user = await auth.createUser({ email: 'admin@demo.com', password: '123456' });
    uid = user.uid;
    console.log('✓ Created user:', uid);
  }

  await auth.setCustomUserClaims(uid, { tenantId: 'demo', role: 'admin' });
  console.log('✓ Claims set: admin@demo.com → admin en demo');

  await db.collection('users').doc(uid).set({ email: 'admin@demo.com', tenantId: 'demo', role: 'admin' });
  console.log('✓ User doc created');

  for (const svc of [
    { id: 'netflix', name: 'Netflix Premium', price: 50000, promo: 45000, wholesale: 35000, plan: 'Premium' },
    { id: 'disney', name: 'Disney+ Premium', price: 40000, promo: 35000, wholesale: 28000, plan: 'Premium' },
    { id: 'hbo', name: 'HBO Max', price: 35000, promo: 30000, wholesale: 24000, plan: 'Standard' },
  ]) {
    await db.collection('services').doc(svc.id).set({
      tenantId: 'demo', name: svc.name, description: `${svc.name}`,
      price: svc.price, promotionalPrice: svc.promo, wholesalePrice: svc.wholesale,
      category: 'streaming', plan: svc.plan, isActive: true,
      hasCodeExtraction: true,
    });
    console.log(`✓ Service: ${svc.name}`);
    for (let i = 1; i <= 5; i++) {
      await db.collection('services').doc(svc.id).collection('accounts').add({
        serviceId: svc.id, tenantId: 'demo',
        credential: { email: `${svc.id}_user${i}@mail.com`, password: `TestPass${i}123` },
        label: `${svc.name} #${i}`, status: 'available',
      });
    }
    console.log(`  5 accounts created`);
  }

  try {
    const cu = await auth.createUser({ email: 'cliente@demo.com', password: '123456' });
    await auth.setCustomUserClaims(cu.uid, { tenantId: 'demo', role: 'customer' });
    await db.collection('customers').doc(cu.uid).set({
      email: 'cliente@demo.com', name: 'Cliente Demo', tenantId: 'demo', balance: 200000,
    });
    console.log('✓ Customer: cliente@demo.com ($200,000 balance)');
  } catch (e) { console.log('Customer exists:', e.message); }

  // Create reseller
  try {
    const ru = await auth.createUser({ email: 'reseller@demo.com', password: '123456' });
    await auth.setCustomUserClaims(ru.uid, { tenantId: 'demo', role: 'reseller' });
    await db.collection('resellers').doc(ru.uid).set({
      name: 'Subdistribuidor Demo', email: 'reseller@demo.com',
      tenantId: 'demo', balance: 500000, commissionPercent: 15,
      isActive: true,
    });
    console.log('✓ Reseller: reseller@demo.com ($500,000 balance, 15% commission)');
  } catch (e) { console.log('Reseller exists:', e.message); }

  // ─── Test public link ────────────────────────────────────────
  const testExpiry = new Date();
  testExpiry.setDate(testExpiry.getDate() + 30);
  await db.collection('public_links').doc('demo-link-netflix').set({
    token: 'demo-link-netflix',
    resellerId: 'demo-reseller',
    serviceId: 'netflix',
    serviceName: 'Netflix Premium',
    status: 'active',
    credential: { email: 'netflix_user1@mail.com', password: 'TestPass1123' },
    createdAt: new Date(),
    expiresAt: testExpiry,
  });
  console.log('✓ Test public link: /r/demo-link-netflix');

  // ─── Expired test link ───────────────────────────────────────
  const expiredDate = new Date('2025-01-01');
  await db.collection('public_links').doc('demo-link-expired').set({
    token: 'demo-link-expired',
    resellerId: 'demo-reseller',
    serviceId: 'hbo',
    serviceName: 'HBO Max',
    status: 'expired',
    credential: { email: 'hbo_user1@mail.com', password: 'ExpiredPass' },
    createdAt: new Date('2024-12-01'),
    expiresAt: expiredDate,
  });
  console.log('✓ Test expired public link: /r/demo-link-expired');

  console.log('\n✅ Seed complete!');
  console.log('  http://localhost:3000/?v=demo');
  console.log('  admin@demo.com / 123456 (admin)');
  console.log('  cliente@demo.com / 123456 (customer)');
  console.log('  reseller@demo.com / 123456 (reseller)');
  console.log('  Link público: http://localhost:3000/?token=demo-link-netflix');
  console.log('  Link expirado: http://localhost:3000/?token=demo-link-expired');
}

seed().catch(console.error);
