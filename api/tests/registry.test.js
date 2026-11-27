import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { FN_REGISTRY, EXCLUDED_ROUTES } from '../src/registry';

// spec:endpoint-parity#complete-name-route-registry-for-all-35-callables — tabla autoritativa (34 callables).
// +4 endpoints post-write (spec:triggers, auth L→bearer) + telegramWebhook raw (spec:endpoint-parity#telegramwebhook-raw-route-parity).
// Auth classes del spec: N=no token, L/AD/SA/RS=token requerido (role checks dentro del handler).
// El registry solo distingue none|bearer (design D14): N→none, L/AD/SA/RS→bearer.
const SPEC_ROUTES = [
  { name: 'getWompiConfig', auth: 'bearer' },
  { name: 'saveWompiConfig', auth: 'bearer' },
  { name: 'getWompiAvailability', auth: 'bearer' },
  { name: 'createWompiCheckout', auth: 'bearer' },
  { name: 'getWompiQuote', auth: 'bearer' },
  { name: 'reconcileWompiPayment', auth: 'bearer' },
  { name: 'getUserRole', auth: 'bearer' },
  { name: 'createAdmin', auth: 'bearer' },
  { name: 'getPublicAccount', auth: 'none' },
  { name: 'getPublicStats', auth: 'none' },
  { name: 'getStockAvailability', auth: 'none' },
  { name: 'getPurchaseCredentials', auth: 'bearer' },
  { name: 'createAccountWithProfiles', auth: 'bearer' },
  { name: 'updateTicketCredentials', auth: 'bearer' },
  { name: 'adminUpdateTicket', auth: 'bearer' },
  { name: 'loadCustomerBalance', auth: 'bearer' },
  { name: 'createReseller', auth: 'bearer' },
  { name: 'loadResellerBalance', auth: 'bearer' },
  { name: 'extraerCodigo', auth: 'bearer' },
  { name: 'saveEmailConfig', auth: 'bearer' },
  { name: 'getEmailConfig', auth: 'bearer' },
  { name: 'testEmailConnection', auth: 'bearer' },
  { name: 'checkEmailStatus', auth: 'bearer' },
  { name: 'getSmtpConfig', auth: 'bearer' },
  { name: 'saveSmtpConfig', auth: 'bearer' },
  { name: 'sendTestEmail', auth: 'bearer' },
  { name: 'sendOtpVerification', auth: 'bearer' },
  { name: 'verifyOtpCode', auth: 'bearer' },
  { name: 'processPurchase', auth: 'bearer' },
  { name: 'processBulkPurchase', auth: 'bearer' },
  { name: 'createDiamondOrder', auth: 'bearer' },
  { name: 'processDiamondOrder', auth: 'bearer' },
  { name: 'verifyFreeFireId', auth: 'bearer' },
  { name: 'createRechargeRequest', auth: 'bearer' },
  { name: 'processRecharge', auth: 'bearer' },
  { name: 'checkRechargePayment', auth: 'bearer' },
  { name: 'getRechargeHistory', auth: 'bearer' },
  { name: 'notifyPrizeWon', auth: 'bearer' },
  { name: 'processSpin', auth: 'bearer' },
  { name: 'generateTelegramToken', auth: 'bearer' },
  { name: 'checkTelegramStatus', auth: 'bearer' },
  { name: 'sendTestTelegram', auth: 'bearer' },
  { name: 'createSuperadminBootstrap', auth: 'bearer' },
  { name: 'setTenantClaims', auth: 'bearer' },
  { name: 'createTenant', auth: 'bearer' },
  { name: 'verifyTenantAccess', auth: 'bearer' },
  { name: 'onUsuarioCreado', auth: 'bearer' },
  { name: 'onNuevaRecarga', auth: 'bearer' },
  { name: 'onTicketCreated', auth: 'bearer' },
  { name: 'onTicketUpdated', auth: 'bearer' },
  { name: 'telegramWebhook', auth: 'none' },
];

describe('registry estructura', () => {
  it('EXCLUDED_ROUTES contiene migrateCustomersTenantId y adminDeleteResellerByEmail (P0-4 retirado)', () => {
    expect(EXCLUDED_ROUTES).toEqual({
      migrateCustomersTenantId: 'Operación no disponible',
      adminDeleteResellerByEmail: 'Operación no disponible',
    });
  });

  it('cada entrada: auth ∈ {none,bearer}, handler function, raw opcional booleano', () => {
    for (const [name, def] of Object.entries(FN_REGISTRY)) {
      expect(['none', 'bearer'], `auth inválido en ${name}`).toContain(def.auth);
      expect(typeof def.handler, `handler inválido en ${name}`).toBe('function');
      if (def.raw !== undefined) {
        expect(typeof def.raw, `raw inválido en ${name}`).toBe('boolean');
      }
    }
  });

  it('registry contiene exactamente 51 rutas callable (45 existentes + 6 Wompi autenticadas)', () => {
    const registryNames = Object.keys(FN_REGISTRY).sort();
    const specNames = SPEC_ROUTES.map((r) => r.name).sort();
    expect(registryNames).toEqual(specNames);
    expect(SPEC_ROUTES).toHaveLength(51);
  });

  it('auth-class de cada ruta coincide con la tabla del spec', () => {
    for (const { name, auth } of SPEC_ROUTES) {
      expect(FN_REGISTRY[name].auth, `auth de ${name}`).toBe(auth);
    }
  });
});

