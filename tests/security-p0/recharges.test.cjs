// Adapted only from functions/tests/integration/recharges.test.js P0 block.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./boundaries.cjs');
const { db, auth, admin, setEmails } = fixture;
const { processRecharge, checkRechargePayment } = require('../../functions/recharges');
let tenantId, customerId;
beforeEach(async () => {
  tenantId = `tenant-${randomUUID()}`;
  await db.collection('tenants').doc(tenantId).set({ name: 'Test Tenant', isActive: true });
  const customer = await db.collection('customers').add({ tenantId, email: 'customer@example.invalid', balance: 10000 });
  customerId = customer.id;
  setEmails([]);
});
after(fixture.close);
const context = () => ({ auth: { uid: customerId, token: { email: 'customer@example.invalid', email_verified: true } } });
async function adminContext() {
  const user = await auth.createUser({ email: `${randomUUID()}@example.invalid`, password: 'synthetic-test-only' });
  await auth.setCustomUserClaims(user.uid, { role: 'admin', tenantId });
  return { auth: { uid: user.uid, token: { email: user.email } } };
}
const pending = (overrides = {}) => db.collection('recharges').add({
  userId: customerId, customerName: 'Test Customer', tenantId, amount: 50000,
  status: 'pending', createdAt: admin.firestore.Timestamp.now(), ...overrides,
});
const balance = async (uid = customerId, collection = 'customers') => (await db.collection(collection).doc(uid).get()).data()?.balance;
const ledger = id => db.collection('balanceTransactions').doc(id).get();
const processedError = { code: 'failed-precondition', details: { code: 'RECARGA_YA_PROCESADA' } };
async function payments(allowedSenders) {
  await db.collection('tenants').doc(tenantId).collection('secrets').doc('emailConfigPayments').set({
    email: 'payments@example.invalid', password: 'synthetic-test-only', host: 'imap.example.invalid', port: 993,
    ...(allowedSenders ? { allowedSenders } : {}),
  });
}
function email({ uid = 101, from = 'pagos@banco.example', amount = 50000 } = {}) {
  setEmails([{ uid, from, body: `Recibiste un pago de Test Customer por $${amount}` }]);
}
const check = ref => checkRechargePayment({ rechargeId: ref.id }, context());
const consumption = uid => db.collection('recharge_payment_consumptions').doc(`${tenantId}__777__${uid}`).get();

