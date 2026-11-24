const admin = require('firebase-admin');
const axios = require('axios');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { getSecret } = require('./services/secretManager');
const { imapPool, smtpPool } = require('./services/connectionPool');
const { initAdmin } = require('./services/adminInit');
const { HttpsError } = require('./services/httpsError');

const { logger, createModuleLogger, setContext, clearContext, getCorrelationId } = require('./utils/logger');
const { correlationIdMiddleware, wrapWithCorrelationId, setTenantContext, setUserContext } = require('./utils/correlationId');
const { toHttpError, createErrorResponse, ErrorCode } = require('./services/errorCodes');

function ensureAdmin() {
  return initAdmin(admin, process.env);
}

function ensureFirestore() {
  ensureAdmin();
  return admin.firestore();
}

function ensureAuthInstance() {
  ensureAdmin();
  return admin.auth();
}

const db = new Proxy({}, {
  get(_, prop) {
    const firestore = ensureFirestore();
    const value = firestore[prop];
    return typeof value === 'function' ? value.bind(firestore) : value;
  },
});

const auth = new Proxy({}, {
  get(_, prop) {
    const instance = ensureAuthInstance();
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

function withErrorHandling(handler) {
  return async (data, context) => {
    const correlationId = context?.auth?.uid ? `user-${context.auth.uid}` : `anon-${Date.now()}`;
    const childLogger = logger.child({ correlationId, function: handler.name || 'anonymous' });

    try {
      return await handler(data, context);
    } catch (error) {
      if (error instanceof HttpsError) {
        childLogger.warn({ code: error.code, message: error.message }, 'Handled HttpsError');
        throw error;
      }

      const errorCode = error.message?.split(':')[0] || ErrorCode.INTERNAL_ERROR;
      const httpError = toHttpError(errorCode, error.message);

      childLogger.error({ err: error, errorCode, correlationId }, `Unhandled error: ${httpError.message}`);

      throw new HttpsError(
        getHttpsErrorCode(httpError.status),
        httpError.message
      );
    }
  };
}

function withRequestErrorHandling(handler) {
  return async (req, res) => {
    const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || `req-${Date.now()}`;
    const childLogger = logger.child({ correlationId, function: handler.name || 'anonymous', method: req.method, url: req.url });

    try {
      await handler(req, res);
    } catch (error) {
      if (res.headersSent) {
        childLogger.error({ err: error }, 'Error after headers sent');
        return;
      }

      const errorCode = error.message?.split(':')[0] || ErrorCode.INTERNAL_ERROR;
      const httpError = toHttpError(errorCode, error.message);

      childLogger.error({ err: error, errorCode, correlationId }, `Unhandled error: ${httpError.message}`);

      res.status(httpError.status).json(createErrorResponse(errorCode, httpError.message, correlationId));
    }
  };
}

function getHttpsErrorCode(httpStatus) {
  const codeMap = {
    400: 'invalid-argument',
    401: 'unauthenticated',
    403: 'permission-denied',
    404: 'not-found',
    408: 'deadline-exceeded',
    409: 'aborted',
    429: 'resource-exhausted',
    500: 'internal',
    503: 'unavailable',
    504: 'deadline-exceeded',
  };
  return codeMap[httpStatus] || 'internal';
}

let TELEGRAM_BOT_TOKEN = null;
let TELEGRAM_BOT_USERNAME = null;
let telegramSecretsPromise = null;

async function loadTelegramSecrets() {
  try {
    TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || (await getSecret('telegram-bot-token'));
    TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || (await getSecret('telegram-bot-username'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to load telegram secrets');
  }
  return { token: TELEGRAM_BOT_TOKEN, username: TELEGRAM_BOT_USERNAME };
}

async function getTelegramBotToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  telegramSecretsPromise = telegramSecretsPromise || loadTelegramSecrets();
  const { token } = await telegramSecretsPromise;
  return token;
}

async function getTelegramBotUsername() {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME;
  telegramSecretsPromise = telegramSecretsPromise || loadTelegramSecrets();
  const { username } = await telegramSecretsPromise;
  return username;
}

imapPool;
smtpPool;

module.exports = {
  admin,
  auth,
  db,
  axios,
  ImapFlow,
  nodemailer,
  ensureAdmin,
  HttpsError,
  getTelegramBotToken,
  getTelegramBotUsername,
  TELEGRAM_BOT_TOKEN: () => TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: () => TELEGRAM_BOT_USERNAME,
  imapPool,
  smtpPool,
  logger,
  createModuleLogger,
  correlationIdMiddleware,
  wrapWithCorrelationId,
  setTenantContext,
  setUserContext,
  getCorrelationId,
  setContext,
  clearContext,
  toHttpError,
  createErrorResponse,
  ErrorCode,
  withErrorHandling,
  withRequestErrorHandling,
};
