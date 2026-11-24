const crypto = require('crypto');
const { admin, db, auth, createModuleLogger, setTenantContext, setUserContext } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getUserRole } = require('./auth');
const { sendEmail, buildOtpEmail } = require('./email');
const { getRateLimitConfig, slidingWindowRateLimit, resetRateLimit } = require('./services/rateLimiter');

const log = createModuleLogger('otp');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const OTP_COLLECTION = 'otpVerifications';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function resolveTenantId(context) {
  const uid = context.auth.uid;
  const token = context.auth.token || {};

  try {
    const customerDoc = await db.collection('customers').doc(uid).get();
    if (customerDoc.exists && customerDoc.data().tenantId) {
      return customerDoc.data().tenantId;
    }
  } catch (_) {}

  if (token.tenantId) return token.tenantId;

  try {
    const { tenantId } = await getUserRole(uid);
    return tenantId || null;
  } catch (_) {
    return null;
  }
}

async function sendOtpVerification(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated OTP send attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const email = String((context.auth.token && context.auth.token.email) || '').trim().toLowerCase();
  const childLog = log.child({ uid, operation: 'sendOtpVerification' });
  setUserContext(uid);

  if (!email) {
    childLog.warn('Token has no email');
    throw new HttpsError('invalid-argument', 'Correo no disponible en la sesión');
  }

  const emailHash = sha256(email);

  const tenantId = await resolveTenantId(context);
  if (!tenantId) {
    childLog.warn({ emailHash }, 'Could not resolve tenant for OTP send');
    throw new HttpsError('failed-precondition', 'No se pudo resolver la tienda para enviar el código');
  }
  setTenantContext(tenantId);

  const otpConfig = getRateLimitConfig('otp');
  const rateLimit = await slidingWindowRateLimit('otp', email, otpConfig.limit, otpConfig.windowMs);
  if (!rateLimit.allowed) {
    childLog.warn({ emailHash, retryAfter: rateLimit.retryAfter }, 'OTP send rate limited');
    throw new HttpsError('resource-exhausted', `Esperá ${rateLimit.retryAfter}s antes de reenviar`);
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const otpRef = db.collection(OTP_COLLECTION).doc(emailHash);

  await otpRef.set({
    email,
    uid,
    tenantId,
    otpHash: sha256(code),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const result = await sendEmail(tenantId, email, 'Tu código de verificación', buildOtpEmail({ code }));

  if (!result || !result.ok) {
    const error = (result && result.error) || 'UNKNOWN';
    childLog.error({ tenantId, emailHash, error }, 'otp.send.failed');
    try { await otpRef.delete(); } catch (_) {}
    try { await resetRateLimit('otp', email); } catch (_) {}
    throw new HttpsError('internal', 'No se pudo enviar el código. Intentá de nuevo.');
  }

  childLog.info({ tenantId, emailHash }, 'otp.send.success');
  return { success: true, cooldownSeconds: Math.round(otpConfig.windowMs / 1000) };
}

async function verifyOtpCode(data, context) {
  if (!context.auth) {
    log.warn('Unauthenticated OTP verify attempt');
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const uid = context.auth.uid;
  const email = String((context.auth.token && context.auth.token.email) || '').trim().toLowerCase();
  const code = String((data && data.code) || '').trim();
  const childLog = log.child({ uid, operation: 'verifyOtpCode' });
  setUserContext(uid);

  if (!/^\d{6}$/.test(code)) {
    childLog.warn('Invalid OTP code format');
    throw new HttpsError('invalid-argument', 'Código de 6 dígitos requerido');
  }

  if (!email) {
    childLog.warn('Token has no email');
    throw new HttpsError('invalid-argument', 'Correo no disponible en la sesión');
  }

  const emailHash = sha256(email);
  const otpRef = db.collection(OTP_COLLECTION).doc(emailHash);
  const otpSnap = await otpRef.get();

  if (!otpSnap.exists) {
    childLog.warn({ emailHash }, 'OTP document not found');
    throw new HttpsError('not-found', 'No hay código activo para este correo o ya expiró');
  }

  const otpData = otpSnap.data();
  if (otpData.tenantId) setTenantContext(otpData.tenantId);

  if (otpData.expiresAt.toMillis() < Date.now()) {
    childLog.warn({ emailHash }, 'OTP code expired');
    await otpRef.delete();
    throw new HttpsError('deadline-exceeded', 'Código expirado. Solicitá uno nuevo.');
  }

  const maxAttempts = otpData.maxAttempts || MAX_ATTEMPTS;
  if ((otpData.attempts || 0) >= maxAttempts) {
    childLog.warn({ emailHash, attempts: otpData.attempts }, 'OTP attempts exhausted');
    await otpRef.delete();
    throw new HttpsError('resource-exhausted', 'Superaste el límite de intentos. Solicitá un nuevo código.');
  }

  if (otpData.uid && otpData.uid !== uid) {
    childLog.warn({ emailHash }, 'OTP uid mismatch');
    throw new HttpsError('failed-precondition', 'El código no corresponde a esta sesión');
  }

  let targetUid = uid;
  if (!otpData.uid) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      if (userRecord && userRecord.uid) targetUid = userRecord.uid;
    } catch (_) {}
    if (targetUid !== uid) {
      childLog.warn({ emailHash }, 'OTP email resolves to a different account');
      throw new HttpsError('failed-precondition', 'El código no corresponde a esta sesión');
    }
  }

  if (sha256(code) !== otpData.otpHash) {
    const attempts = (otpData.attempts || 0) + 1;
    if (attempts >= maxAttempts) {
      childLog.warn({ emailHash, attempts }, 'OTP lockout reached');
      await otpRef.delete();
      throw new HttpsError('resource-exhausted', 'Código incorrecto. Superaste el límite de intentos.');
    }
    await otpRef.update({ attempts });
    const remaining = maxAttempts - attempts;
    childLog.warn({ emailHash, attempts, remaining }, 'OTP code mismatch');
    throw new HttpsError('invalid-argument', `Código incorrecto. Te quedan ${remaining} intento${remaining === 1 ? '' : 's'}.`);
  }

  try {
    await auth.updateUser(targetUid, { emailVerified: true });
  } catch (error) {
    childLog.error({ err: error }, 'otp.verify.auth_update_failed');
    throw new HttpsError('internal', 'No se pudo verificar el correo. Intentá de nuevo.');
  }

  try {
    const customerRef = db.collection('customers').doc(targetUid);
    const customerSnap = await customerRef.get();
    if (customerSnap.exists) {
      await customerRef.update({
        emailVerified: true,
        emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    childLog.error({ err: error }, 'otp.verify.mirror_update_failed');
  }

  await otpRef.delete();
  childLog.info({ emailHash }, 'otp.verify.success');
  return { success: true };
}

module.exports = { sendOtpVerification, verifyOtpCode };
