// Synthetic fixtures based on Wompi Colombia docs, retrieved 2026-11-25.
// Real handlers + real Auth/Firestore emulators. Only outbound provider HTTP
// and notifications use the existing infrastructure boundary.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./boundaries.cjs');
const { db, auth, admin } = fixture;
const { hash, verifyEvent } = require('../../functions/services/wompiProtocol');
const { DEFAULT_POLICY, calculateQuote, normalizePolicies } = require('../../functions/services/wompiFees');
const { getWompiConfig, saveWompiConfig, getWompiAvailability, getWompiQuote, createWompiCheckout, reconcileWompiPayment, handleWompiEvent, wompiWebhook } = require('../../functions/wompi');
const { processRecharge, checkRechargePayment, createRechargeRequest, getRechargeHistory } = require('../../functions/recharges');
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
const acceptedQuotes = new Map();
const create = async (ctx = customer, amount = 50000, key = randomUUID()) => {
  const cacheKey = `${ctx.auth.uid}:${key}`;
  if (!acceptedQuotes.has(cacheKey)) acceptedQuotes.set(cacheKey, await getWompiQuote({ amount }, ctx));
  return createWompiCheckout({ amount, idempotencyKey: key, expectedQuoteHash: acceptedQuotes.get(cacheKey).quoteHash }, ctx);
};
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

test('lost webhook: owner locator is verified against frozen merchant and total; Sandbox settles once without balance', async () => {
  await saveWompiConfig({ tenantId, ...credentials('test'), feePolicies: { test: { payer: 'customer', rateBps: 265, fixedFee: 700, vatBps: 1900 } } }, adminCtx);
  const created = await create(customer, 10000);
  const value = event(created.reference, { amount_in_cents: 1118600 }, 'test');
  provider(value, { merchant: { public_key: credentials('test').publicKey } });
  const data = { rechargeId: created.reference, transactionId: value.data.transaction.id };
  const outcomes = await Promise.all([reconcileWompiPayment(data, customer), reconcileWompiPayment(data, customer)]);
  assert(outcomes.some(outcome => outcome.status === 'sandbox_approved' && outcome.providerChecked));
  const count = calls.length;
  assert.equal((await reconcileWompiPayment(data, customer)).status, 'sandbox_approved');
  assert.equal(calls.length, count);
  await handleWompiEvent(value, 'test');
  assert.equal(await balance(), 10000);
  assert.equal((await db.collection('balanceTransactions').doc(created.reference).get()).exists, false);
  assert.equal((await db.collection('recharges').doc(created.reference).get()).data().providerStatus, 'APPROVED');
  assert.equal((await db.collection('recharges').doc(created.reference).get()).data().feeQuote.totalAmount, 11186);
  assert.equal((await db.collection('recharge_locks').doc(customer.auth.uid).get()).exists, false);
  assert.equal((await db.collection('wompi_payment_consumptions').where('rechargeId', '==', created.reference).get()).size, 1);
});

test('reconciliation rejects foreign actors and tenants before provider requests; missing id stays pending', async () => {
  await config(); const created = await create(); const other = await user('client');
  await db.collection('customers').doc(other.auth.uid).set({ tenantId, balance: 0 });
  const data = { rechargeId: created.reference, transactionId: 'untrusted-locator' };
  await assert.rejects(reconcileWompiPayment(data, { auth: null }), { code: 'unauthenticated' });
  await assert.rejects(reconcileWompiPayment(data, other));
  await assert.rejects(reconcileWompiPayment({ ...data, tenantId: 'other' }, customer));
  assert.equal((await reconcileWompiPayment({ rechargeId: created.reference }, customer)).requiresTransactionId, true);
  assert.equal(calls.length, 0); await assertUntouched(created.reference);
});

