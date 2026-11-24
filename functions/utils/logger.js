const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const { AsyncLocalStorage } = require('async_hooks');

const SERVICE_NAME = process.env.K_SERVICE || 'ejstore-functions';

const als = new AsyncLocalStorage();

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  base: {
    service: SERVICE_NAME,
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: req.body,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

function getStore() {
  return als.getStore() || null;
}

function runWithContext(store, fn) {
  return als.run(store, fn);
}

function getCorrelationId() {
  const store = als.getStore();
  return (store && store.correlationId) || uuidv4();
}

function getTenantId() {
  const store = als.getStore();
  return store ? (store.tenantId ?? null) : null;
}

function getUserId() {
  const store = als.getStore();
  return store ? (store.userId ?? null) : null;
}

function createChildLogger(bindings = {}) {
  const correlationId = getCorrelationId();
  const tenantId = getTenantId();
  const userId = getUserId();

  return baseLogger.child({
    correlationId,
    tenantId,
    userId,
    ...bindings,
  });
}

function createModuleLogger(moduleName) {
  return baseLogger.child({ module: moduleName });
}

function setContext(context = {}) {
  const store = als.getStore();
  if (!store) return;
  if (context.correlationId !== undefined) store.correlationId = context.correlationId;
  if (context.tenantId !== undefined) store.tenantId = context.tenantId;
  if (context.userId !== undefined) store.userId = context.userId;
}

function clearContext() {
  const store = als.getStore();
  if (!store) return;
  store.correlationId = null;
  store.tenantId = null;
  store.userId = null;
}

module.exports = {
  logger: baseLogger,
  createChildLogger,
  createModuleLogger,
  getCorrelationId,
  getTenantId,
  getUserId,
  setContext,
  clearContext,
  runWithContext,
  getStore,
};
