// Synthetic fixtures based on Wompi Colombia docs, retrieved 2026-11-25.
// Real handlers + real Auth/Firestore emulators. Only outbound provider HTTP
// and notifications use the existing infrastructure boundary.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./boundaries.cjs');
const { db, auth, admin } = fixture;
const { hash, verifyEvent } = require('../../functions/services/wompiProtocol');
const { getWompiConfig, saveWompiConfig, getWompiAvailability, createWompiCheckout, handleWompiEvent, wompiWebhook } = require('../../functions/wompi');
const { processRecharge, checkRechargePayment, createRechargeRequest } = require('../../functions/recharges');
let tenantId, customer, adminCtx, calls;
const credentials = (environment = 'prod') => ({ enabled: true, environment,
  publicKey: `pub_${environment}_SYNTHETIC`, privateKey: `prv_${environment}_SYNTHETIC`,
  eventsSecret: `${environment}_events_SYNTHETIC`, integritySecret: `${environment}_integrity_SYNTHETIC` });
async function user(role, tenant = tenantId) {
  const record = await auth.createUser({ email: `${randomUUID()}@example.invalid`, password: 'synthetic-test-only' });
  await auth.setCustomUserClaims(record.uid, { role, ...(tenant ? { tenantId: tenant } : {}) });
  return { auth: { uid: record.uid, token: { role, email_verified: true } } };
}
beforeEach(async () => {
  tenantId = `w-${randomUUID()}`; calls = [];
  await db.collection('tenants').doc(tenantId).set({ name: 'Synthetic' });
  adminCtx = await user('admin'); customer = await user('client');
  await db.collection('customers').doc(customer.auth.uid).set({ tenantId, balance: 10000, name: 'Synthetic Customer', phone: '3001234567' });
  fixture.setEmails([]);
  fixture.setWompiGet(async (url, options) => { calls.push({ url, options }); throw new Error('No response'); });
});
after(fixture.close);
const config = (env = 'prod') => saveWompiConfig({ tenantId, ...credentials(env) }, adminCtx);
const create = (ctx = customer, amount = 50000, key = randomUUID()) => createWompiCheckout({ tenantId, amount, idempotencyKey: key }, ctx);
const balance = async (ctx = customer, collection = 'customers') => (await db.collection(collection).doc(ctx.auth.uid).get()).data().balance;
function event(reference, overrides = {}, environment = 'prod') {
  const value = { event: 'transaction.updated', environment, timestamp: 1530291411,
    data: { transaction: { id: `tx-${randomUUID()}`, reference, amount_in_cents: 5000000, currency: 'COP', status: 'APPROVED', ...overrides } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] } };
  value.signature.checksum = hash(value.signature.properties.map(path => value.data.transaction[path.split('.')[1]]).join('') + value.timestamp + credentials(environment).eventsSecret);
  return value;
}
function provider(value, overrides = {}) {
  fixture.setWompiGet(async (url, options) => {
    calls.push({ url, options }); return { data: { data: { ...value.data.transaction, ...overrides } } };
  });
}
async function assertUntouched(reference) {
  assert.equal(await balance(), 10000);
  assert.equal((await db.collection('recharges').doc(reference).get()).data().status, 'pending');
  assert.equal((await db.collection('balanceTransactions').doc(reference).get()).exists, false);
}

