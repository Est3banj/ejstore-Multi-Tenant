const { randomBytes, randomUUID } = require('node:crypto');
const { admin, db, axios } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getUserRole } = require('./auth');
const { requireVerifiedClient } = require('./services/authVerification');
const { validateIdempotencyKey } = require('./services/idempotencyService');
const { API_BASES, hash, validId, completeConfig, verifyEvent, checkoutUrl } = require('./services/wompiProtocol');
const { settleRechargeTransaction, isValidRechargeAmount, parseRechargeAmount } = require('./recharges');

const fail = () => new HttpsError('failed-precondition', 'Wompi no está disponible para esta cuenta o configuración');
const privateRef = tenantId => db.collection('tenants').doc(tenantId).collection('secrets').doc('wompi');
const versionRef = (tenantId, version) => db.collection('tenants').doc(tenantId).collection('secrets').doc(`wompi_${version}`);
const intentRef = id => db.collection('wompi_intents').doc(id);

async function actor(context) {
  if (!context?.auth) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  const identity = await getUserRole(context.auth.uid);
  return { ...identity, uid: context.auth.uid };
}

async function adminTenant(data, context) {
  const identity = await actor(context);
  const tenantId = identity.role === 'superadmin' ? data?.tenantId : identity.tenantId;
  if (!['admin', 'superadmin'].includes(identity.role) || !validId(tenantId) ||
      (data?.tenantId && data.tenantId !== tenantId)) throw new HttpsError('permission-denied', 'No autorizado');
  if (!(await db.collection('tenants').doc(tenantId).get()).exists) throw fail();
  return tenantId;
}

async function owner(context) {
  const identity = await actor(context);
  // Claims are server-maintained. A customer document or a URL alone is not
  // sufficient: existing legacy rules let customers edit their tenantId.
  if (!validId(identity.tenantId)) throw fail();
  const collection = identity.role === 'reseller' ? 'resellers' : 'customers';
  if (!['client', 'customer', 'reseller'].includes(identity.role)) throw fail();
  const snap = await db.collection(collection).doc(identity.uid).get();
  if (!snap.exists || snap.data().tenantId !== identity.tenantId || snap.data().isActive === false) throw fail();
  return { ...identity, collection, profile: snap.data() };
}

async function getWompiConfig(data, context) {
  const tenantId = await adminTenant(data, context);
  const snap = await privateRef(tenantId).get();
  const config = snap.data();
  return { enabled: config?.enabled === true && completeConfig(config), configured: completeConfig(config),
    environment: config?.environment || 'test', publicKey: config?.publicKey || '' };
}

async function saveWompiConfig(data, context) {
  const tenantId = await adminTenant(data, context);
  if (typeof data?.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled debe ser booleano');
  await db.runTransaction(async transaction => {
    const ref = privateRef(tenantId);
    const previous = (await transaction.get(ref)).data() || {};
    const config = { enabled: data.enabled, environment: data.environment || previous.environment || 'test' };
    for (const field of ['publicKey', 'privateKey', 'integritySecret', 'eventsSecret']) {
      config[field] = typeof data[field] === 'string' && data[field].trim() ? data[field].trim() : (previous[field] || '');
    }
    if (!completeConfig(config) && (config.enabled || Object.values(config).some(v => typeof v === 'string' && v && v !== 'test'))) {
      throw new HttpsError('invalid-argument', 'Configuración incompleta o llaves de ambientes diferentes');
    }
    config.version = randomUUID();
    config.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    // Immutable versions allow in-flight payments and retries after disable or rotation.
    transaction.set(versionRef(tenantId, config.version), config);
    transaction.set(ref, config);
  });
  return getWompiConfig({ tenantId }, context);
}

async function getWompiAvailability(data, context) {
  try {
    const identity = await owner(context);
    if (data?.tenantId && data.tenantId !== identity.tenantId) return { enabled: false };
    if (data?.rechargeId) {
      if (!/^wompi_[a-f0-9]{48}$/.test(data.rechargeId)) return { enabled: false };
      const intent = (await intentRef(data.rechargeId).get()).data();
      if (!intent || intent.userId !== identity.uid || intent.tenantId !== identity.tenantId || intent.status !== 'pending') return { enabled: false };
      const saved = (await versionRef(intent.tenantId, intent.configVersion).get()).data();
      return { enabled: completeConfig(saved), environment: intent.environment };
    }
    const config = (await privateRef(identity.tenantId).get()).data();
    return { enabled: config?.enabled === true && completeConfig(config),
      ...(config?.enabled === true && completeConfig(config) ? { environment: config.environment } : {}) };
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'failed-precondition') return { enabled: false };
    throw error;
  }
}

