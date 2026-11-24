const errorCodeMap = {
  ok: { canonicalName: 'OK', status: 200 },
  cancelled: { canonicalName: 'CANCELLED', status: 499 },
  unknown: { canonicalName: 'UNKNOWN', status: 500 },
  'invalid-argument': { canonicalName: 'INVALID_ARGUMENT', status: 400 },
  'deadline-exceeded': { canonicalName: 'DEADLINE_EXCEEDED', status: 504 },
  'not-found': { canonicalName: 'NOT_FOUND', status: 404 },
  'already-exists': { canonicalName: 'ALREADY_EXISTS', status: 409 },
  'permission-denied': { canonicalName: 'PERMISSION_DENIED', status: 403 },
  unauthenticated: { canonicalName: 'UNAUTHENTICATED', status: 401 },
  'resource-exhausted': { canonicalName: 'RESOURCE_EXHAUSTED', status: 429 },
  'failed-precondition': { canonicalName: 'FAILED_PRECONDITION', status: 400 },
  aborted: { canonicalName: 'ABORTED', status: 409 },
  'out-of-range': { canonicalName: 'OUT_OF_RANGE', status: 400 },
  unimplemented: { canonicalName: 'UNIMPLEMENTED', status: 501 },
  internal: { canonicalName: 'INTERNAL', status: 500 },
  'data-loss': { canonicalName: 'DATA_LOSS', status: 500 },
  unavailable: { canonicalName: 'UNAVAILABLE', status: 503 },
};

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    if (code in errorCodeMap === false) {
      throw new Error(`Unknown error code: ${code}.`);
    }
    this.name = 'HttpsError';
    this.code = code;
    this.details = details;
    this.httpErrorCode = errorCodeMap[code];
  }

  toJSON() {
    const { details, httpErrorCode: { canonicalName: status }, message } = this;
    return {
      ...(details === undefined ? {} : { details }),
      message,
      status,
    };
  }
}

module.exports = { HttpsError, errorCodeMap };
