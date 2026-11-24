const { randomUUID } = require('crypto');
const { APIError, HttpsError, errorEnvelope, errorStatusFor } = require('./errors');
const { getAllowedOrigins } = require('./config');
const { auth } = require('./firebaseAdmin');

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  // Cache selection also varies for rejected and origin-less requests.
  res.vary('Origin');

  if (!origin) {
    next();
    return;
  }

  if (getAllowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  res.status(403).json(errorEnvelope('permission-denied', 'Origin no permitido'));
}

function makeVerifyBearer(verifyIdToken) {
  return async function verifyBearer(req) {
    const header = req.headers.authorization || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1].length === 0) {
      throw new APIError('unauthenticated', 'Debe iniciar sesión');
    }
    try {
      const decoded = await verifyIdToken(parts[1]);
      return { uid: decoded.uid, token: decoded };
    } catch {
      throw new APIError('unauthenticated', 'Debe iniciar sesión');
    }
  };
}

const verifyBearer = makeVerifyBearer((token) => auth().verifyIdToken(token));

function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpsError || err instanceof APIError) {
    res.status(errorStatusFor(err.code)).json(errorEnvelope(err.code, err.message, err.details));
    return;
  }

  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json(errorEnvelope('invalid-argument', 'Body inválido: JSON mal formado'));
    return;
  }

  const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || randomUUID();
  console.error(JSON.stringify({
    level: 'error',
    correlationId,
    msg: err && err.message,
    stack: err && err.stack,
  }));
  res.status(500).json(errorEnvelope('internal', 'Error interno del servidor'));
}

module.exports = { corsMiddleware, makeVerifyBearer, verifyBearer, errorMiddleware };
