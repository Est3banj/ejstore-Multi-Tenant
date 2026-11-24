const { createModuleLogger, setUserContext } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getRateLimitConfig, slidingWindowRateLimit } = require('./services/rateLimiter');
const { FF_ID_REGEX } = require('./services/freefire');

const log = createModuleLogger('verifyFreeFireId');

const FF_API_ENDPOINT = 'https://developers.freefirecommunity.com/api/v1/info';
// Región fija LATAM (incl. Colombia). El cliente NO elige región: evitaría
// consumir cuota (500 requests totales) consultando regiones de más.
const FF_API_REGION = 'br';
// FW_002: UA custom, ≥10 chars, SIN tokens de librería (axios/undici/curl…).
const FF_API_USER_AGENT = 'ejstore/1.0 (+https://ejstreaming.shop)';
const FF_API_TIMEOUT_MS = 8000;
const POSITIVE_TTL_MS = 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;

const cache = new Map();
const inflight = new Map();

function readCached(freeFireId) {
  const hit = cache.get(freeFireId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(freeFireId);
    return null;
  }
  return hit.value;
}

function writeCache(freeFireId, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(freeFireId, { value, expiresAt: Date.now() + ttlMs });
}

async function fetchUpstream(freeFireId) {
  const apiKey = process.env.FF_API_KEY;
  if (!apiKey) {
    log.warn('ff.verify.upstream.key_missing');
    return { outcome: 'UNAVAILABLE', ms: 0 };
  }

  const url = `${FF_API_ENDPOINT}?region=${FF_API_REGION}&uid=${encodeURIComponent(freeFireId)}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'User-Agent': FF_API_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FF_API_TIMEOUT_MS),
    });
    const ms = Date.now() - startedAt;

    if (res.status === 404) return { outcome: 'NOT_FOUND', ms };
    if (res.status !== 200) return { outcome: 'UNAVAILABLE', ms, upstreamStatus: res.status };

    const body = await res.json().catch(() => null);
    const basicInfo = body && body.basicInfo;
    if (!basicInfo || typeof basicInfo.nickname !== 'string') {
      return { outcome: 'UNAVAILABLE', ms, upstreamStatus: 200 };
    }
    return {
      outcome: 'OK',
      ms,
      value: {
        ok: true,
        nickname: basicInfo.nickname,
        level: typeof basicInfo.level === 'number' ? basicInfo.level : null,
        likes: typeof basicInfo.likes === 'number' ? basicInfo.likes : (typeof basicInfo.liked === 'number' ? basicInfo.liked : null),
      },
    };
  } catch (err) {
    // Sólo el nombre del error: el mensaje puede traer la URL, nunca la key.
    return { outcome: 'UNAVAILABLE', ms: Date.now() - startedAt, errorName: err && err.name };
  }
}

async function resolveVerification(freeFireId) {
  const cached = readCached(freeFireId);
  if (cached) return { value: cached, source: 'cache', ms: 0 };

  const pending = inflight.get(freeFireId);
  if (pending) return pending;

  const job = (async () => {
    const upstream = await fetchUpstream(freeFireId);
    if (upstream.outcome === 'OK') {
      writeCache(freeFireId, upstream.value, POSITIVE_TTL_MS);
      return { value: upstream.value, source: 'upstream', ms: upstream.ms };
    }
    if (upstream.outcome === 'NOT_FOUND') {
      const value = { ok: false, reason: 'NOT_FOUND' };
      writeCache(freeFireId, value, NOT_FOUND_TTL_MS);
      return { value, source: 'upstream', ms: upstream.ms };
    }
    return { value: { ok: false, reason: 'UNAVAILABLE' }, source: 'upstream', ms: upstream.ms, errorName: upstream.errorName, upstreamStatus: upstream.upstreamStatus };
  })();

  inflight.set(freeFireId, job);
  try {
    return await job;
  } finally {
    inflight.delete(freeFireId);
  }
}

async function verifyFreeFireId(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated verifyFreeFireId attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const userUid = context.auth.uid;
  setUserContext(userUid);
  const childLog = log.child({ uid: userUid, operation: 'verifyFreeFireId' });

  const rawFreeFireId = data && data.freeFireId;
  const freeFireId = typeof rawFreeFireId === 'string' ? rawFreeFireId.trim() : '';

  const rlConfig = getRateLimitConfig('ffverify');
  const rl = await slidingWindowRateLimit('ffverify', userUid, rlConfig.limit, rlConfig.windowMs);
  if (!rl.allowed) {
    childLog.warn({ retryAfter: rl.retryAfter }, 'ff.verify.rate_limited');
    throw new HttpsError('resource-exhausted', `Esperá ${rl.retryAfter}s antes de volver a verificar`);
  }

  if (!FF_ID_REGEX.test(freeFireId)) {
    childLog.warn('ff.verify.invalid_format');
    throw new HttpsError(
      'invalid-argument',
      'El ID de jugador de Free Fire no es válido (debe tener entre 8 y 12 dígitos)',
      { code: 'FF_ID_INVALIDO' }
    );
  }

  const requestedAt = Date.now();
  const outcome = await resolveVerification(freeFireId);
  childLog.info(
    {
      ffUid: freeFireId,
      reason: outcome.value.ok ? 'OK' : outcome.value.reason,
      ms: Date.now() - requestedAt,
      source: outcome.source,
      ...(outcome.upstreamStatus ? { upstreamStatus: outcome.upstreamStatus } : {}),
      ...(outcome.errorName ? { errorName: outcome.errorName } : {}),
    },
    'ff.verify.outcome'
  );

  return outcome.value;
}

// Test-only: limpia cache + single-flight entre casos.
function clearFreeFireVerifyState() {
  cache.clear();
  inflight.clear();
}

module.exports = { verifyFreeFireId, clearFreeFireVerifyState };