describe('rutas 404 del dispatch', () => {
  const app = createApp();

  it('las rutas bearer responden 401 sin token (no 404/501/500)', async () => {
    for (const { name, auth } of SPEC_ROUTES) {
      if (auth !== 'bearer') continue;
      const res = await request(app).post(`/api/${name}`).send({ data: {} });
      expect(res.status, `status de ${name}`).toBe(401);
      expect(res.body.error.code, `code de ${name}`).toBe('unauthenticated');
      expect(res.body.error.status, `status field de ${name}`).toBe('UNAUTHENTICATED');
    }
  });

  it('getPublicAccount (auth none) no es 404/501 — el handler corre y responde invalid-argument', async () => {
    const res = await request(app).post('/api/getPublicAccount').send({ data: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid-argument');
  });

  it('getPublicStats (auth none) — ruta registrada; 200 shape con handler stub', async () => {
    expect(FN_REGISTRY.getPublicStats).toMatchObject({ auth: 'none' });
    expect(typeof FN_REGISTRY.getPublicStats.handler).toBe('function');

    const stubbed = createApp({
      getPublicStats: { auth: 'none', handler: async () => ({ rechargesThisMonth: 42 }) },
    });
    const res = await request(stubbed).post('/api/getPublicStats').send({ data: {} });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ rechargesThisMonth: 42 });
    expect(Number.isInteger(res.body.result.rechargesThisMonth)).toBe(true);
  });

  it('POST /api/migrateCustomersTenantId → 404 message propio (sin ejecutar nada)', async () => {
    const res = await request(app)
      .post('/api/migrateCustomersTenantId')
      .set('Authorization', 'Bearer superadmin')
      .send({ data: {} });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'not-found',
        status: 'NOT_FOUND',
        message: 'Operación no disponible',
      },
    });
  });

  it('POST /api/adminDeleteResellerByEmail → 404 Operación no disponible (retirado en P0-4)', async () => {
    const res = await request(app)
      .post('/api/adminDeleteResellerByEmail')
      .set('Authorization', 'Bearer admin')
      .send({ data: { email: 'victim@example.invalid' } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'not-found',
        status: 'NOT_FOUND',
        message: 'Operación no disponible',
      },
    });
  });

  it('POST /api/nonexistent → 404 Función no encontrada', async () => {
    const res = await request(app).post('/api/nonexistent').send({ data: {} });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not-found');
    expect(res.body.error.message).toBe('Función no encontrada');
  });

  it('EXCLUDED tiene prioridad sobre registry (aunque se registre un handler homónimo)', async () => {
    const hijacked = createApp({
      migrateCustomersTenantId: { auth: 'none', handler: async () => ({ ok: true }) },
    });
    const res = await request(hijacked).post('/api/migrateCustomersTenantId').send({ data: {} });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Operación no disponible');
  });
});

describe('endpoints post-write + webhook raw (B5)', () => {
  const app = createApp(FN_REGISTRY, {
    verifyBearer: async () => ({ uid: 'u-test', token: { email: 'u-test@test.com' } }),
  });

  it('telegramWebhook es raw (sin envelope) y auth none', () => {
    expect(FN_REGISTRY.telegramWebhook).toMatchObject({ auth: 'none', raw: true });
    expect(typeof FN_REGISTRY.telegramWebhook.handler).toBe('function');
  });

  it('payload inválido de los endpoints con id → 400 invalid-argument (sin 500 leak)', async () => {
    for (const fn of ['onNuevaRecarga', 'onTicketCreated', 'onTicketUpdated']) {
      const res = await request(app)
        .post(`/api/${fn}`)
        .set('Authorization', 'Bearer stub')
        .send({ data: {} });
      expect(res.status, `status de ${fn}`).toBe(400);
      expect(res.body.error.code, `code de ${fn}`).toBe('invalid-argument');
      expect(res.body.error.status, `status field de ${fn}`).toBe('INVALID_ARGUMENT');
    }
  });

  it('telegramWebhook con secret incorrecto → 401 (rechazo sin escritura)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'registry-test-token';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'registry-test-secret';
    try {
      const res = await request(app)
        .post('/api/telegramWebhook')
        .set('x-telegram-bot-api-secret-token', 'wrong-secret')
        .send({ update_id: 999001 });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }
  });
});