async function createWompiCheckout(data, context) {
  requireVerifiedClient(context);
  const identity = await owner(context);
  if (data?.tenantId && data.tenantId !== identity.tenantId) throw new HttpsError('permission-denied', 'No autorizado');
  if (data?.rechargeId) {
    if (!/^wompi_[a-f0-9]{48}$/.test(data.rechargeId)) throw fail();
    const intent = (await intentRef(data.rechargeId).get()).data();
    if (!intent || intent.userId !== identity.uid || intent.tenantId !== identity.tenantId || intent.status !== 'pending') throw fail();
    const config = (await versionRef(intent.tenantId, intent.configVersion).get()).data();
    if (!completeConfig(config)) throw fail();
    return { success: true, rechargeId: intent.reference, checkoutUrl: checkoutUrl(intent, config), environment: intent.environment };
  }
  const amount = parseRechargeAmount(data?.amount);
  if (!isValidRechargeAmount(amount) || !Number.isSafeInteger(amount * 100)) throw new HttpsError('invalid-argument', 'Monto inválido');
  const key = data?.idempotencyKey;
  if (typeof key !== 'string' || !validateIdempotencyKey(key).valid) throw new HttpsError('invalid-argument', 'Clave de idempotencia requerida');
  const lockRef = db.collection('recharge_locks').doc(identity.uid);
  const requestRef = db.collection('wompi_requests').doc(hash(`${identity.uid}:${key}`));
  const reference = `wompi_${randomBytes(24).toString('hex')}`;
  // Legacy discovery outside the transaction, as in QR. The deterministic
  // per-user lock below serializes all new QR/Wompi creates. A query inside
  // this transaction creates broad read locks and deadlocks concurrent creates.
  const history = await db.collection('recharges').where('userId', '==', identity.uid)
    .orderBy('createdAt', 'desc').limit(50).get();
  const hasPending = history.docs.some(doc => doc.data().status === 'pending');
  const result = await db.runTransaction(async transaction => {
    const config = (await transaction.get(privateRef(identity.tenantId))).data();
    if (!config?.enabled || !completeConfig(config)) throw fail();
    const request = await transaction.get(requestRef);
    if (request.exists) {
      const existing = (await transaction.get(intentRef(request.data().reference))).data();
      if (!existing || existing.status !== 'pending' || existing.userId !== identity.uid || existing.tenantId !== identity.tenantId || existing.amount !== amount) throw fail();
      const saved = (await transaction.get(versionRef(existing.tenantId, existing.configVersion))).data();
      return { reference: existing.reference, checkoutUrl: checkoutUrl(existing, saved), environment: existing.environment };
    }
    const lock = await transaction.get(lockRef);
    if (lock.exists && lock.data().rechargeId) {
      const pending = await transaction.get(db.collection('recharges').doc(lock.data().rechargeId));
      if (pending.exists && pending.data().status === 'pending') {
        throw new HttpsError('failed-precondition', 'Ya tenés una recarga pendiente. Revisá el historial.');
      }
    }
    // Also catches legacy pending requests without a lock (same scope as QR).
    if (hasPending) throw new HttpsError('failed-precondition', 'Ya tenés una recarga pendiente. Revisá el historial.');
    const intent = { reference, userId: identity.uid, tenantId: identity.tenantId, amount,
      amountInCents: amount * 100, currency: 'COP', environment: config.environment,
      publicKey: config.publicKey, configVersion: config.version, beneficiaryCollection: identity.collection,
      status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() };
    transaction.create(intentRef(reference), intent);
    transaction.create(db.collection('recharges').doc(reference), { userId: identity.uid,
      resellerId: identity.role === 'reseller' ? identity.uid : identity.profile.createdBy || null,
      tenantId: identity.tenantId, amount, status: 'pending', provider: 'wompi', environment: config.environment,
      customerName: identity.profile.name || identity.profile.fullName || '', customerPhone: identity.profile.phone || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.set(requestRef, { reference });
    transaction.set(lockRef, { rechargeId: reference, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { reference, checkoutUrl: checkoutUrl(intent, config), environment: config.environment };
  });
  return { success: true, rechargeId: result.reference, ...result };
}

async function handleWompiEvent(event, environment) {
  const transaction = event?.data?.transaction;
  if (!Object.hasOwn(API_BASES, environment) || event?.environment !== environment ||
      typeof transaction?.reference !== 'string' || !/^wompi_[a-f0-9]{48}$/.test(transaction.reference) || !validId(transaction.id)) throw fail();
  const intent = (await intentRef(transaction.reference).get()).data();
  if (!intent || intent.environment !== environment) throw fail();
  const config = (await versionRef(intent.tenantId, intent.configVersion).get()).data();
  if (!completeConfig(config) || config.environment !== environment || config.publicKey !== intent.publicKey || !verifyEvent(event, config.eventsSecret)) throw fail();
  // Reference/currency/environment are NOT covered by the standard event's
  // signature. Always retrieve via the tenant's private key and a fixed host.
  // Never log axios errors: they contain the Authorization header.
  let verified;
  try {
    const response = await axios.get(`${API_BASES[environment]}/transactions/${encodeURIComponent(transaction.id)}`, {
      headers: { Authorization: `Bearer ${config.privateKey}`, Accept: 'application/json' },
      timeout: 10000, maxRedirects: 0, maxContentLength: 1024 * 1024, proxy: false,
    });
    verified = response.data?.data;
  } catch { throw new HttpsError('unavailable', 'No se pudo verificar el evento de pago'); }
  for (const value of [transaction, verified]) {
    if (!value || value.id !== transaction.id || value.reference !== intent.reference ||
        value.amount_in_cents !== intent.amountInCents || value.currency !== 'COP' ||
        !['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(value.status)) throw fail();
  }
  const merchantKey = verified.merchant?.public_key ||
    (typeof verified.merchant?.id === 'string' && verified.merchant.id.startsWith('pub_') ? verified.merchant.id : null);
  if (verified.status !== transaction.status || (merchantKey && merchantKey !== intent.publicKey)) throw fail();
  if (verified.status === 'PENDING') return { received: true };
  const settled = await settleRechargeTransaction({ rechargeRef: db.collection('recharges').doc(intent.reference),
    action: verified.status === 'APPROVED' ? 'approve' : 'reject', processedBy: 'wompi',
    wompiPayment: { transactionId: verified.id, reference: intent.reference, environment,
      amountInCents: verified.amount_in_cents, currency: verified.currency, status: verified.status } });
  if (!settled.duplicate) {
    // Deterministic notification, outside the monetary transaction. Failure
    // must never convert a completed credit into a retryable credit operation.
    await db.collection('notifications').doc(intent.reference).set({ userId: intent.userId,
      type: 'recharge_status', title: environment === 'test' ? 'Prueba Wompi (sin saldo real)' : 'Recarga Wompi',
      message: environment === 'test' ? `Prueba sandbox: ${verified.status}. No modifica tu saldo.`
        : `Pago Wompi: ${verified.status}.`, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  }
  return { received: true };
}

async function wompiWebhook(req, res) {
  try {
    await handleWompiEvent(req.body, req.params.environment);
    res.status(200).json({ received: true });
  } catch (error) {
    // Same response for unknown references, wrong tenants and invalid signatures.
    res.status(error?.code === 'unavailable' ? 503 : 400).json({ received: false });
  }
}

module.exports = { getWompiConfig, saveWompiConfig, getWompiAvailability, createWompiCheckout, handleWompiEvent, wompiWebhook };
