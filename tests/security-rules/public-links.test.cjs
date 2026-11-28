const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const { createPublicLinkHandlers } = require('../../functions/services/publicLinks');
// Real SDK timestamp, no Firebase app/Admin initialization or local config import.
const { Timestamp } = require('firebase/firestore');
const now = Date.parse('2026-11-27T12:00:00Z');
const token = 'LegacyMixedCaseToken1';
const credential = { email: 'synthetic@example.invalid', password: 'FICTIONAL-ONLY', smtp: 'DO-NOT-COPY' };

function fixture(overrides = {}, fail = false) {
  const records = {
    'tenants/a': {}, 'tenants/b': {},
    'services/s': { tenantId: 'a', name: 'Synthetic service' },
    'purchases/p': { status: 'active', tenantId: 'a', serviceId: 's', accountId: 'c', profileId: 'profile', customerId: 'owner' },
    'services/s/accounts/c': { tenantId: 'a', status: 'available', credential },
    'services/s/accounts/c/profiles/profile': { status: 'sold', soldTo: 'owner', purchaseId: 'p', pin: 'ONLY-OWN' },
    'services/s/accounts/c/profiles/sibling': { status: 'sold', soldTo: 'other', purchaseId: 'other', pin: 'NOT-OWN' },
    [`public_links/${token}`]: { status: 'active', serviceId: 's', accountId: 'c', profileId: 'profile',
      purchaseId: 'p', accountIndex: 0, expiresAt: new Date(now + 1000), createdAt: new Date(now - 1000), credential },
    ...overrides,
  };
  const calls = [], writes = [];
  const update = (path, data) => {
    const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
      value && typeof value.increment === 'number' ? (records[path][key] || 0) + value.increment : value]));
    records[path] = { ...records[path], ...values };
  };
  const ref = path => ({ path, id: path.split('/').at(-1), doc: (id = 'generated-purchase') => ref(`${path}/${id}`), collection: name => ref(`${path}/${name}`),
    get: async () => {
      calls.push(path);
      if (fail) throw new Error('PRIVATE DATABASE DETAIL');
      return { exists: records[path] != null, data: () => records[path] };
    },
    create: async data => { assert.ok(!records[path]); records[path] = data; writes.push({ path, data }); },
    set: async data => { records[path] = data; }, update: async data => update(path, data),
    where: (field, op, value) => ({ limit: max => ({ get: async () => ({ docs: Object.entries(records)
      .filter(([key, data]) => data && key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1
        && (op === '>' ? data[field] > value : data[field] === value)).slice(0, max)
      .map(([key, data]) => ({ ref: ref(key), id: key.split('/').at(-1), data: () => data })) }) }) }),
  });
  const db = { collection: ref, runTransaction: async fn => fn({
    get: r => r.get(), create: (r, data) => { assert.ok(!records[r.path]); records[r.path] = data; writes.push({ path: r.path, data }); },
    update: (r, data) => update(r.path, data), set: (r, data) => { records[r.path] = data; },
  }) };
  return { records, calls, writes, db, ...createPublicLinkHandlers(db, () => now) };
}

test('legacy strong token resolves exact assigned profile, excludes credentials, sibling PIN and stored extras', async () => {
  const f = fixture();
  assert.deepEqual(await f.resolvePublicLink({ token }), {
    serviceName: 'Synthetic service', status: 'active', createdAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1000).toISOString(),
  });
  assert.equal(f.calls.some(path => path.endsWith('/sibling')), false);
  assert.equal(f.writes.length, 0);
});

test('real single and bulk purchase writers produce resolvable links with exact parent/profile assignment receipts', async () => {
  for (const mode of ['profile', 'account', 'bulk']) {
    const bulk = mode === 'bulk';
    const f = fixture();
    f.records['services/s'] = { tenantId: 'a', name: 'Synthetic service', price: 100, wholesalePrice: 80, hasCodeExtraction: true };
    f.records['customers/owner'] = { tenantId: 'a', balance: 1000 };
    f.records['resellers/owner'] = { tenantId: 'a', isActive: true, balance: 1000 };
    f.records['services/s/accounts/c'].availableProfiles = 1;
    if (mode === 'account') delete f.records['services/s/accounts/c'].availableProfiles;
    f.records['services/s/accounts/c/profiles/profile'] = { status: 'available', name: 'Owned profile', pin: 'SYNTHETIC' };
    // Include a legacy no-profile account in bulk, exercising both assignment formats.
    if (bulk) f.records['services/s/accounts/legacy'] = { tenantId: 'a', status: 'available', credential };
    const config = { db: f.db, admin: { firestore: {
      Timestamp: { now: () => new Date(now) }, FieldValue: { increment: n => ({ increment: n }) },
    } } };
    function load(file, overrides) {
      const module = { exports: {} }, localRequire = createRequire(file);
      vm.runInThisContext(`(function(require,module,exports){${readFileSync(file, 'utf8')}\n})`, { filename: file })(
        name => Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name), module, module.exports);
      return module.exports;
    }
    const inventory = load(require.resolve('../../functions/services/inventoryService'), { '../config': config });
    const purchase = load(require.resolve('../../functions/services/purchaseService'), {
      '../config': config, './inventoryService': inventory,
      './notificationService': { sendPurchaseNotifications: async () => {} },
      './monitoring': new Proxy({}, { get: () => async () => {} }), './idempotencyService': {},
    });
    const result = bulk
      ? await purchase.processBulkPurchase({ serviceId: 's', tenantId: 'a', resellerId: 'owner', quantity: 2 })
      : await purchase.processPurchase({ serviceId: 's', tenantId: 'a', customerId: 'owner' });
    assert.equal(result.linkTokens.length, bulk ? 2 : 1);
    for (const token of result.linkTokens) assert.equal((await f.resolvePublicLink({ token })).status, 'active');
    const saved = f.records[`purchases/${result.purchaseId}`];
    if (bulk) {
      for (const row of saved.profiles) {
        assert.ok(row.accountId); assert.ok(row.assignmentId);
        const path = `services/s/accounts/${row.accountId}${row.profileId ? `/profiles/${row.profileId}` : ''}`;
        assert.equal(f.records[path].purchaseId, row.assignmentId);
      }
      assert.equal(f.records['resellers/owner'].balance, 840);
    } else assert.equal(f.records['customers/owner'].balance, 900);
  }
});

