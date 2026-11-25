// Seven P0-4 integration scenarios plus the actual registry tombstone.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const fixture = require('./boundaries.cjs');
const { auth, db, root } = fixture;
const { adminDeleteResellerByEmail: remove } = require('../../functions/admin');
after(fixture.close);
async function user(role, tenantId) {
  const record = await auth.createUser({ email: `${randomUUID()}@example.invalid`, password: 'synthetic-test-only' });
  await auth.setCustomUserClaims(record.uid, { role, tenantId });
  return record;
}
const context = record => ({ auth: { uid: record.uid, token: { email: record.email } } });
async function docs(record, role, tenantId) {
  await db.collection('users').doc(record.uid).set({ role, tenantId, email: record.email });
  if (role === 'reseller') await db.collection('resellers').doc(record.uid).set({ tenantId, email: record.email, balance: 0, isActive: true });
}
async function intact(record, role) {
  assert.equal((await auth.getUser(record.uid)).uid, record.uid);
  assert.equal((await db.collection('users').doc(record.uid).get()).exists, true);
  assert.equal((await db.collection('resellers').doc(record.uid).get()).exists, role === 'reseller');
}
test('P0-4 admin cannot delete foreign tenant reseller', async () => {
  const caller = await user('admin', 'a'), target = await user('reseller', 'b'); await docs(target, 'reseller', 'b');
  await assert.rejects(remove({ email: target.email }, context(caller)), { code: 'permission-denied', details: { code: 'TENANT_DESTINO_NO_COINCIDE' } });
  await intact(target, 'reseller');
});
for (const role of ['admin', 'customer']) test(`P0-4 admin cannot delete ${role} by email`, async () => {
  const caller = await user('admin', 'a'), target = await user(role, 'a'); await docs(target, role, 'a');
  await assert.rejects(remove({ email: target.email }, context(caller)), { code: 'permission-denied', details: { code: 'DESTINO_NO_RESELLER' } });
  await intact(target, role);
});
for (const role of ['admin', 'superadmin']) test(`P0-4 ${role} authorized deletion removes Auth and both docs`, async () => {
  const caller = await user(role, role === 'admin' ? 'a' : null), target = await user('reseller', role === 'admin' ? 'a' : 'foreign');
  await docs(target, 'reseller', role === 'admin' ? 'a' : 'foreign');
  assert.equal((await remove({ email: target.email }, context(caller))).success, true);
  await assert.rejects(auth.getUser(target.uid), { code: 'auth/user-not-found' });
  for (const collection of ['users', 'resellers']) assert.equal((await db.collection(collection).doc(target.uid).get()).exists, false);
});
test('P0-4 nonexistent email returns not-found', async () => {
  const caller = await user('admin', 'a');
  await assert.rejects(remove({ email: 'nobody@example.invalid' }, context(caller)), { code: 'not-found', message: 'Usuario no encontrado' });
});
test('P0-4 customer caller cannot delete reseller', async () => {
  const caller = await user('customer', 'a'), target = await user('reseller', 'a'); await docs(target, 'reseller', 'a');
  await assert.rejects(remove({ email: target.email }, context(caller)), { code: 'permission-denied', message: 'No tiene permisos de admin' });
  await intact(target, 'reseller');
});
test('P0-4 real API registry excludes deleted route and retains tombstone', () => {
  const module = { exports: {} };
  // Other routes are inert boundaries; registry declarations themselves are real.
  vm.runInNewContext(readFileSync(`${root}/api/src/registry.js`, 'utf8'), {
    module, exports: module.exports, require: () => new Proxy({}, { get: () => () => {} }),
  });
  assert.equal(Object.hasOwn(module.exports.FN_REGISTRY, 'adminDeleteResellerByEmail'), false);
  assert.equal(module.exports.EXCLUDED_ROUTES.adminDeleteResellerByEmail, 'Operación no disponible');
});
