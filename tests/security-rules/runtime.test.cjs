const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const http = require('node:http');

const root = resolve(__dirname, '../..');
const origins = [
  'https://ejstore-web.web.app',
  'https://ejstore-web.firebaseapp.com',
  'https://admin.ejstreaming.shop',
];

// Run the actual root wrapper, index, app, middleware, config and registry.
// Only infrastructure and legacy handlers are replaced. No Admin SDK or .env
// is loaded. Real EXPAND handlers use a read-only synthetic Firestore boundary.
function runtime(env = {}, databaseFails = false) {
  const calls = { db: 0, auth: 0, init: 0 };
  const records = {
    'tenants/a': {},
    'services/s': { tenantId: 'a' },
    'purchases/p': { customerId: 'owner', tenantId: 'a', serviceId: 's', accountId: 'c' },
    'services/s/accounts/c': {
      status: 'sold', soldTo: 'owner', purchaseId: 'p',
      credential: { email: 'fixture@example.invalid', password: 'FICTIONAL', pin: 'EXCLUDED' },
    },
  };
  const ref = path => ({
    doc: id => ref(`${path}/${id}`),
    collection: name => ref(`${path}/${name}`),
    get: async () => {
      calls.db++;
      if (databaseFails) throw new Error('SYNTHETIC PRIVATE DB DETAIL');
      return { exists: path in records, data: () => records[path] };
    },
    where: () => ({ select: () => ({ get: async () => {
      calls.db++;
      return { docs: [] };
    } }) }),
  });
  const db = { collection: ref };
  const admin = {
    getAdmin: () => { calls.init++; },
    auth: () => ({ verifyIdToken: async token => {
      calls.auth++;
      if (token !== 'synthetic-owner') throw new Error('fixture invalid token');
      return { uid: 'owner' };
    } }),
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = createRequire(file);
    const requireIsolated = name => {
      if (name === 'express') return require('express');
      const target = localRequire.resolve(name);
      if (target === resolve(root, 'api/src/firebaseAdmin.js')) return admin;
      if (target === resolve(root, 'functions/config.js')) return { db };
      if (file === resolve(root, 'api/src/registry.js') && name !== '../../functions/availability') {
        return new Proxy({}, { get: () => () => { throw new Error('Legacy handler must not run'); } });
      }
      if (target.startsWith(`${root}/api/`) || target === resolve(root, 'api.cjs') ||
          target === resolve(root, 'functions/availability.js')) return load(target);
      return localRequire(name);
    };
    const execute = vm.runInThisContext(`(function(require,module,exports,process,__dirname){${readFileSync(file, 'utf8')}\n})`, { filename: file });
    execute(requireIsolated, module, module.exports, { env: { NODE_ENV: 'production', ...env } }, dirname(file));
    return module.exports;
  }
  const app = load(resolve(root, 'api.cjs'));
  return { app, calls, config: load(resolve(root, 'api/src/config.js')), registry: load(resolve(root, 'api/src/registry.js')).FN_REGISTRY };
}

async function request(instance, options = {}) {
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise((yes, no) => { server.once('listening', yes); server.once('error', no); });
  try {
    return await new Promise((yes, no) => {
      const req = http.request({
        hostname: '127.0.0.1', port: server.address().port,
        path: options.path || '/api/getStockAvailability', method: options.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
      }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => yes({ status: res.statusCode, headers: res.headers, text, body: text ? JSON.parse(text) : null }));
      });
      req.on('error', no);
      req.end(options.raw ?? JSON.stringify(options.body ?? { data: { tenantId: 'a', serviceId: 's' } }));
    });
  } finally {
    await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
  }
}

test('root wrapper initializes once and exposes 45 routes including both EXPAND handlers (P0-4 retired adminDeleteResellerByEmail)', () => {
  const lock = JSON.parse(readFileSync(resolve(root, 'api/package-lock.json'), 'utf8'));
  assert.equal(require('express/package.json').version, lock.packages['node_modules/express'].version);
  const r = runtime();
  assert.equal(r.calls.init, 1);
  assert.equal(Object.keys(r.registry).length, 45);
  assert.equal(r.registry.getStockAvailability.auth, 'none');
  assert.equal(r.registry.getPurchaseCredentials.auth, 'bearer');
});

test('production env is additive, trimmed and deduplicated; custom domains remain exact', () => {
  const r = runtime({ ALLOWED_ORIGINS: ` https://tenant.example.invalid, ${origins[2]},,` });
  assert.deepEqual(r.config.getAllowedOrigins(), [...origins, 'https://tenant.example.invalid']);
  assert.deepEqual(runtime({ ALLOWED_ORIGINS: '' }).config.getAllowedOrigins(), origins);
  assert.equal(r.config.getAllowedOrigins().some(origin => origin.includes('localhost')), false);
  assert.ok(runtime({ NODE_ENV: 'development' }).config.getAllowedOrigins().includes('http://localhost:5173'));
});

for (const origin of origins) {
  test(`production preflight accepts POST + Authorization + Content-Type: ${origin}`, async () => {
    const r = runtime();
    const response = await request(r, { method: 'OPTIONS', path: '/api/getPurchaseCredentials', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    } });
    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.equal(response.headers['access-control-allow-methods'], 'POST, OPTIONS');
    assert.equal(response.headers['access-control-allow-headers'], 'Content-Type, Authorization');
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.match(response.headers.vary, /Origin/);
    assert.equal(r.calls.db + r.calls.auth, 0);
  });
}

