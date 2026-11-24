const { admin, db } = require('../config');
const { HttpsError } = require('./httpsError');

// ============================================
// RATE LIMITER CONFIGURATION
// ============================================

const RATE_LIMIT_CONFIGS = {
  purchase: {
    limit: 100,
    windowMs: 60000, // 1 minute
    description: 'Purchase operations (create, bulk, webhook)',
  },
  recharge: {
    limit: 30,
    windowMs: 60000, // 1 minute
    description: 'Recharge operations (create, approve, check)',
  },
  webhook: {
    limit: 200,
    windowMs: 60000, // 1 minute
    description: 'Telegram/email webhooks',
  },
  auth: {
    limit: 20,
    windowMs: 300000, // 5 minutes
    description: 'Auth operations (login, register, token)',
  },
  otp: {
    limit: 1,
    windowMs: 60000, // 1 minute
    description: 'OTP verification code sends',
  },
  reseller: {
    limit: 50,
    windowMs: 60000, // 1 minute
    description: 'Reseller operations (public links, catalog)',
  },
  ffverify: {
    limit: 15,
    windowMs: 60000, // 1 minute
    description: 'Free Fire ID verification lookups (upstream quota 500 total)',
  },
  default: {
    limit: 60,
    windowMs: 60000, // 1 minute
    description: 'Default rate limit',
  },
};

const RATE_LIMITS_COLLECTION = 'rate_limits';

/**
 * Get rate limit configuration for an operation type
 * @param {string} operation - Operation type (purchase, recharge, webhook, auth, otp, reseller)
 * @returns {Object} Config with limit and windowMs
 */
function getRateLimitConfig(operation) {
  return RATE_LIMIT_CONFIGS[operation] || RATE_LIMIT_CONFIGS.default;
}

/**
 * Build Firestore doc id for rate limiting (doc: rate_limits/{scope}:{identifier})
 * @param {string} tenantId - Tenant/scope ID
 * @param {string} identifier - Operation identifier (purchase, recharge, etc.)
 * @returns {string} Doc id
 */
function buildRateLimitKey(tenantId, identifier) {
  return `${tenantId}:${identifier}`;
}

function rateLimitDoc(tenantId, identifier) {
  return db.collection(RATE_LIMITS_COLLECTION).doc(buildRateLimitKey(tenantId, identifier));
}

/**
 * Sliding window rate limit check (Firestore hits[] array)
 * Doc shape: { hits: number[] (timestamps within window), expiresAt: Timestamp (TTL cleanup only) }
 *
 * @param {string} tenantId - Tenant ID
 * @param {string} identifier - Operation identifier
 * @param {number} limit - Max requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} { allowed, remaining, retryAfter, resetTime, total }
 */
async function slidingWindowRateLimit(tenantId, identifier, limit, windowMs) {
  const docRef = rateLimitDoc(tenantId, identifier);
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    return await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      const stored = snap.exists ? snap.data() : null;
      const hits = (Array.isArray(stored?.hits) ? stored.hits : []).filter((h) => h > windowStart);
      const currentCount = hits.length;
      const allowed = currentCount < limit;

      if (!allowed) {
        const oldest = hits[0];
        const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
        return {
          allowed: false,
          remaining: 0,
          retryAfter: Math.max(1, retryAfter),
          resetTime: oldest + windowMs,
          total: currentCount + 1,
        };
      }

      hits.push(now);
      transaction.set(docRef, {
        hits,
        expiresAt: admin.firestore.Timestamp.fromMillis(now + windowMs * 2),
      });

      return {
        allowed: true,
        remaining: Math.max(0, limit - hits.length),
        retryAfter: null,
        resetTime: now + windowMs,
        total: currentCount + 1,
      };
    });
  } catch (error) {
    console.error('[RateLimiter] Error in slidingWindowRateLimit:', error.message);
    throw new HttpsError('unavailable', 'Servicio de límites no disponible. Intentá de nuevo.');
  }
}

/**
 * Express/Functions middleware for rate limiting
 * @param {Object} options - Rate limit options
 * @returns {Function} Middleware function
 */
function rateLimitMiddleware(options = {}) {
  const {
    operation = 'default',
    keyGenerator = (data, context) => {
      // Default: use tenantId from context or data
      return context?.auth?.token?.tenantId || data?.tenantId || 'anonymous';
    },
    identifier = null,
  } = options;

  const config = getRateLimitConfig(operation);

  return async (data, context) => {
    const tenantId = keyGenerator(data, context);
    const id = identifier || operation;

    const result = await slidingWindowRateLimit(tenantId, id, config.limit, config.windowMs);

    // Add rate limit info to context for downstream use
    if (context) {
      context.rateLimit = {
        limit: config.limit,
        remaining: result.remaining,
        resetTime: result.resetTime,
      };
    }

    if (!result.allowed) {
      const error = new Error('Rate limit exceeded');
      error.code = 'ERR_RATE_LIMITED';
      error.httpStatus = 429;
      error.rateLimit = {
        limit: config.limit,
        remaining: 0,
        retryAfter: result.retryAfter,
        resetTime: result.resetTime,
      };
      throw error;
    }

    return result;
  };
}

/**
 * Check rate limit without incrementing (for monitoring)
 * @param {string} tenantId - Tenant ID
 * @param {string} identifier - Operation identifier
 * @returns {Object} Current rate limit status
 */
async function checkRateLimit(tenantId, identifier) {
  const config = getRateLimitConfig(identifier);
  const docRef = rateLimitDoc(tenantId, identifier);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const snap = await docRef.get();
  const stored = snap.exists ? snap.data() : null;
  const used = (Array.isArray(stored?.hits) ? stored.hits : []).filter((h) => h > windowStart).length;
  return {
    limit: config.limit,
    used,
    remaining: Math.max(0, config.limit - used),
    resetTime: now + config.windowMs,
  };
}

/**
 * Reset rate limit for a tenant/identifier (admin operation)
 * @param {string} tenantId - Tenant ID
 * @param {string} identifier - Operation identifier
 */
async function resetRateLimit(tenantId, identifier) {
  await rateLimitDoc(tenantId, identifier).delete();
}

/**
 * Get all rate limit doc ids for a tenant (admin operation)
 * @param {string} tenantId - Tenant ID
 * @returns {Array<string>} Rate limit doc ids
 */
async function getTenantRateLimitKeys(tenantId) {
  const prefix = `${tenantId}:`;
  const snap = await db.collection(RATE_LIMITS_COLLECTION)
    .where(admin.firestore.FieldPath.documentId(), '>=', prefix)
    .where(admin.firestore.FieldPath.documentId(), '<=', prefix + '\uf8ff')
    .get();
  return snap.docs.map((d) => d.id);
}

module.exports = {
  getRateLimitConfig,
  slidingWindowRateLimit,
  rateLimitMiddleware,
  checkRateLimit,
  resetRateLimit,
  getTenantRateLimitKeys,
  RATE_LIMIT_CONFIGS,
  RATE_LIMITS_COLLECTION,
};
