const { db, createModuleLogger } = require('./config');
const { HttpsError } = require('./services/httpsError');

const log = createModuleLogger('publicStats');

// Aggregate social-proof for the public registration CTA.
// Privacy: ONLY an integer count — never user ids/emails/amounts.
//
// Protection design (justified — NOT rateLimiter):
//   rateLimiter keys are `${tenantId}:${identifier}` with keyGenerator default
//   `context.auth?.tenantId || data.tenantId || 'anonymous'` — there is NO IP
//   in the callable/Express handler signature (app.js only passes data+context).
//   A per-IP 'publicStats' config is impossible without plumbing req.ip; a
//   shared 'anonymous' 10/min bucket would DoS all legitimate public visitors
//   behind one key. Fallback per brief: module-scope in-memory TTL cache.
//   While warm, Firestore is hit ≤1× / TTL per instance regardless of RPS.

const PUBLIC_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min (brief: 5–10 min)

// Calendar month start in UTC (documented choice over America/Bogota:
// serverTimestamps are UTC; UTC month boundaries need no TZ conversion and
// match how Firestore stores createdAt).
function utcMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Module-scope cache: { count, expiresAt }. null = cold.
let statsCache = null;

function resetPublicStatsCache() {
  statsCache = null;
}

async function countRechargesThisMonthUtc() {
  const start = utcMonthStart();
  // Firestore range filters accept plain Date (auto-coerced to Timestamp) —
  // avoids admin.firestore.Timestamp vs instance.Timestamp API mismatch.
  const snap = await db
    .collection('recharges')
    .where('createdAt', '>=', start)
    .get();
  // Query.get().size = docs in the window; single-field createdAt index is automatic.
  return typeof snap?.size === 'number' ? snap.size : 0;
}

/**
 * Public stats for landing social proof. auth: 'none' (registry).
 * @returns {Promise<{ rechargesThisMonth: number }>}
 */
async function getPublicStats(_data, _context) {
  const now = Date.now();

  if (statsCache && now < statsCache.expiresAt) {
    return { rechargesThisMonth: statsCache.count };
  }

  try {
    const count = await countRechargesThisMonthUtc();
    statsCache = { count, expiresAt: now + PUBLIC_STATS_CACHE_TTL_MS };
    log.info({ count }, 'publicStats refreshed');
    return { rechargesThisMonth: count };
  } catch (err) {
    // Stale-on-error OK: serve last known good so a Firestore blip does not
    // flash the social-proof line off. Cold + error → fail-closed (frontend hides).
    if (statsCache && typeof statsCache.count === 'number') {
      log.warn({ err: err?.message }, 'publicStats query failed — serving stale cache');
      return { rechargesThisMonth: statsCache.count };
    }
    log.error({ err: err?.message }, 'publicStats cold failure');
    throw new HttpsError('unavailable', 'No se pudieron cargar las estadísticas públicas');
  }
}

module.exports = {
  getPublicStats,
  resetPublicStatsCache,
  utcMonthStart,
  PUBLIC_STATS_CACHE_TTL_MS,
};
