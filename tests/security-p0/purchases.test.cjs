// P0-3 scenarios extracted from the preexisting integration suite.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./boundaries.cjs');
const { db } = fixture;
const service = require('../../functions/services/purchaseService');
const handlers = require('../../functions/purchases');
let tenantId, serviceId, customerId, foreignServiceId, foreignAccount;
beforeEach(async () => {
  tenantId = randomUUID();
  async function stock(tenant, name) {
    const ref = await db.collection('services').add({ name, tenantId: tenant, price: 10000, promotionalPrice: 8000, hasCodeExtraction: true, durationDays: 30 });
    const account = await ref.collection('accounts').add({ tenantId: tenant, credential: { email: 'account@example.invalid', password: 'synthetic-only' }, availableProfiles: 2, status: 'available' });
    for (const name of ['Profile 1', 'Profile 2']) await account.collection('profiles').add({ name, pin: '1234', status: 'available' });
    return { ref, account };
  }
  serviceId = (await stock(tenantId, 'Test Service')).ref.id;
  const foreign = await stock('foreign-' + tenantId, 'Foreign Service');
  foreignServiceId = foreign.ref.id; foreignAccount = foreign.account;
  customerId = (await db.collection('customers').add({ tenantId, email: 'customer@example.invalid', balance: 50000 })).id;
});
after(fixture.close);
const customerContext = () => ({ auth: { uid: customerId, token: { email: 'customer@example.invalid', email_verified: true } } });
const reseller = (tenant = tenantId) => db.collection('resellers').add({ tenantId: tenant, email: 'bulk@example.invalid', name: 'Bulk P03', balance: 100000, isActive: true, commissionPercent: 10 });
const bulkContext = uid => ({ auth: { uid, token: { role: 'reseller', email: 'bulk@example.invalid' } } });
const bulkData = (ref, id = serviceId) => ({ serviceId: id, tenantId, resellerId: ref.id, resellerEmail: 'bulk@example.invalid', resellerName: 'Bulk P03', quantity: 1, resellerCommissionPercent: 10 });
test('P0-3 foreign service denied by purchase service and handler without side effects', async () => {
  await assert.rejects(service.processPurchase({ serviceId: foreignServiceId, tenantId, customerId, customerEmail: 'customer@example.invalid' }), /PERMISSION_DENIED/);
  await assert.rejects(handlers.processPurchase({ serviceId: foreignServiceId, tenantId }, customerContext()), { code: 'permission-denied', message: 'No tiene acceso a este servicio' });
  assert.equal((await db.collection('customers').doc(customerId).get()).data().balance, 50000);
  assert.equal((await db.collection('purchases').where('customerId', '==', customerId).get()).size, 0);
  assert.equal((await foreignAccount.collection('profiles').where('status', '==', 'sold').get()).size, 0);
});
test('P0-3 same tenant purchase preserves successful parity', async () => {
  const result = await handlers.processPurchase({ serviceId, tenantId }, customerContext());
  assert.equal(result.success, true); assert.equal(result.newBalance, 42000);
  assert.equal((await db.collection('purchases').doc(result.purchaseId).get()).data().tenantId, tenantId);
});
test('P0-3 foreign service denied for bulk service and handler without debit', async () => {
  const ref = await reseller();
  await assert.rejects(service.processBulkPurchase(bulkData(ref, foreignServiceId)), /PERMISSION_DENIED/);
  await assert.rejects(handlers.processBulkPurchase({ serviceId: foreignServiceId, tenantId, quantity: 1 }, bulkContext(ref.id)), { code: 'permission-denied', message: 'No tiene acceso a este servicio' });
  assert.equal((await ref.get()).data().balance, 100000);
  assert.equal((await db.collection('purchases').where('resellerId', '==', ref.id).get()).size, 0);
});
test('P0-3 foreign reseller document cannot use payload tenant', async () => {
  const ref = await reseller('foreign-' + tenantId);
  await assert.rejects(service.processBulkPurchase(bulkData(ref)), /PERMISSION_DENIED/);
  assert.equal((await ref.get()).data().balance, 100000);
  assert.equal((await db.collection('purchases').where('resellerId', '==', ref.id).get()).size, 0);
});
test('P0-3 same tenant bulk purchase preserves price and tenant', async () => {
  const ref = await reseller();
  const result = await handlers.processBulkPurchase({ serviceId, tenantId, quantity: 1 }, bulkContext(ref.id));
  assert.equal(result.success, true); assert.equal(result.quantity, 1); assert.equal(result.serviceName, 'Test Service');
  assert.equal((await ref.get()).data().balance, 92800);
  const purchases = await db.collection('purchases').where('resellerId', '==', ref.id).get();
  assert.equal(purchases.size, 1); assert.equal(purchases.docs[0].data().tenantId, tenantId);
});
