const { admin, db } = require('../config');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('idempotency');

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const IDEMPOTENCY_COLLECTION = 'idempotency';

function buildIdempotencyKey(idempotencyKey, tenantId) {
  return `${tenantId}:${idempotencyKey}`;
}

function idempotencyDoc(idempotencyKey, tenantId) {
  return db.collection(IDEMPOTENCY_COLLECTION).doc(buildIdempotencyKey(idempotencyKey, tenantId));
}

async function checkAndSetIdempotencyKey(idempotencyKey, tenantId) {
  const docRef = idempotencyDoc(idempotencyKey, tenantId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    if (snap.exists) {
      return false;
    }
    const now = admin.firestore.Timestamp.now();
    transaction.set(docRef, {
      status: 'processing',
      result: null,
      createdAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_MS),
    });
    return true;
  });
}

async function getIdempotencyResult(idempotencyKey, tenantId) {
  const snap = await idempotencyDoc(idempotencyKey, tenantId).get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  if (!data || data.status !== 'done') {
    return null;
  }
  if (data.expiresAt && typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() < Date.now()) {
    return null;
  }
  return data.result ?? null;
}

async function storeIdempotencyResult(idempotencyKey, tenantId, result) {
  await idempotencyDoc(idempotencyKey, tenantId).set({
    status: 'done',
    result,
    createdAt: admin.firestore.Timestamp.now(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_MS),
  }, { merge: true });
}

async function releaseIdempotencyKey(idempotencyKey, tenantId) {
  await idempotencyDoc(idempotencyKey, tenantId).delete();
}

function validateIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return { valid: false, error: 'idempotencyKey is required and must be a string' };
  }

  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return { valid: false, error: 'idempotencyKey must be between 16 and 128 characters' };
  }

  // Allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) {
    return { valid: false, error: 'idempotencyKey must contain only alphanumeric characters, hyphens, and underscores' };
  }

  return { valid: true };
}

async function withIdempotency(idempotencyKey, tenantId, operation) {
  const validation = validateIdempotencyKey(idempotencyKey);
  if (!validation.valid) {
    throw new Error(`IDEMPOTENCY_INVALID: ${validation.error}`);
  }

  // Check if we already have a completed result
  const existingResult = await getIdempotencyResult(idempotencyKey, tenantId);
  if (existingResult) {
    log.info({ idempotencyKey, tenantId }, 'Returning cached idempotent result');
    return { ...existingResult, idempotent: true };
  }

  // Try to acquire the lock (SETNX: transactional create)
  const acquired = await checkAndSetIdempotencyKey(idempotencyKey, tenantId);
  if (!acquired) {
    // Another request is processing - wait and check for result
    log.warn({ idempotencyKey, tenantId }, 'Idempotency key already being processed, waiting...');

    // Wait up to 30 seconds for the other request to complete
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const result = await getIdempotencyResult(idempotencyKey, tenantId);
      if (result) {
        return { ...result, idempotent: true };
      }
    }

    throw new Error('IDEMPOTENCY_TIMEOUT: Concurrent request timed out');
  }

  try {
    const result = await operation();
    await storeIdempotencyResult(idempotencyKey, tenantId, result);
    return { ...result, idempotent: false };
  } catch (error) {
    // Release the key so it can be retried
    await releaseIdempotencyKey(idempotencyKey, tenantId);
    throw error;
  }
}

async function shutdown() {}

module.exports = {
  validateIdempotencyKey,
  checkAndSetIdempotencyKey,
  getIdempotencyResult,
  storeIdempotencyResult,
  releaseIdempotencyKey,
  withIdempotency,
  shutdown,
  IDEMPOTENCY_COLLECTION,
};
