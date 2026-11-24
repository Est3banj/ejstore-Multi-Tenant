const { v4: uuidv4 } = require('uuid');
const {
  setContext,
  clearContext,
  getCorrelationId,
  getTenantId,
  getUserId,
  runWithContext,
} = require('./logger');

function correlationIdMiddleware() {
  return (req, res, next) => {
    const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || uuidv4();
    res.setHeader('x-request-id', correlationId);
    runWithContext({ correlationId, tenantId: null, userId: null }, () => {
      next();
    });
  };
}

function wrapWithCorrelationId(fn) {
  return async (...args) => {
    const correlationId = uuidv4();
    return runWithContext({ correlationId, tenantId: null, userId: null }, () => fn(...args));
  };
}

function withCorrelationId(correlationId, fn) {
  return runWithContext({ correlationId, tenantId: null, userId: null }, () => fn());
}

function getCurrentCorrelationId() {
  return getCorrelationId();
}

function setTenantContext(tenantId) {
  setContext({ tenantId });
}

function setUserContext(userId) {
  setContext({ userId });
}

function getTenantContext() {
  return getTenantId();
}

function getUserContext() {
  return getUserId();
}

module.exports = {
  correlationIdMiddleware,
  wrapWithCorrelationId,
  withCorrelationId,
  getCurrentCorrelationId,
  setTenantContext,
  setUserContext,
  getTenantContext,
  getUserContext,
};