test('absent config defaults to QR and cannot create Wompi; legacy QR still works', async () => {
  assert.deepEqual(await getWompiAvailability({ tenantId }, customer), { enabled: false });
  await assert.rejects(create());
  const qr = await createRechargeRequest({ tenantId, amount: 50000, customerName: 'Synthetic', customerPhone: '3001234567' }, customer);
  const record = (await db.collection('recharges').doc(qr.rechargeId).get()).data();
  assert.equal(record.provider, undefined);
  await processRecharge({ rechargeId: qr.rechargeId, action: 'approve' }, adminCtx);
  assert.equal(await balance(), 60000);
});
test('tenant A config does not enable tenant B and forged payload tenant cannot create', async () => {
  await config(); const other = await user('client', 'other');
  await db.collection('customers').doc(other.auth.uid).set({ tenantId: 'other', balance: 0 });
  assert.deepEqual(await getWompiAvailability({}, other), { enabled: false });
  assert.deepEqual(await getWompiAvailability({ tenantId: 'other' }, customer), { enabled: false });
  await assert.rejects(createWompiCheckout({ tenantId: 'other', amount: 50000, idempotencyKey: randomUUID() }, customer), { code: 'permission-denied' });
});
test('config is admin scoped, never returns private keys, and supports explicit superadmin tenant', async () => {
  await assert.rejects(saveWompiConfig({ tenantId, ...credentials() }, customer), { code: 'permission-denied' });
  await assert.rejects(saveWompiConfig({ tenantId: 'other', ...credentials() }, adminCtx), { code: 'permission-denied' });
  const superadmin = await user('superadmin', null);
  await assert.rejects(getWompiConfig({}, superadmin), { code: 'permission-denied' });
  await saveWompiConfig({ tenantId, ...credentials() }, superadmin);
  const status = await getWompiConfig({ tenantId }, adminCtx);
  assert.deepEqual(Object.keys(status).sort(), ['configured', 'enabled', 'environment', 'publicKey']);
  assert.equal(status.enabled, true);
});
test('mixed environment keys and incomplete enable are rejected; disable preserves private credentials', async () => {
  await assert.rejects(saveWompiConfig({ tenantId, enabled: true, environment: 'test' }, adminCtx));
  await assert.rejects(saveWompiConfig({ tenantId, ...credentials(), privateKey: 'prv_test_SYNTHETIC' }, adminCtx));
  await config(); await saveWompiConfig({ tenantId, enabled: false }, adminCtx);
  assert.deepEqual(await getWompiAvailability({}, customer), { enabled: false }); await assert.rejects(create());
});
test('claims are required; mutable customer tenant and client-supplied beneficiary cannot reroute payment', async () => {
  await config(); await db.collection('customers').doc(customer.auth.uid).update({ tenantId: 'other' });
  await assert.rejects(create());
  await db.collection('customers').doc(customer.auth.uid).update({ tenantId });
  const missing = await user('client', null);
  await db.collection('customers').doc(missing.auth.uid).set({ tenantId, balance: 0 });
  assert.deepEqual(await getWompiAvailability({}, missing), { enabled: false });
});
test('server signs safe integer COP cents and persists private authority; checkout contains no secret', async () => {
  await config(); const result = await create();
  const url = new URL(result.checkoutUrl);
  assert.equal(url.origin, 'https://checkout.wompi.co'); assert.equal(url.pathname, '/p/');
  assert.equal(url.searchParams.get('amount-in-cents'), '5000000');
  assert.equal(url.searchParams.get('signature:integrity'), hash(`${result.reference}5000000COP${credentials().integritySecret}`));
  assert.equal(result.checkoutUrl.includes('SYNTHETIC'), true); // public key only
  for (const secret of ['privateKey', 'integritySecret', 'eventsSecret']) assert.equal(JSON.stringify(result).includes(credentials()[secret]), false);
  const intent = (await db.collection('wompi_intents').doc(result.reference).get()).data();
  assert.equal(intent.userId, customer.auth.uid); assert.equal(intent.tenantId, tenantId);
  assert.equal((await db.collection('tenants').doc(tenantId).get()).data().wompi, undefined);
});
test('negative, fractional, oversized, nonnumeric and unsafe amounts fail before creation', async () => {
  await config(); for (const amount of [-1, 999, 1000.01, 5000001, Number.MAX_SAFE_INTEGER, '1e4', 'NaN']) await assert.rejects(create(customer, amount));
});
test('idempotent concurrent checkout creation creates one intent and owner can resume', async () => {
  await config(); const key = randomUUID();
  const results = await Promise.all([create(customer, 50000, key), create(customer, 50000, key)]);
  assert.equal(results[0].reference, results[1].reference);
  assert.equal((await db.collection('wompi_intents').where('userId', '==', customer.auth.uid).get()).size, 1);
  await assert.rejects(create(customer, 60000, key));
  const resumed = await createWompiCheckout({ rechargeId: results[0].reference }, customer);
  assert.equal(resumed.checkoutUrl, results[0].checkoutUrl);
});
test('QR pending blocks Wompi', async () => {
  await config(); await createRechargeRequest({ amount: 50000, customerName: 'Synthetic', customerPhone: '3001234567' }, customer);
  await assert.rejects(create());
});
test('approved customer payment credits once, writes ledger, and verifies fixed authenticated provider URL', async () => {
  await config(); const result = await create(), value = event(result.reference); provider(value);
  await handleWompiEvent(value, 'prod'); await handleWompiEvent(value, 'prod');
  assert.equal(await balance(), 60000);
  assert.equal((await db.collection('balanceTransactions').doc(result.reference).get()).data().amount, 50000);
  assert.equal(calls[0].url, `https://production.wompi.co/v1/transactions/${value.data.transaction.id}`);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${credentials().privateKey}`);
  assert.equal(calls[0].options.maxRedirects, 0);
});
test('approved reseller payment credits reseller only', async () => {
  await config(); const reseller = await user('reseller');
  await db.collection('resellers').doc(reseller.auth.uid).set({ tenantId, balance: 1000 });
  const result = await create(reseller), value = event(result.reference); provider(value);
  await handleWompiEvent(value, 'prod'); assert.equal(await balance(reseller, 'resellers'), 51000);
  assert.equal((await db.collection('customers').doc(reseller.auth.uid).get()).exists, false);
});
test('invalid signature fails before outbound lookup or monetary effects', async () => {
  await config(); const result = await create(), value = event(result.reference); value.signature.checksum = '0'.repeat(64); provider(value);
  await assert.rejects(handleWompiEvent(value, 'prod')); assert.equal(calls.length, 0); await assertUntouched(result.reference);
});
for (const field of ['amount_in_cents', 'status', 'currency', 'reference']) {
  test(`tampered ${field} never credits (unsigned fields verified via private API)`, async () => {
    await config(); const result = await create(), original = event(result.reference), value = structuredClone(original); provider(original);
    value.data.transaction[field] = { amount_in_cents: 100000, status: 'DECLINED', currency: 'USD', reference: `wompi_${'a'.repeat(48)}` }[field];
    await assert.rejects(handleWompiEvent(value, 'prod')); await assertUntouched(result.reference);
  });
}
test('forged reference to another existing intent fails provider comparison', async () => {
  await config(); const first = await create();
  const secondUser = await user('client'); await db.collection('customers').doc(secondUser.auth.uid).set({ tenantId, balance: 0 });
  const second = await create(secondUser), original = event(first.reference), changed = structuredClone(original); provider(original);
  changed.data.transaction.reference = second.reference;
  await assert.rejects(handleWompiEvent(changed, 'prod')); await assertUntouched(first.reference); assert.equal(await balance(secondUser), 0);
});
test('wrong environment or provider merchant, reference, amount, currency, status never credits', async () => {
  await config(); const result = await create(), value = event(result.reference);
  provider(value); await assert.rejects(handleWompiEvent(value, 'test'));
  for (const overrides of [{ merchant: { public_key: 'pub_prod_OTHER' } }, { merchant: { id: 'pub_prod_OTHER' } }, { reference: 'other' }, { amount_in_cents: 10 }, { currency: 'USD' }, { status: 'PENDING' }]) {
    provider(value, overrides); await assert.rejects(handleWompiEvent(value, 'prod')); await assertUntouched(result.reference);
  }
});
test('PENDING does not credit; declined/error/voided finalize without balance or ledger', async () => {
  await config(); const result = await create();
  let value = event(result.reference, { status: 'PENDING' }); provider(value); await handleWompiEvent(value, 'prod'); await assertUntouched(result.reference);
  for (const status of ['DECLINED', 'ERROR', 'VOIDED']) {
    const created = status === 'DECLINED' ? result : await create(); value = event(created.reference, { status }); provider(value);
    await handleWompiEvent(value, 'prod'); assert.equal(await balance(), 10000);
    assert.equal((await db.collection('recharges').doc(created.reference).get()).data().status, 'rejected');
  }
});
test('concurrent webhook retries and manual approval race credit exactly once; IMAP never runs', async () => {
  await config(); const result = await create(), value = event(result.reference); provider(value);
  assert.equal((await checkRechargePayment({ rechargeId: result.reference }, customer)).processed, false); assert.equal(fixture.imapCalls(), 0);
  const results = await Promise.allSettled([handleWompiEvent(value, 'prod'), handleWompiEvent(value, 'prod'),
    processRecharge({ rechargeId: result.reference, action: 'approve' }, adminCtx)]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'fulfilled'); assert.equal(results[2].status, 'rejected');
  assert.equal(await balance(), 60000);
});
test('public provider removal cannot bypass manual guard; altered authority fails closed', async () => {
  await config(); const result = await create(); const ref = db.collection('recharges').doc(result.reference);
  await ref.update({ provider: admin.firestore.FieldValue.delete() });
  await assert.rejects(processRecharge({ rechargeId: result.reference, action: 'approve' }, adminCtx));
  await ref.update({ amount: 100000 }); const value = event(result.reference); provider(value);
  await assert.rejects(handleWompiEvent(value, 'prod')); assert.equal(await balance(), 10000);
});
test('transaction ID is consumed globally per environment and cannot pay a second recharge', async () => {
  await config(); const first = await create(), value = event(first.reference); provider(value); await handleWompiEvent(value, 'prod');
  const second = await create(), replay = event(second.reference, { id: value.data.transaction.id }); provider(replay);
  await assert.rejects(handleWompiEvent(replay, 'prod')); assert.equal(await balance(), 60000);
  assert.equal((await db.collection('recharges').doc(second.reference).get()).data().status, 'pending');
});
test('sandbox approval finalizes but never credits real balances or monetary ledger', async () => {
  await config('test'); const result = await create(), value = event(result.reference, {}, 'test'); provider(value);
  await handleWompiEvent(value, 'test'); assert.equal(await balance(), 10000);
  assert.equal((await db.collection('recharges').doc(result.reference).get()).data().status, 'sandbox_approved');
  assert.equal((await db.collection('balanceTransactions').doc(result.reference).get()).exists, false);
});
test('rotation/disable preserves verification for existing payments; new checkouts remain disabled', async () => {
  await config(); const result = await create(), value = event(result.reference);
  await saveWompiConfig({ tenantId, ...credentials('test'), enabled: false }, adminCtx);
  assert.deepEqual(await getWompiAvailability({ rechargeId: result.reference }, customer), { enabled: true, environment: 'prod' });
  assert.equal((await createWompiCheckout({ rechargeId: result.reference }, customer)).checkoutUrl, result.checkoutUrl);
  const stranger = await user('client');
  await db.collection('customers').doc(stranger.auth.uid).set({ tenantId, balance: 0 });
  assert.deepEqual(await getWompiAvailability({ rechargeId: result.reference }, stranger), { enabled: false });
  await assert.rejects(createWompiCheckout({ rechargeId: result.reference }, stranger));
  provider(value);
  await handleWompiEvent(value, 'prod'); assert.equal(await balance(), 60000); await assert.rejects(create());
});
test('provider failures are retryable and never leak authorization credentials', async () => {
  await config(); const result = await create(), value = event(result.reference);
  await assert.rejects(handleWompiEvent(value, 'prod'), error => error.code === 'unavailable' && !JSON.stringify(error).includes('prv_'));
  await assertUntouched(result.reference);
  const response = { status(value) { this.code = value; return this; }, json(value) { this.body = value; } };
  await wompiWebhook({ body: value, params: { environment: 'prod' } }, response); assert.equal(response.code, 503);
});
test('signature accepts dynamic property order and uppercase hex, rejects missing coverage and prototype paths', () => {
  // Official published inputs, not a live credential. The docs' printed
  // digest is inconsistent with those inputs. Node crypto AND Python hashlib
  // independently produce 5a18...; do not special-case the provider's example.
  const published = { event: 'transaction.updated', timestamp: 1530291411,
    data: { transaction: { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4490000 } },
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: '3476DDA50F64CD7CBD160689640506FEBEA93239BC524FC0469B2C68A3CC8BD0' } };
  assert.equal(verifyEvent(published, 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z'), false);
  published.signature.checksum = '5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe';
  assert.equal(verifyEvent(published, 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z'), true);
  for (const timestamp of ['1530291411', 1530291411.1, -1, null]) {
    assert.equal(verifyEvent({ ...published, timestamp }, 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z'), false);
  }
  const value = event(`wompi_${'a'.repeat(48)}`);
  value.signature.properties = ['transaction.currency', 'transaction.amount_in_cents', 'transaction.status', 'transaction.id'];
  value.signature.checksum = hash(value.signature.properties.map(path => value.data.transaction[path.split('.')[1]]).join('') + value.timestamp + credentials().eventsSecret).toUpperCase();
  assert.equal(verifyEvent(value, credentials().eventsSecret), true);
  value.signature.properties = ['transaction.__proto__.status']; assert.equal(verifyEvent(value, credentials().eventsSecret), false);
  value.signature.properties = ['transaction.status']; assert.equal(verifyEvent(value, credentials().eventsSecret), false);
});

test('Wompi pending blocks QR through the existing shared lock', async () => {
  await config(); const result = await create();
  const qr = await createRechargeRequest({ amount: 50000, customerName: 'Synthetic', customerPhone: '3001234567' }, customer);
  assert.equal(qr.alreadyPending, true); assert.equal(qr.rechargeId, result.reference);
});
test('tenant B event secret cannot authenticate tenant A payment', async () => {
  await config(); const first = await create();
  const otherTenant = `other-${randomUUID()}`, otherUser = await user('client', otherTenant);
  await db.collection('tenants').doc(otherTenant).set({ name: 'B' });
  await db.collection('customers').doc(otherUser.auth.uid).set({ tenantId: otherTenant, balance: 0 });
  const superadmin = await user('superadmin', null);
  await saveWompiConfig({ ...credentials(), tenantId: otherTenant, eventsSecret: 'prod_events_OTHER' }, superadmin);
  const second = await createWompiCheckout({ amount: 50000, idempotencyKey: randomUUID() }, otherUser);
  const value = event(first.reference); value.data.transaction.reference = second.reference; provider(value);
  await assert.rejects(handleWompiEvent(value, 'prod')); assert.equal(calls.length, 0);
  assert.equal(await balance(otherUser), 0); await assertUntouched(first.reference);
});
test('missing beneficiary rolls back payment consumption, private state and monetary ledger', async () => {
  await config(); const result = await create(), value = event(result.reference); provider(value);
  await db.collection('customers').doc(customer.auth.uid).delete();
  await assert.rejects(handleWompiEvent(value, 'prod'));
  assert.equal((await db.collection('wompi_intents').doc(result.reference).get()).data().status, 'pending');
  assert.equal((await db.collection('wompi_payment_consumptions').doc(hash(`prod:${value.data.transaction.id}`)).get()).exists, false);
  assert.equal((await db.collection('balanceTransactions').doc(result.reference).get()).exists, false);
});
test('real Express HTTP webhook is public but verified; callable config/checkout remain Bearer-only and no-store', async () => {
  await config(); const result = await create(), value = event(result.reference); provider(value);
  // Isolate unrelated registry handlers, retaining the real app, middleware,
  // provider route, Wompi handlers and emulator SDKs.
  const registryFile = require.resolve('../../api/src/registry');
  const saved = require.cache[registryFile];
  const handlers = require('../../functions/wompi');
  require.cache[registryFile] = { id: registryFile, filename: registryFile, loaded: true, exports: {
    EXCLUDED_ROUTES: {}, FN_REGISTRY: Object.fromEntries(['getWompiConfig', 'saveWompiConfig', 'createWompiCheckout', 'getWompiAvailability']
      .map(name => [name, { auth: 'bearer', handler: handlers[name] }])) } };
  let verifies = 0;
  const { HttpsError } = require('../../functions/services/httpsError');
  const app = require('../../api/src/app').createApp(undefined, { verifyBearer: async () => {
    verifies++; throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  } });
  if (saved) require.cache[registryFile] = saved; else delete require.cache[registryFile];
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = (path, body) => new Promise((resolve, reject) => {
    const req = require('node:http').request({ hostname: '127.0.0.1', port: server.address().port,
      path, method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let text = ''; res.on('data', data => { text += data; }); res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  try {
    for (const name of ['getWompiConfig', 'saveWompiConfig', 'createWompiCheckout', 'getWompiAvailability']) {
      const response = await request(`/api/${name}`, { data: {} });
      assert.equal(response.code, 401); assert.equal(response.headers['cache-control'], 'private, no-store');
    }
    assert.equal(verifies, 4);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 200);
    assert.equal(verifies, 4); assert.equal(await balance(), 60000);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 200);
    value.signature.checksum = '0'.repeat(64);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 400);
    assert.equal((await request('/api/wompi/events/test', value)).code, 400);
    assert.equal((await request('/api/wompi/events/unknown', value)).code, 400);
    assert.equal(await balance(), 60000);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