test('untrusted callback status cannot settle wrong id, reference, total, currency or merchant; absent merchant fails closed', async () => {
  await config(); const created = await create(), value = event(created.reference);
  for (const override of [{ id: 'other' }, { reference: 'other' }, { amount_in_cents: 1 }, { currency: 'USD' },
    { merchant: { public_key: 'pub_prod_OTHER' } }, { merchant: undefined }, { status: 'UNKNOWN' }]) {
    await db.collection('wompi_intents').doc(created.reference).update({ reconcileAfterMs: 0 });
    provider(value, { merchant: { public_key: credentials().publicKey }, ...override });
    await assert.rejects(reconcileWompiPayment({ rechargeId: created.reference, transactionId: value.data.transaction.id, status: 'APPROVED' }, customer));
    await assertUntouched(created.reference);
    assert.equal((await db.collection('wompi_intents').doc(created.reference).get()).data().verifiedTransactionId, undefined);
  }
});

test('verified pending id survives callback loss; lease bounds checks and frozen version survives rotation', async () => {
  await config(); const created = await create(), value = event(created.reference, { status: 'PENDING' });
  provider(value, { merchant: { public_key: credentials().publicKey } });
  const data = { rechargeId: created.reference, transactionId: value.data.transaction.id };
  assert.equal((await reconcileWompiPayment(data, customer)).status, 'pending');
  await reconcileWompiPayment({ ...data, transactionId: 'other' }, customer); assert.equal(calls.length, 1);
  await config('test');
  await db.collection('wompi_intents').doc(created.reference).update({ reconcileAfterMs: 0 });
  provider(value, { status: 'APPROVED', merchant: { public_key: credentials().publicKey } });
  assert.equal((await reconcileWompiPayment({ rechargeId: created.reference }, customer)).status, 'approved');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${credentials().privateKey}`);
  assert.equal(await balance(), 60000);
});

test('provider outage stays pending without storing an unverified locator or leaking transport errors', async () => {
  await config(); const created = await create();
  await assert.rejects(reconcileWompiPayment({ rechargeId: created.reference, transactionId: 'not-yet-visible' }, customer), error =>
    error.code === 'unavailable' && !error.message.includes('No response'));
  await assertUntouched(created.reference);
  assert.equal((await db.collection('wompi_intents').doc(created.reference).get()).data().verifiedTransactionId, undefined);
});

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
  assert.deepEqual(Object.keys(status).sort(), ['configured', 'enabled', 'environment', 'feePolicies', 'publicKey']);
  assert.equal(status.enabled, true);
});
test('mixed environment keys and incomplete enable are rejected; disable preserves private credentials', async () => {
  // An unused, disabled configuration is valid in either environment.
  await saveWompiConfig({ tenantId, enabled: false, environment: 'prod' }, adminCtx);
  for (const environment of ['test', 'prod']) {
    const valid = credentials(environment);
    for (const [field, label] of Object.entries({ publicKey: 'Llave pública', privateKey: 'Llave privada',
      integritySecret: 'Secreto de integridad', eventsSecret: 'Secreto de eventos' })) {
      // No previous credentials yet: a blank field must identify what is missing.
      await assert.rejects(saveWompiConfig({ tenantId, ...valid, [field]: '' }, adminCtx), error =>
        error.code === 'invalid-argument' && error.message.includes(`Falta ${label}`));
      for (const invalid of [credentials(environment === 'test' ? 'prod' : 'test')[field],
        `${valid[field]} copied label`, field === 'integritySecret' ? `integrity_${environment}_SYNTHETIC` : 'INVALID', 42, null]) {
        await assert.rejects(saveWompiConfig({ tenantId, ...valid, [field]: invalid }, adminCtx), error =>
          error.code === 'invalid-argument' && error.message.includes(label) && !error.message.includes('SYNTHETIC'));
      }
    }
  }
  assert.equal((await getWompiConfig({ tenantId }, adminCtx)).configured, false);
  const padded = Object.fromEntries(Object.entries(credentials('test')).map(([field, value]) =>
    [field, field === 'environment' || typeof value !== 'string' ? value : ` \n${value}\t `]));
  assert.equal((await saveWompiConfig({ tenantId, ...padded }, adminCtx)).configured, true);
  await saveWompiConfig({ tenantId, enabled: false, publicKey: '', privateKey: '  ', integritySecret: '', eventsSecret: '' }, adminCtx);
  const saved = (await db.collection('tenants').doc(tenantId).collection('secrets').doc('wompi').get()).data();
  for (const field of ['publicKey', 'privateKey', 'integritySecret', 'eventsSecret']) assert.equal(saved[field], credentials('test')[field]);
  await assert.rejects(saveWompiConfig({ tenantId, enabled: false, environment: 'prod' }, adminCtx), { code: 'invalid-argument' });
  assert.equal((await getWompiConfig({ tenantId }, adminCtx)).environment, 'test');
  await assert.rejects(saveWompiConfig({ tenantId, enabled: false, environment: 'unknown' }, adminCtx), { code: 'invalid-argument' });
  assert.equal((await config('prod')).configured, true);
  await saveWompiConfig({ tenantId, enabled: false }, adminCtx);
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
  assert.deepEqual(result.widgetConfig, { publicKey: credentials().publicKey, currency: 'COP', amountInCents: 5000000,
    reference: result.reference, signature: { integrity: url.searchParams.get('signature:integrity') } });
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
  assert.deepEqual(resumed.widgetConfig, results[0].widgetConfig);
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

const customerPolicy = { ...DEFAULT_POLICY, payer: 'customer' };
const withFees = async (environment = 'prod') => saveWompiConfig({ tenantId, ...credentials(environment),
  feePolicies: { [environment]: customerPolicy } }, adminCtx);
const paymentSnapshot = async () => Object.fromEntries(await Promise.all([
  'recharges', 'wompi_intents', 'wompi_requests', 'recharge_locks', 'balanceTransactions', 'wompi_payment_consumptions',
].map(async name => [name, (await db.collection(name).get()).docs.map(doc => [doc.id, doc.data()])])));
test('repeated authenticated previews are read-only, public-safe and leave QR submission usable', async () => {
  await withFees(); const before = await paymentSnapshot();
  const first = await getWompiQuote({ tenantId, amount: 20000 }, customer);
  assert.deepEqual(Object.keys(first).sort(), ['environment', 'feeQuote', 'quoteHash']);
  assert.deepEqual(first.feeQuote, calculateQuote(20000, customerPolicy));
  for (let i = 0; i < 3; i++) assert.deepEqual(await getWompiQuote({ amount: 20000 }, customer), first);
  for (const secret of Object.values(credentials()).filter(value => typeof value === 'string' && value.includes('SYNTHETIC'))) {
    assert.equal(JSON.stringify(first).includes(secret), false);
  }
  assert.deepEqual(await paymentSnapshot(), before); assert.equal(calls.length, 0); assert.equal(await balance(), 10000);
  const qr = await createRechargeRequest({ amount: 20000, customerName: 'Synthetic', customerPhone: '3001234567' }, customer);
  assert.equal(qr.alreadyPending, undefined);
  assert.equal((await db.collection('recharges').doc(qr.rechargeId).get()).data().provider, undefined);
});
test('new final confirmation requires the exact accepted quote; amount and digest tampering write nothing', async () => {
  await withFees(); const quote = await getWompiQuote({ amount: 20000 }, customer), before = await paymentSnapshot();
  for (const data of [{}, { expectedQuoteHash: '0'.repeat(64) }, { expectedQuoteHash: quote.quoteHash, amount: 21000 }]) {
    await assert.rejects(createWompiCheckout({ amount: 20000, idempotencyKey: randomUUID(), ...data }, customer), { code: 'failed-precondition' });
  }
  assert.deepEqual(await paymentSnapshot(), before); assert.equal(calls.length, 0);
});
test('tariff or environment rotation between preview and final confirmation rejects without any payment write', async () => {
  await withFees(); const quote = await getWompiQuote({ amount: 20000 }, customer);
  for (const environment of ['prod', 'test']) {
    await saveWompiConfig({ tenantId, ...credentials(environment), feePolicies: { [environment]: { ...customerPolicy, fixedFee: 800 } } }, adminCtx);
    const before = await paymentSnapshot();
    await assert.rejects(createWompiCheckout({ amount: 20000, idempotencyKey: randomUUID(), expectedQuoteHash: quote.quoteHash }, customer), /El total cambió/);
    assert.deepEqual(await paymentSnapshot(), before);
  }
  assert.equal(calls.length, 0);
});
test('quote binds tenant and owner; wrong claims, inactive profiles and bad configuration fail closed', async () => {
  await config(); const quote = await getWompiQuote({ amount: 20000 }, customer);
  await assert.rejects(getWompiQuote({ tenantId: 'other', amount: 20000 }, customer), { code: 'permission-denied' });
  await assert.rejects(getWompiQuote({ amount: 20000 }, {}), { code: 'unauthenticated' });
  const other = await user('client'); await db.collection('customers').doc(other.auth.uid).set({ tenantId, balance: 0 });
  await assert.rejects(createWompiCheckout({ amount: 20000, idempotencyKey: randomUUID(), expectedQuoteHash: quote.quoteHash }, other), /El total cambió/);
  await db.collection('customers').doc(customer.auth.uid).update({ isActive: false });
  await assert.rejects(getWompiQuote({ amount: 20000 }, customer));
  await db.collection('customers').doc(customer.auth.uid).update({ isActive: true });
  await db.collection('tenants').doc(tenantId).collection('secrets').doc('wompi').update({ feePolicies: { prod: { ...customerPolicy, fixedFee: -1 } } });
  await assert.rejects(getWompiQuote({ amount: 20000 }, customer), { code: 'failed-precondition' });
  assert.equal(calls.length, 0);
});
test('different concurrent final keys acquire only one shared lock; committed retry and resume write nothing', async () => {
  await withFees(); const quote = await getWompiQuote({ amount: 20000 }, customer);
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.allSettled(keys.map(idempotencyKey => createWompiCheckout({ amount: 20000, idempotencyKey, expectedQuoteHash: quote.quoteHash }, customer)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const index = results.findIndex(result => result.status === 'fulfilled'), created = results[index].value;
  await saveWompiConfig({ tenantId, enabled: false }, adminCtx);
  const before = await paymentSnapshot();
  const replay = await createWompiCheckout({ amount: 20000, idempotencyKey: keys[index], expectedQuoteHash: quote.quoteHash }, customer);
  const resumed = await createWompiCheckout({ rechargeId: created.rechargeId }, customer);
  assert.equal(replay.checkoutUrl, created.checkoutUrl); assert.equal(resumed.checkoutUrl, created.checkoutUrl);
  assert.deepEqual(await paymentSnapshot(), before); assert.equal(calls.length, 0);
});
test('preview may read with an actual pending payment but cannot bypass the existing final guard', async () => {
  await config(); const created = await create();
  const before = await paymentSnapshot(), quote = await getWompiQuote({ amount: 20000 }, customer);
  await assert.rejects(createWompiCheckout({ amount: 20000, expectedQuoteHash: quote.quoteHash, idempotencyKey: randomUUID() }, customer), /recarga pendiente/);
  assert.equal((await createWompiCheckout({ rechargeId: created.rechargeId }, customer)).checkoutUrl, created.checkoutUrl);
  assert.deepEqual(await paymentSnapshot(), before);
});
test('gross-up is the smallest whole COP total covering modeled commission including VAT', () => {
  assert.deepEqual(calculateQuote(20000, customerPolicy), { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 1512, totalAmount: 21512 });
  for (const base of [1000, 10000, 20000, 50000, 5000000]) {
    assert.equal(calculateQuote(base, DEFAULT_POLICY).totalAmount, base);
    for (const policy of [customerPolicy, { payer: 'customer', rateBps: 0, fixedFee: 0, vatBps: 0 },
      { payer: 'customer', rateBps: 125, fixedFee: 250, vatBps: 500 },
      { payer: 'customer', rateBps: 0, fixedFee: 700, vatBps: 1900 }]) {
      const quote = calculateQuote(base, policy), t = BigInt(quote.totalAmount), tax = BigInt(10000 + policy.vatBps);
      const net = total => total * 100000000n - (total * BigInt(policy.rateBps) + BigInt(policy.fixedFee) * 10000n) * tax;
      assert.ok(net(t) >= BigInt(base) * 100000000n);
      assert.ok(net(t - 1n) < BigInt(base) * 100000000n);
      assert.equal(quote.totalAmount - base, quote.processingFee);
      assert.equal((quote.totalAmount * 100) % 100, 0);
    }
  }
});
test('fee math rejects bad units, unsafe amounts, currencies and invalid effective denominators', () => {
  for (const base of [-1, 0, 999, 5000001, 1000.1, '20000', false, null, Infinity, NaN, Number.MAX_SAFE_INTEGER]) assert.throws(() => calculateQuote(base, customerPolicy));
  for (const currency of ['USD', '$', 'cop', null]) assert.throws(() => calculateQuote(20000, customerPolicy, currency));
  for (const policy of [null, [], {}, { ...customerPolicy, fixedFee: -1 }, { ...customerPolicy, rateBps: '265' },
    { ...customerPolicy, fixedFee: 700.5 }, { ...customerPolicy, fixedFee: Number.MAX_SAFE_INTEGER },
    { ...customerPolicy, rateBps: 10000 }, { ...customerPolicy, rateBps: 5000, vatBps: 10000 },
    { ...customerPolicy, vatBps: -1 }, { ...customerPolicy, vatBps: 10001 }, { ...customerPolicy, currency: 'USD' }]) assert.throws(() => calculateQuote(20000, policy));
  assert.throws(() => normalizePolicies({ other: customerPolicy }));
  // Positive denominator but centavos would overflow Number.MAX_SAFE_INTEGER.
  assert.throws(() => calculateQuote(5000000, { ...customerPolicy, rateBps: 9999, vatBps: 1, fixedFee: 5000000 }));
});
test('customer fee is server authoritative: checkout charges total, prod ledger credits only base once', async () => {
  await withFees();
  const result = await createWompiCheckout({ tenantId, amount: 20000, idempotencyKey: randomUUID(),
    expectedQuoteHash: (await getWompiQuote({ amount: 20000 }, customer)).quoteHash,
    totalAmount: 1, feeQuote: { totalAmount: 1 }, feePolicies: { prod: DEFAULT_POLICY } }, customer);
  assert.equal(result.feeQuote.processingFee, 1512);
  assert.equal(new URL(result.checkoutUrl).searchParams.get('amount-in-cents'), '2151200');
  assert.equal(result.widgetConfig.amountInCents, 2151200);
  const value = event(result.reference, { amount_in_cents: 2151200 }); provider(value);
  await handleWompiEvent(value, 'prod'); await handleWompiEvent(value, 'prod');
  assert.equal(await balance(), 30000);
  const ledger = (await db.collection('balanceTransactions').doc(result.reference).get()).data();
  assert.equal(ledger.amount, 20000); assert.deepEqual(ledger.feeQuote, result.feeQuote);
  const history = await getRechargeHistory({}, customer);
  assert.equal(history.recharges[0].amount, 20000); assert.deepEqual(history.recharges[0].feeQuote, result.feeQuote);
});
test('sandbox fee records base/cargo/total but neither balance nor monetary ledger', async () => {
  await withFees('test'); const result = await create(customer, 20000);
  const value = event(result.reference, { amount_in_cents: 2151200 }, 'test'); provider(value);
  await handleWompiEvent(value, 'test'); await handleWompiEvent(value, 'test');
  assert.equal(await balance(), 10000);
  const receipt = (await db.collection('recharges').doc(result.reference).get()).data();
  assert.equal(receipt.status, 'sandbox_approved'); assert.deepEqual(receipt.feeQuote, result.feeQuote);
  assert.equal((await db.collection('balanceTransactions').doc(result.reference).get()).exists, false);
});
test('frozen fee survives tariff/environment rotation, disable, resume and idempotent replay', async () => {
  await withFees(); const key = randomUUID(), result = await create(customer, 20000, key);
  const original = (await db.collection('wompi_intents').doc(result.reference).get()).data();
  assert.deepEqual(original.feePolicy, customerPolicy);
  await saveWompiConfig({ tenantId, ...credentials('test'), enabled: false,
    feePolicies: { prod: { ...customerPolicy, fixedFee: 5000 } } }, adminCtx);
  for (const next of [await createWompiCheckout({ rechargeId: result.reference }, customer), await create(customer, 20000, key)]) {
    assert.equal(next.checkoutUrl, result.checkoutUrl); assert.deepEqual(next.feeQuote, result.feeQuote);
    assert.deepEqual(next.widgetConfig, result.widgetConfig);
  }
  assert.deepEqual((await db.collection('wompi_intents').doc(result.reference).get()).data(), original);
  await assert.rejects(create(customer, 21000, key));
  await assert.rejects(create(customer, 21000));
  const value = event(result.reference, { amount_in_cents: 2151200 }); provider(value);
  await handleWompiEvent(value, 'prod'); assert.equal(await balance(), 30000);
});
test('legacy 20000 intent with no quote resumes and settles unchanged after opting in', async () => {
  await config(); const result = await create(customer, 20000);
  for (const collection of ['recharges', 'wompi_intents']) await db.collection(collection).doc(result.reference).update({ feeQuote: admin.firestore.FieldValue.delete() });
  await withFees(); const resumed = await createWompiCheckout({ rechargeId: result.reference }, customer);
  assert.equal(resumed.checkoutUrl, result.checkoutUrl); assert.equal(resumed.feeQuote.totalAmount, 20000); assert.equal(resumed.feeQuote.processingFee, 0);
  assert.deepEqual(resumed.widgetConfig, result.widgetConfig);
  assert.equal((await db.collection('wompi_intents').doc(result.reference).get()).data().feeQuote, undefined);
  const value = event(result.reference, { amount_in_cents: 2000000 }); provider(value);
  await handleWompiEvent(value, 'prod'); assert.equal(await balance(), 30000);
});
test('fee policies are admin-only tenant scoped and environment isolated, invalid saves are atomic', async () => {
  await withFees('test'); const saved = await getWompiConfig({ tenantId }, adminCtx);
  assert.equal(saved.feePolicies.test.payer, 'customer'); assert.equal(saved.feePolicies.prod.payer, 'merchant');
  await assert.rejects(getWompiConfig({ tenantId }, customer), { code: 'permission-denied' });
  await assert.rejects(saveWompiConfig({ tenantId: 'other', enabled: true, feePolicies: { test: customerPolicy } }, adminCtx), { code: 'permission-denied' });
  for (const feePolicies of [null, { test: { ...customerPolicy, vatBps: -1 } }, { test: { ...customerPolicy, rateBps: 9999 } }, { USD: customerPolicy }]) {
    await assert.rejects(saveWompiConfig({ tenantId, enabled: true, feePolicies }, adminCtx), { code: 'invalid-argument' });
    assert.deepEqual(await getWompiConfig({ tenantId }, adminCtx), saved);
  }
  await saveWompiConfig({ tenantId, enabled: true, publicKey: '', privateKey: '', integritySecret: '', eventsSecret: '' }, adminCtx);
  assert.deepEqual((await getWompiConfig({ tenantId }, adminCtx)).feePolicies, saved.feePolicies);
  for (const amount of ['20000', false, null]) await assert.rejects(create(customer, amount), { code: 'invalid-argument' });
});
test('fee payment underpaid at base fails; mutable public fee cannot change private credit authority', async () => {
  await withFees(); const result = await create(customer, 20000);
  const underpaid = event(result.reference, { amount_in_cents: 2000000 }); provider(underpaid);
  await assert.rejects(handleWompiEvent(underpaid, 'prod')); await assertUntouched(result.reference);
  await db.collection('recharges').doc(result.reference).update({ feeQuote: { totalAmount: 1, processingFee: 0 } });
  await assert.rejects(processRecharge({ rechargeId: result.reference, action: 'approve' }, adminCtx));
  assert.equal((await checkRechargePayment({ rechargeId: result.reference }, customer)).processed, false);
  assert.equal(fixture.imapCalls(), 0);
  const paid = event(result.reference, { amount_in_cents: 2151200 }); provider(paid);
  await handleWompiEvent(paid, 'prod'); assert.equal(await balance(), 30000);
  assert.deepEqual((await db.collection('recharges').doc(result.reference).get()).data().feeQuote, result.feeQuote);
});
test('tenant fee opt-in cannot affect another enabled tenant or its QR recargas', async () => {
  await withFees();
  const otherTenant = `no-fees-${randomUUID()}`, otherUser = await user('client', otherTenant);
  await db.collection('tenants').doc(otherTenant).set({ name: 'Merchant assumes cost' });
  await db.collection('customers').doc(otherUser.auth.uid).set({ tenantId: otherTenant, balance: 0 });
  const superadmin = await user('superadmin', null);
  await saveWompiConfig({ ...credentials(), tenantId: otherTenant }, superadmin);
  const other = await createWompiCheckout({ amount: 20000, idempotencyKey: randomUUID(), feePolicy: customerPolicy,
    expectedQuoteHash: (await getWompiQuote({ amount: 20000 }, otherUser)).quoteHash }, otherUser);
  assert.equal(other.feeQuote.totalAmount, 20000); assert.equal(other.feeQuote.processingFee, 0);
  assert.equal((await create(customer, 20000)).feeQuote.totalAmount, 21512);
  const qrUser = await user('client');
  await db.collection('customers').doc(qrUser.auth.uid).set({ tenantId, balance: 0 });
  const qr = await createRechargeRequest({ amount: 20000, customerName: 'Synthetic QR', customerPhone: '3001234567' }, qrUser);
  const receipt = (await db.collection('recharges').doc(qr.rechargeId).get()).data();
  assert.equal(receipt.amount, 20000); assert.equal(receipt.feeQuote, undefined);
  await processRecharge({ rechargeId: qr.rechargeId, action: 'approve' }, adminCtx);
  assert.equal(await balance(qrUser), 20000);
});
test('tenant B event secret cannot authenticate tenant A payment', async () => {
  await config(); const first = await create();
  const otherTenant = `other-${randomUUID()}`, otherUser = await user('client', otherTenant);
  await db.collection('tenants').doc(otherTenant).set({ name: 'B' });
  await db.collection('customers').doc(otherUser.auth.uid).set({ tenantId: otherTenant, balance: 0 });
  const superadmin = await user('superadmin', null);
  await saveWompiConfig({ ...credentials(), tenantId: otherTenant, eventsSecret: 'prod_events_OTHER' }, superadmin);
  const second = await create(otherUser);
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
    EXCLUDED_ROUTES: {}, FN_REGISTRY: Object.fromEntries(['getWompiConfig', 'saveWompiConfig', 'createWompiCheckout', 'getWompiAvailability', 'getWompiQuote']
      .map(name => [name, { auth: 'bearer', handler: handlers[name] }])) } };
  let verifies = 0, authorized = false;
  const { HttpsError } = require('../../functions/services/httpsError');
  const app = require('../../api/src/app').createApp(undefined, { verifyBearer: async () => {
    verifies++;
    if (authorized) return adminCtx.auth;
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
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
    for (const name of ['getWompiConfig', 'saveWompiConfig', 'createWompiCheckout', 'getWompiAvailability', 'getWompiQuote']) {
      const response = await request(`/api/${name}`, { data: {} });
      assert.equal(response.code, 401); assert.equal(response.headers['cache-control'], 'private, no-store');
    }
    assert.equal(verifies, 5);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 200);
    assert.equal(verifies, 5); assert.equal(await balance(), 60000);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 200);
    value.signature.checksum = '0'.repeat(64);
    assert.equal((await request('/api/wompi/events/prod', value)).code, 400);
    assert.equal((await request('/api/wompi/events/test', value)).code, 400);
    assert.equal((await request('/api/wompi/events/unknown', value)).code, 400);
    assert.equal(await balance(), 60000);
    authorized = true;
    const invalid = await request('/api/saveWompiConfig', { data: { tenantId, enabled: false, environment: 'test' } });
    assert.equal(invalid.code, 400);
    assert.equal(invalid.body.error.code, 'invalid-argument');
    assert.match(invalid.body.error.message, /Llave pública.*Sandbox/);
    assert.equal(JSON.stringify(invalid.body).includes('SYNTHETIC'), false);
    const valid = await request('/api/saveWompiConfig', { data: { tenantId, ...credentials('test'), enabled: false } });
    assert.equal(valid.code, 200);
    assert.deepEqual(valid.body.result, { enabled: false, configured: true, environment: 'test', publicKey: credentials('test').publicKey, feePolicies: normalizePolicies() });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
