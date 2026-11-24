const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createStockAvailabilityHandler } = require('../../functions/services/stockAvailability');
const { createPurchaseCredentialsHandler } = require('../../functions/services/purchaseCredentials');

// Synthetic Firestore boundary. Execute the production handlers, including query
// filters/projection and authorization; no Firebase initialization or config import.
function fixture(overrides = {}, fail = false) {
  const records = {
    'tenants/a': {}, 'tenants/b': {},
    'services/s': { tenantId: 'a' },
    'services/s/accounts/legacy': { status: 'available', credential: { email: 'FICTIONAL', password: 'SECRET' } },
    'services/s/accounts/profiles': { status: 'available', availableProfiles: 3, credential: { email: 'FICTIONAL', password: 'SECRET' } },
    'services/s/accounts/partial': { status: 'sold', availableProfiles: 2 },
    'services/s/accounts/empty': { status: 'available', availableProfiles: 0 },
    'services/s/accounts/sold': { status: 'sold', soldTo: 'owner', purchaseId: 'legacy-purchase', credential: { email: 'fictional@example.invalid', password: 'FICTIONAL', extra: { secret: 'NO' } } },
    'services/s/accounts/profiles/profiles/p': { status: 'sold', soldTo: 'owner', purchaseId: 'purchase', pin: 'PRIVATE' },
    'purchases/purchase': { tenantId: 'a', serviceId: 's', accountId: 'profiles', profileId: 'p', customerId: 'owner' },
    'purchases/legacy-purchase': { tenantId: 'a', serviceId: 's', accountId: 'sold', customerId: 'owner' },
    ...overrides,
  };
  const calls = [];
  const snapshot = (path, fields) => ({ exists: records[path] != null, data: () => {
    const data = records[path];
    return fields ? Object.fromEntries(fields.filter(f => f in data).map(f => [f, data[f]])) : data;
  } });
  const ref = path => ({
    doc: id => ref(`${path}/${id}`),
    collection: name => ref(`${path}/${name}`),
    get: async () => { calls.push(path); if (fail) throw new Error('PRIVATE DATABASE DETAIL'); return snapshot(path); },
    where: (field, op, value) => ({ select: (...fields) => ({ get: async () => {
      calls.push({ path, field, op, value, fields });
      if (fail) throw new Error('PRIVATE DATABASE DETAIL');
      const docs = Object.keys(records).filter(key => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
        .filter(key => records[key] && (op === '>' ? records[key][field] > value : records[key][field] === value))
        .map(key => snapshot(key, fields));
      return { docs };
    } }) }),
  });
  return { db: { collection: ref }, calls };
}
const request = { tenantId: 'a', serviceId: 's' };
const auth = { auth: { uid: 'owner' } };

test('public stock: legacy + profiles + partial, no double count, no secrets/ids', async () => {
  const { db, calls } = fixture();
  const handler = createStockAvailabilityHandler(db);
  assert.deepEqual(await handler(request, { auth: null }), { available: 6 });
  assert.deepEqual(calls.filter(c => typeof c === 'object').map(c => c.fields), [['availableProfiles'], ['availableProfiles']]);
});
test('public stock: actual zero is distinct from query failure', async () => {
  const { db } = fixture({
    'services/s/accounts/legacy': null, 'services/s/accounts/profiles': null, 'services/s/accounts/partial': null,
  });
  assert.deepEqual(await createStockAvailabilityHandler(db)(request), { available: 0 });
  await assert.rejects(createStockAvailabilityHandler(fixture({}, true).db)(request), error =>
    error.code === 'unavailable' && !JSON.stringify(error).includes('PRIVATE'));
});
test('stock rejects invalid contract before any database query', async () => {
  for (const data of [null, [], {}, { ...request, serviceId: '../x' }, { ...request, tenantId: 3 },
    { ...request, serviceIds: ['s'] }, { ...request, accountId: 'secret' }, { ...request, serviceId: 'x'.repeat(1501) }]) {
    const { db, calls } = fixture();
    await assert.rejects(createStockAvailabilityHandler(db)(data), { code: 'invalid-argument' });
    assert.deepEqual(calls, []);
  }
});
test('tenant mismatch / missing tenant / missing service share denial without inventory query', async () => {
  for (const data of [{ ...request, tenantId: 'b' }, { ...request, tenantId: 'missing' }, { ...request, serviceId: 'missing' }]) {
    const { db, calls } = fixture();
    await assert.rejects(createStockAvailabilityHandler(db)(data), { code: 'not-found', message: 'Servicio no disponible' });
    assert.equal(calls.some(c => typeof c === 'object'), false);
  }
});
test('diamond inventory is not zero; malformed counters fail closed', async () => {
  await assert.rejects(createStockAvailabilityHandler(fixture({ 'services/s': { tenantId: 'a', serviceType: 'diamond' } }).db)(request), { code: 'failed-precondition' });
  for (const count of [-1, 1.5, '2', null]) {
    await assert.rejects(createStockAvailabilityHandler(fixture({ 'services/s/accounts/profiles': { status: 'available', availableProfiles: count } }).db)(request), { code: 'unavailable' });
  }
});
test('profile purchaser retrieves own credential while parent remains available', async () => {
  assert.deepEqual(await createPurchaseCredentialsHandler(fixture().db)({ purchaseId: 'purchase' }, auth), {
    credential: { email: 'FICTIONAL', password: 'SECRET' },
  });
});
test('legacy sold owner retrieves allowlisted credential only', async () => {
  assert.deepEqual(await createPurchaseCredentialsHandler(fixture().db)({ purchaseId: 'legacy-purchase' }, auth), {
    credential: { email: 'fictional@example.invalid', password: 'FICTIONAL' },
  });
});
test('legacy owner delivery tolerates historical account without purchaseId', async () => {
  const { db } = fixture({ 'services/s/accounts/sold': { status: 'sold', soldTo: 'owner', credential: { email: 'legacy@example.invalid', password: 'FICTIONAL' } } });
  assert.deepEqual(await createPurchaseCredentialsHandler(db)({ purchaseId: 'legacy-purchase' }, auth), {
    credential: { email: 'legacy@example.invalid', password: 'FICTIONAL' },
  });
});
test('credential endpoint requires auth and validates input', async () => {
  const handler = createPurchaseCredentialsHandler(fixture().db);
  await assert.rejects(handler({ purchaseId: 'purchase' }, { auth: null }), { code: 'unauthenticated' });
  await assert.rejects(handler({ purchaseId: '../purchase' }, auth), { code: 'invalid-argument' });
  await assert.rejects(handler({ purchaseId: 'purchase', accountId: 'other' }, auth), { code: 'invalid-argument' });
});
test('unrelated customer or admin cannot use credential endpoint, even with claimed role', async () => {
  for (const context of [{ auth: { uid: 'stranger' } }, { auth: { uid: 'admin', token: { role: 'superadmin' } } }]) {
    const { db, calls } = fixture();
    await assert.rejects(createPurchaseCredentialsHandler(db)({ purchaseId: 'purchase' }, context), { code: 'not-found' });
    assert.deepEqual(calls, ['purchases/purchase']);
  }
});
test('private delivery checks tenant, current assignment and purchase binding', async () => {
  for (const override of [
    { 'services/s': { tenantId: 'b' } },
    { 'services/s/accounts/profiles/profiles/p': { status: 'sold', soldTo: 'other', purchaseId: 'purchase' } },
    { 'services/s/accounts/profiles/profiles/p': { status: 'available', soldTo: 'owner', purchaseId: 'purchase' } },
    { 'services/s/accounts/profiles/profiles/p': { status: 'sold', soldTo: 'owner', purchaseId: 'other-purchase' } },
    { 'services/s/accounts/profiles': null },
    { 'services/s/accounts/profiles/profiles/p': null },
    { 'purchases/purchase': { customerId: 'owner', serviceId: 's', accountId: 'profiles', profileId: 'p' } },
    { 'services/s/accounts/profiles/profiles/p': { status: 'sold', soldTo: 'owner' } },
  ]) {
    await assert.rejects(createPurchaseCredentialsHandler(fixture(override).db)({ purchaseId: 'purchase' }, auth), { code: 'not-found' });
  }
});

test('historical flat aliases work only with a verified legacy sold assignment', async () => {
  const { db } = fixture({ 'services/s/accounts/sold': { status: 'sold', soldTo: 'owner', correo: 'legacy@example.invalid', clave: 'FICTIONAL', pin: 'PRIVATE' } });
  assert.deepEqual(await createPurchaseCredentialsHandler(db)({ purchaseId: 'legacy-purchase' }, auth), {
    credential: { email: 'legacy@example.invalid', password: 'FICTIONAL' },
  });
});
test('private recovery database failures remain unavailable, never credential or internal detail', async () => {
  await assert.rejects(createPurchaseCredentialsHandler(fixture({}, true).db)({ purchaseId: 'purchase' }, auth), error =>
    error.code === 'unavailable' && !JSON.stringify(error).includes('PRIVATE'));
});

test('real API registry binds public aggregate and bearer-only delivery to correct handlers', () => {
  const { readFileSync } = require('node:fs');
  const vm = require('node:vm');
  const getStockAvailability = createStockAvailabilityHandler(fixture().db);
  const getPurchaseCredentials = createPurchaseCredentialsHandler(fixture().db);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../../api/src/registry.js'), 'utf8'), {
    module, require: path => path === '../../functions/availability'
      ? { getStockAvailability, getPurchaseCredentials } : {},
  });
  const registry = module.exports.FN_REGISTRY;
  assert.equal(registry.getStockAvailability.auth, 'none');
  assert.equal(registry.getStockAvailability.handler, getStockAvailability);
  assert.equal(registry.getPurchaseCredentials.auth, 'bearer');
  assert.equal(registry.getPurchaseCredentials.handler, getPurchaseCredentials);
  // Keep the existing API exact-route regression table compatible with EXPAND,
  // without importing Admin SDK or installing the whole API test environment.
  const suite = readFileSync(require.resolve('../../api/tests/registry.test.js'), 'utf8');
  const table = suite.match(/const SPEC_ROUTES = (\[[\s\S]*?\]);/)[1];
  const expected = vm.runInNewContext(table);
  assert.deepEqual(Object.keys(registry).sort(), Array.from(expected, route => route.name).sort());
  for (const route of expected) assert.equal(registry[route.name].auth, route.auth);
});