test('foreign, suffix-spoofed, opaque, non-TLS and localhost origins never reach handlers', async () => {
  for (const origin of ['https://evil.example.invalid', `${origins[2]}.evil.invalid`, 'null', 'http://admin.ejstreaming.shop', 'http://localhost:5173']) {
    const r = runtime();
    for (const method of ['POST', 'OPTIONS']) {
      const response = await request(r, { method, headers: { Origin: origin } });
      assert.equal(response.status, method === 'POST' ? 403 : 204);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      assert.equal(response.text.includes(origin), false);
      assert.match(response.headers.vary, /Origin/);
    }
    assert.equal(r.calls.db + r.calls.auth, 0);
  }
});

test('explicit custom origin works; its siblings and suffixes do not', async () => {
  const origin = 'https://tenant.example.invalid';
  const r = runtime({ ALLOWED_ORIGINS: origin });
  assert.equal((await request(r, { headers: { Origin: origin } })).status, 200);
  for (const other of ['https://other.example.invalid', `${origin}.evil.invalid`]) {
    assert.equal((await request(r, { headers: { Origin: other } })).status, 403);
  }
});

test('public POST uses actual aggregate, no credentials or wildcard CORS', async () => {
  const response = await request(runtime(), { headers: { Origin: origins[2] } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { result: { available: 0 } });
  assert.equal(response.headers['access-control-allow-origin'], origins[2]);
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
  assert.equal(response.headers['cache-control'], undefined);
});

test('absent Origin preserves server-to-server public and authenticated access', async () => {
  const r = runtime();
  const publicResponse = await request(r);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers['access-control-allow-origin'], undefined);
  const privateResponse = await request(r, { path: '/api/getPurchaseCredentials',
    headers: { Authorization: 'Bearer synthetic-owner' }, body: { data: { purchaseId: 'p' } } });
  assert.equal(privateResponse.status, 200);
  assert.deepEqual(privateResponse.body, { result: { credential: { email: 'fixture@example.invalid', password: 'FICTIONAL' } } });
  assert.equal(privateResponse.headers['cache-control'], 'private, no-store');
});

test('private missing/invalid Bearer fails before database access, with no-store and CORS', async () => {
  for (const authorization of [undefined, 'Bearer invalid', 'Basic synthetic-owner']) {
    const r = runtime();
    const response = await request(r, { path: '/api/getPurchaseCredentials', headers: {
      Origin: origins[2], ...(authorization ? { Authorization: authorization } : {}),
    } });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'unauthenticated');
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers['access-control-allow-origin'], origins[2]);
    assert.equal(r.calls.db, 0);
  }
});

test('private auth success, not-found, invalid JSON and rejected origin all stay no-store', async () => {
  for (const scenario of [
    { status: 200, body: { data: { purchaseId: 'p' } } },
    { status: 404, body: { data: { purchaseId: 'missing' } } },
    { status: 400, raw: '{' },
    { status: 403, headers: { Origin: 'https://evil.invalid' } },
  ]) {
    const response = await request(runtime(), { ...scenario, path: '/api/getPurchaseCredentials', headers: {
      Origin: origins[2], Authorization: 'Bearer synthetic-owner', ...scenario.headers,
    } });
    assert.equal(response.status, scenario.status);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    if (scenario.status === 403) assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});

test('HTTP envelope validation does not turn invalid inputs into zero stock', async () => {
  const r = runtime();
  const response = await request(r, { body: { tenantId: 'a', serviceId: 's' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'invalid-argument');
  assert.equal(r.calls.db, 0);
});

test('Express trailing slash and encoded route aliases cannot bypass private no-store', async () => {
  for (const path of ['/api/getPurchaseCredentials/', '/api/%67etPurchaseCredentials']) {
    const response = await request(runtime(), { path, headers: { Authorization: 'Bearer synthetic-owner' }, body: { data: { purchaseId: 'p' } } });
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
});

test('real HTTP database failures map to generic 503, never zero or leaked detail', async () => {
  for (const path of ['/api/getStockAvailability', '/api/getPurchaseCredentials']) {
    const response = await request(runtime({}, true), { path, headers: {
      Origin: origins[2], Authorization: 'Bearer synthetic-owner',
    }, body: { data: path.endsWith('Credentials') ? { purchaseId: 'p' } : { tenantId: 'a', serviceId: 's' } } });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'unavailable');
    assert.equal(response.text.includes('PRIVATE DB DETAIL'), false);
    assert.equal(response.headers['access-control-allow-origin'], origins[2]);
    if (path.endsWith('Credentials')) assert.equal(response.headers['cache-control'], 'private, no-store');
  }
});

test('health and OPTIONS do not establish that a POST route exists', async () => {
  const r = runtime();
  assert.equal((await request(r, { path: '/api/health', method: 'GET' })).status, 200);
  assert.equal((await request(r, { path: '/api/notRegistered', method: 'OPTIONS', headers: { Origin: origins[0] } })).status, 204);
  assert.equal((await request(r, { path: '/api/notRegistered' })).status, 404);
});