test('expiry Date, Firestore Timestamp and ISO serialize identically; boundary is exclusive', async () => {
  for (const expiresAt of [new Date(now + 1000), Timestamp.fromMillis(now + 1000), new Date(now + 1000).toISOString()]) {
    const f = fixture(); f.records[`public_links/${token}`].expiresAt = expiresAt;
    assert.equal((await f.resolvePublicLink({ token })).expiresAt, new Date(now + 1000).toISOString());
  }
  for (const expiresAt of [null, undefined, 0, '1', 'invalid', {}, new Date(NaN), new Date(now), { toMillis: () => now - 1 }, { toMillis() { throw new Error('corrupt'); } }]) {
    const f = fixture(); f.records[`public_links/${token}`].expiresAt = expiresAt;
    await assert.rejects(f.resolvePublicLink({ token }), { code: 'not-found', message: 'Link no disponible' });
    assert.deepEqual(f.calls, [`public_links/${token}`]);
  }
});

test('malformed selectors never reach Firestore and share not-found with unknown tokens', async () => {
  for (const data of [null, [], {}, { token: 1 }, { token: '../x' }, { token: 'a/b'.repeat(20) },
    { token: 'x'.repeat(129) }, { token: 'x'.repeat(19) }, { token, tenantId: 'b' }]) {
    const f = fixture();
    await assert.rejects(f.resolvePublicLink(data), { code: 'not-found', message: 'Link no disponible' });
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(fixture().resolvePublicLink({ token: 'Z'.repeat(20) }), { code: 'not-found', message: 'Link no disponible' });
});

test('revocation and expired links deny before resource lookup, without mutation', async () => {
  for (const status of ['revoked', 'inactive', 'expired', null]) {
    const f = fixture(); f.records[`public_links/${token}`].status = status;
    await assert.rejects(f.resolvePublicLink({ token }), { code: 'not-found' });
    assert.deepEqual(f.calls, [`public_links/${token}`]); assert.equal(f.writes.length, 0);
  }
});

test('deleted, cross-tenant, cancelled, missing-reference and reassigned resources fail closed', async () => {
  for (const [path, field, value] of [
    ['tenants/a', null, null], ['services/s', null, null], ['purchases/p', null, null],
    ['tenants/a', 'isActive', false],
    ['services/s', 'tenantId', 'b'], ['purchases/p', 'tenantId', 'b'], ['purchases/p', 'status', 'cancelled'],
    ['purchases/p', 'accountId', 'missing'], ['purchases/p', 'profileId', '../sibling'],
    ['services/s/accounts/c', 'tenantId', 'b'], ['services/s/accounts/c/profiles/profile', null, null],
    ['services/s/accounts/c/profiles/profile', 'soldTo', 'other'],
    ['services/s/accounts/c/profiles/profile', 'status', 'available'],
    ['services/s/accounts/c/profiles/profile', 'purchaseId', 'other'],
    [`public_links/${token}`, 'profileId', 'sibling'], [`public_links/${token}`, 'accountId', 'profile'],
    [`public_links/${token}`, 'tenantId', 'b'], [`public_links/${token}`, 'resellerId', 'other'],
    [`public_links/${token}`, 'assignmentId', 'other'], [`public_links/${token}`, 'purchaseId', undefined],
  ]) {
    const f = fixture();
    if (field) f.records[path][field] = value; else f.records[path] = value;
    await assert.rejects(f.resolvePublicLink({ token }), { code: 'not-found' }, `${path}.${field}`);
  }
});

test('database errors fail closed without exposing paths, token or SDK detail', async () => {
  await assert.rejects(fixture({}, true).resolvePublicLink({ token }), { code: 'unavailable', message: 'Link temporalmente no disponible' });
});

test('catalog visibility and renamed service do not revoke an active sold purchase', async () => {
  const f = fixture();
  f.records['services/s'].active = false;
  f.records['services/s'].name = 'Renamed service';
  assert.equal((await f.resolvePublicLink({ token })).serviceName, 'Renamed service');
  const created = await f.createPublicLink({ purchaseId: 'p', accountIndex: 0 }, { auth: { uid: 'owner' } });
  assert.equal((await f.resolvePublicLink(created)).status, 'active');
});

test('historical account-only references resolve without redundant link fields; ambiguous legacy rows never infer by email', async () => {
  const f = fixture();
  delete f.records['purchases/p'].profileId;
  f.records['services/s/accounts/c'] = { status: 'sold', soldTo: 'owner', purchaseId: 'p', credential };
  delete f.records[`public_links/${token}`].profileId;
  delete f.records[`public_links/${token}`].accountIndex;
  assert.equal((await f.resolvePublicLink({ token })).status, 'active');
  for (const status of ['cancelled', 'refunded', 'expired']) {
    f.records['purchases/p'].status = status;
    await assert.rejects(f.resolvePublicLink({ token }), { code: 'not-found' });
  }
  f.records['purchases/p'].status = 'active';
  for (const profiles of [[{ profileId: 'profile', credential }], [{ accountId: 'c', profileId: 'profile', credential }]]) {
    f.records['purchases/p'].profiles = profiles;
    await assert.rejects(f.resolvePublicLink({ token }), { code: 'not-found' });
  }
});

test('private creation enforces auth, owner and exact input; roles cannot override ownership', async () => {
  const f = fixture();
  await assert.rejects(f.createPublicLink({ purchaseId: 'p', accountIndex: 0 }, {}), { code: 'unauthenticated' });
  for (const uid of ['stranger', 'admin']) {
    await assert.rejects(f.createPublicLink({ purchaseId: 'p', accountIndex: 0 }, { auth: { uid, token: { role: 'superadmin', tenantId: 'a' } } }), { code: 'not-found' });
  }
  for (const data of [null, { purchaseId: '../p', accountIndex: 0 }, { purchaseId: 'p', accountIndex: -1 },
    { purchaseId: 'p', accountIndex: 0, credential }, { purchaseId: 'p', accountIndex: 1 }]) {
    await assert.rejects(f.createPublicLink(data, { auth: { uid: 'owner' } }));
  }
  assert.equal(f.writes.length, 0);
});

test('new capabilities have 256 random bits, 30-day expiry, no copied secrets and persist delivery index', async () => {
  const f = fixture();
  const a = await f.createPublicLink({ purchaseId: 'p', accountIndex: 0 }, { auth: { uid: 'owner' } });
  const b = await f.createPublicLink({ purchaseId: 'p', accountIndex: 0 }, { auth: { uid: 'owner' } });
  assert.match(a.token, /^[a-f0-9]{64}$/); assert.notEqual(a.token, b.token);
  const link = f.records[`public_links/${a.token}`];
  assert.equal(link.expiresAt.getTime(), now + 30 * 86400000);
  assert.deepEqual(Object.keys(link).sort(), ['tenantId', 'serviceId', 'accountId', 'profileId', 'assignmentId',
    'purchaseId', 'accountIndex', 'resellerId', 'serviceName', 'status', 'createdAt', 'expiresAt'].sort());
  assert.equal(f.records['purchases/p'].linkTokens[0], b.token);
  assert.equal((await f.resolvePublicLink(a)).status, 'active');
});

test('actual automatic writer scopes shared-parent bulk profiles independently and copies no credentials', async () => {
  const f = fixture();
  f.records['purchases/p'] = { ...f.records['purchases/p'], resellerId: 'owner', profiles: [
    { accountId: 'c', profileId: 'profile', assignmentId: 'p_0', credential },
    { accountId: 'c', profileId: 'sibling', assignmentId: 'p_1', credential },
  ] };
  f.records['services/s/accounts/c/profiles/profile'].purchaseId = 'p_0';
  f.records['services/s/accounts/c/profiles/sibling'] = { status: 'sold', soldTo: 'owner', purchaseId: 'p_1' };
  const file = require.resolve('../../functions/services/inventoryService');
  const localRequire = createRequire(file), module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${readFileSync(file, 'utf8')}\n})`, { filename: file })(
    name => name === '../config' ? { db: f.db } : localRequire(name), module, module.exports);
  const tokens = await module.exports.createPublicLinks('s', 'p', [{ credential }, { credential }], 'Synthetic service', 'owner', true, f.records['purchases/p']);
  assert.equal(tokens.length, 2); assert.notEqual(tokens[0], tokens[1]);
  assert.equal(f.calls.length, 0, 'automatic delivery must not add post-debit catalog/tenant reads');
  for (const [i, token] of tokens.entries()) {
    const link = f.records[`public_links/${token}`];
    assert.equal(link.accountId, 'c'); assert.equal(link.assignmentId, `p_${i}`);
    assert.equal('credential' in link, false); assert.equal('profilePin' in link, false);
    assert.equal((await f.resolvePublicLink({ token })).status, 'active');
  }
  f.records['purchases/p'].profiles[0].accountId = undefined;
  await assert.rejects(f.resolvePublicLink({ token: tokens[0] }), { code: 'not-found' });
});