test('P0-1 sequential approval credits once and creates tenant ledger', async () => {
  const ref = await pending(), ctx = await adminContext();
  assert.deepEqual(await processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx), { success: true, status: 'approved' });
  assert.equal(await balance(), 60000);
  await assert.rejects(processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx), processedError);
  assert.equal((await ref.get()).data().status, 'approved');
  assert.equal(await balance(), 60000);
  const data = (await ledger(ref.id)).data();
  assert.equal(data.amount, 50000); assert.equal(data.type, 'recharge');
  assert.equal(data.customerId, customerId); assert.equal(data.tenantId, tenantId);
});
test('P0-1 concurrent approvals have one winner and one credit', async () => {
  const ref = await pending(), ctx = await adminContext();
  const results = await Promise.allSettled([1, 2].map(() => processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failures = results.filter(r => r.status === 'rejected');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.details.code, 'RECARGA_YA_PROCESADA');
  assert.equal(await balance(), 60000);
  assert.equal((await ref.get()).data().status, 'approved');
  assert.equal((await ledger(ref.id)).data().amount, 50000);
});
test('P0-1 missing beneficiary rolls back status and ledger', async () => {
  const ghost = randomUUID(), ref = await pending({ userId: ghost }), ctx = await adminContext();
  await assert.rejects(processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx));
  assert.equal((await ref.get()).data().status, 'pending');
  assert.equal((await ledger(ref.id)).exists, false);
  for (const collection of ['customers', 'resellers']) assert.equal((await db.collection(collection).doc(ghost).get()).exists, false);
  assert.equal(await balance(), 10000);
});
test('P0-1 rejected recharge cannot be approved', async () => {
  const ref = await pending(), ctx = await adminContext();
  await processRecharge({ rechargeId: ref.id, action: 'reject', reason: 'sin pago' }, ctx);
  await assert.rejects(processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx), processedError);
  assert.equal((await ref.get()).data().status, 'rejected');
  assert.equal(await balance(), 10000); assert.equal((await ledger(ref.id)).exists, false);
});
test('P0-1 approved recharge cannot be rejected', async () => {
  const ref = await pending(), ctx = await adminContext();
  await processRecharge({ rechargeId: ref.id, action: 'approve' }, ctx);
  await assert.rejects(processRecharge({ rechargeId: ref.id, action: 'reject', reason: 'x' }, ctx), processedError);
  assert.equal((await ref.get()).data().status, 'approved'); assert.equal(await balance(), 60000);
});
test('P0-1 reseller self recharge updates reseller without phantom customer', async () => {
  const uid = randomUUID();
  await db.collection('resellers').doc(uid).set({ tenantId, balance: 100000, isActive: true, commissionPercent: 10 });
  const ref = await pending({ userId: uid, resellerId: uid });
  await processRecharge({ rechargeId: ref.id, action: 'approve' }, await adminContext());
  assert.equal(await balance(uid, 'resellers'), 150000);
  assert.equal((await db.collection('customers').doc(uid).get()).exists, false);
  const data = (await ledger(ref.id)).data();
  assert.equal(data.customerId, uid); assert.equal(data.tenantId, tenantId); assert.equal(data.amount, 50000);
});
test('P0-2 disallowed From leaves status, balance, ledger and UID intact', async () => {
  const ref = await pending(); await payments(['pagos@banco.example']); email({ from: 'attacker@evil.example' });
  assert.equal((await check(ref)).processed, false);
  assert.equal((await ref.get()).data().status, 'pending'); assert.equal(await balance(), 10000);
  assert.equal((await ledger(ref.id)).exists, false); assert.equal((await consumption(101)).exists, false);
});
test('P0-2 missing allowlist fails closed before IMAP connection', async () => {
  const ref = await pending(); await payments(); email();
  assert.equal((await check(ref)).processed, false); assert.equal(fixture.imapCalls(), 0);
  assert.equal(await balance(), 10000); assert.equal((await ref.get()).data().status, 'pending');
});
test('P0-2 exact amount and allowed From approve and consume UID atomically', async () => {
  const ref = await pending(); await payments(['pagos@banco.example']); email({ from: 'Pagos Banco <pagos@banco.example>' });
  const result = await check(ref);
  assert.equal(result.processed, true); assert.equal(result.status, 'approved');
  assert.equal((await ref.get()).data().emailUid, '101'); assert.equal(await balance(), 60000);
  const data = (await consumption(101)).data();
  assert.equal(data.rechargeId, ref.id); assert.equal(data.emailUid, '101'); assert.equal(data.uidValidity, 777);
  assert.equal((await ledger(ref.id)).data().amount, 50000);
});
test('P0-2 second recharge cannot consume same message UID', async () => {
  const first = await pending(); await payments(['pagos@banco.example']); email();
  assert.equal((await check(first)).processed, true);
  const second = await pending(); email();
  assert.equal((await check(second)).processed, false);
  assert.equal((await second.get()).data().status, 'pending'); assert.equal(await balance(), 60000);
  assert.equal((await ledger(second.id)).exists, false);
});
test('P0-2 historical amount tolerance is rejected (50100 versus 50000)', async () => {
  const ref = await pending(); await payments(['pagos@banco.example']); email({ amount: 50100 });
  assert.equal((await check(ref)).processed, false);
  assert.equal(await balance(), 10000); assert.equal((await ref.get()).data().status, 'pending');
});
test('P0-2 domain allowlist accepts matching From domain', async () => {
  const ref = await pending(); await payments(['@banco.example']); email({ uid: 105, from: 'avisos@banco.example' });
  assert.equal((await check(ref)).processed, true); assert.equal(await balance(), 60000);
  assert.equal((await consumption(105)).exists, true);
});
