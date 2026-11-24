const { HttpsError } = require('../../functions/services/httpsError');

class APIError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.details = details;
  }
}

const ERROR_STATUS_MAP = {
  'invalid-argument': 400,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'failed-precondition': 409,
  'resource-exhausted': 429,
  'deadline-exceeded': 504,
  unimplemented: 501,
  unavailable: 503,
  internal: 500,
};

function errorStatusFor(code) {
  return ERROR_STATUS_MAP[code] ?? 500;
}

function statusFieldFor(code) {
  if (!code || typeof code !== 'string' || !(code in ERROR_STATUS_MAP)) {
    return 'INTERNAL';
  }
  return code.replace(/-/g, '_').toUpperCase();
}

function errorEnvelope(code, message, details) {
  return {
    error: {
      code,
      status: statusFieldFor(code),
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function toErrorBody(err) {
  if (err instanceof HttpsError || err instanceof APIError) {
    return {
      httpStatus: errorStatusFor(err.code),
      body: errorEnvelope(err.code, err.message, err.details),
    };
  }
  return null;
}

module.exports = {
  APIError,
  HttpsError,
  ERROR_STATUS_MAP,
  errorStatusFor,
  statusFieldFor,
  errorEnvelope,
  toErrorBody,
};
