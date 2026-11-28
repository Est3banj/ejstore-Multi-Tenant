const { randomBytes, randomUUID } = require('node:crypto');
const { admin, db, axios } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { getUserRole } = require('./auth');
const { requireVerifiedClient } = require('./services/authVerification');
const { validateIdempotencyKey } = require('./services/idempotencyService');
const { API_BASES, CONFIG_FIELDS, hash, validId, configError, completeConfig, verifyEvent, checkoutUrl, widgetConfig } = require('./services/wompiProtocol');
const { settleRechargeTransaction, isValidRechargeAmount, parseRechargeAmount } = require('./recharges');
const { normalizePolicies, calculateQuote, intentQuote } = require('./services/wompiFees');

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
    environment: config?.environment || 'test', publicKey: config?.publicKey || '', feePolicies: normalizePolicies(config?.feePolicies) };
}

async function saveWompiConfig(data, context) {
  const tenantId = await adminTenant(data, context);
  if (typeof data?.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'enabled debe ser booleano');
  await db.runTransaction(async transaction => {
    const ref = privateRef(tenantId);
    const previous = (await transaction.get(ref)).data() || {};
    const config = { enabled: data.enabled, environment: data.environment ?? previous.environment ?? 'test' };
    try { config.feePolicies = normalizePolicies(data.feePolicies === undefined ? previous.feePolicies : data.feePolicies); }
    catch { throw new HttpsError('invalid-argument', 'Política de cargo Wompi inválida: revisá porcentaje, fijo e IVA de la comisión.'); }
    if (!Object.hasOwn(API_BASES, config.environment)) throw new HttpsError('invalid-argument', configError(config));
    for (const field of Object.keys(CONFIG_FIELDS)) {
      if (data[field] !== undefined && typeof data[field] !== 'string') {
        throw new HttpsError('invalid-argument', `${CONFIG_FIELDS[field]} debe ser texto.`);
      }
      config[field] = typeof data[field] === 'string' && data[field].trim() ? data[field].trim() : (previous[field] || '');
    }
    if (config.enabled || Object.keys(CONFIG_FIELDS).some(field => config[field])) {
      const error = configError(config);
      if (error) throw new HttpsError('invalid-argument', error);
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

function quoteAmount(data) {
  const amount = parseRechargeAmount(data?.amount);
  if (typeof data?.amount !== 'number' || !isValidRechargeAmount(amount) || !Number.isSafeInteger(amount * 100)) throw new HttpsError('invalid-argument', 'Monto inválido');
  return amount;
}

function currentQuote(identity, amount, config) {
  if (config?.enabled !== true || !completeConfig(config)) throw fail();
  let feePolicy, feeQuote;
  try {
    feePolicy = normalizePolicies(config.feePolicies)[config.environment];
    feeQuote = calculateQuote(amount, feePolicy);
  } catch { throw fail(); }
  // A comparison digest, not an authorization token. All prices are recomputed
  // from private configuration; no session/intent/lock is stored for a preview.
  const quoteHash = hash(JSON.stringify([1, identity.uid, identity.tenantId,
    config.version, config.environment, feePolicy, feeQuote]));
  return { feePolicy, feeQuote, quoteHash, environment: config.environment };
}

async function getWompiQuote(data, context) {
  requireVerifiedClient(context);
  const identity = await owner(context);
  if (data?.tenantId && data.tenantId !== identity.tenantId) throw new HttpsError('permission-denied', 'No autorizado');
  const amount = quoteAmount(data);
  const config = (await privateRef(identity.tenantId).get()).data();
  const { feeQuote, quoteHash, environment } = currentQuote(identity, amount, config);
  return { feeQuote, quoteHash, environment };
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
    return { success: true, rechargeId: intent.reference, checkoutUrl: checkoutUrl(intent, config), widgetConfig: widgetConfig(intent, config), environment: intent.environment, feeQuote: intentQuote(intent) };
  }
  const amount = quoteAmount(data);
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
    // Read the shared owner lock before the request that this commit writes.
    // A reader holding the request while waiting for a committing lock creates
    // a read/write lock inversion. Keep the same order across contenders.
    const lock = await transaction.get(lockRef);
    const config = (await transaction.get(privateRef(identity.tenantId))).data();
    const request = await transaction.get(requestRef);
    if (request.exists) {
      const existing = (await transaction.get(intentRef(request.data().reference))).data();
      if (!existing || existing.status !== 'pending' || existing.userId !== identity.uid || existing.tenantId !== identity.tenantId || existing.amount !== amount) throw fail();
      const saved = (await transaction.get(versionRef(existing.tenantId, existing.configVersion))).data();
      if (!completeConfig(saved)) throw fail();
      return { reference: existing.reference, checkoutUrl: checkoutUrl(existing, saved), widgetConfig: widgetConfig(existing, saved), environment: existing.environment, feeQuote: intentQuote(existing) };
    }
    const { feePolicy, feeQuote, quoteHash } = currentQuote(identity, amount, config);
    if (typeof data?.expectedQuoteHash !== 'string' || data.expectedQuoteHash !== quoteHash) {
      throw new HttpsError('failed-precondition', 'El total cambió. Revisalo antes de continuar con Wompi.');
    }
    if (lock.exists && lock.data().rechargeId) {
      const pending = await transaction.get(db.collection('recharges').doc(lock.data().rechargeId));
      if (pending.exists && pending.data().status === 'pending') {
        throw new HttpsError('failed-precondition', 'Ya tenés una recarga pendiente. Revisá el historial.');
      }
    }
    // Also catches legacy pending requests without a lock (same scope as QR).
    if (hasPending) throw new HttpsError('failed-precondition', 'Ya tenés una recarga pendiente. Revisá el historial.');
    const intent = { reference, userId: identity.uid, tenantId: identity.tenantId, amount,
      amountInCents: feeQuote.totalAmount * 100, feeQuote, feePolicy, currency: 'COP', environment: config.environment,
      publicKey: config.publicKey, configVersion: config.version, beneficiaryCollection: identity.collection,
      status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() };
    transaction.create(intentRef(reference), intent);
    transaction.create(db.collection('recharges').doc(reference), { userId: identity.uid,
      resellerId: identity.role === 'reseller' ? identity.uid : identity.profile.createdBy || null,
      tenantId: identity.tenantId, amount, status: 'pending', provider: 'wompi', environment: config.environment,
      feeQuote,
      customerName: identity.profile.name || identity.profile.fullName || '', customerPhone: identity.profile.phone || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.set(requestRef, { reference });
    transaction.set(lockRef, { rechargeId: reference, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { reference, checkoutUrl: checkoutUrl(intent, config), widgetConfig: widgetConfig(intent, config), environment: config.environment, feeQuote };
  });
  return { success: true, rechargeId: result.reference, ...result };
}

async function handleWompiEvent(event, environment) {
  const transaction = event?.data?.transaction;
  if (!Object.hasOwn(API_BASES, environment) || event?.environment !== environment ||
      typeof transaction?.reference !== 'string' || !/^wompi_[a-f0-9]{48}$/.test(transaction.reference) || !validId(transaction.id)) throw fail();
  const intent = (await intentRef(transaction.reference).get()).data();
  if (!intent || intent.environment !== environment) throw fail();
  intentQuote(intent);
  const config = (await versionRef(intent.tenantId, intent.configVersion).get()).data();
  if (!completeConfig(config) || config.environment !== environment || config.publicKey !== intent.publicKey || !verifyEvent(event, config.eventsSecret)) throw fail();
  // Reference/currency/environment are NOT covered by the standard event's
  // signature. Always retrieve via the tenant's private key and a fixed host.
  // Never log axios errors: they contain the Authorization header.
  const verified = await retrievePayment(intent, config, transaction.id);
  for (const value of [transaction, verified]) {
    if (!value || value.id !== transaction.id || value.reference !== intent.reference ||
        value.amount_in_cents !== intent.amountInCents || value.currency !== 'COP' ||
        !['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(value.status)) throw fail();
  }
  if (verified.status !== transaction.status) throw fail();
  await settleVerifiedPayment(intent, verified);
  return { received: true };
}

async function retrievePayment(intent, config, transactionId, requireMerchant = false) {
  const environment = intent.environment;
  if (!validId(transactionId) || !Object.hasOwn(API_BASES, environment) || !completeConfig(config) ||
      config.environment !== environment || config.publicKey !== intent.publicKey || intent.currency !== 'COP') throw fail();
  intentQuote(intent);
  let verified;
  try {
    const response = await axios.get(`${API_BASES[environment]}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${config.privateKey}`, Accept: 'application/json' },
      timeout: 10000, maxRedirects: 0, maxContentLength: 1024 * 1024, proxy: false,
    });
    verified = response.data?.data;
  } catch {
    // Never include the Axios exception/config/response: they can contain keys or PII.
    console.warn(JSON.stringify({ event: 'wompi_verification_unavailable', environment, referenceHash: hash(intent.reference).slice(0, 12) }));
    throw new HttpsError('unavailable', 'No se pudo verificar el pago con Wompi');
  }
  if (!verified || verified.id !== transactionId || verified.reference !== intent.reference ||
      verified.amount_in_cents !== intent.amountInCents || verified.currency !== intent.currency ||
      !['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(verified.status)) throw fail();
  const merchantKey = verified.merchant?.public_key ||
    (typeof verified.merchant?.id === 'string' && verified.merchant.id.startsWith('pub_') ? verified.merchant.id : null);
  // Webhooks additionally prove merchant ownership with the events secret.
  // A browser locator has no such proof, so require the provider merchant key.
  if ((requireMerchant && !merchantKey) || (merchantKey && merchantKey !== intent.publicKey)) throw fail();
  return verified;
}

async function settleVerifiedPayment(intent, verified) {
  const environment = intent.environment;
  if (verified.status === 'PENDING') {
    await db.runTransaction(async transaction => {
      const ref = intentRef(intent.reference);
      const current = (await transaction.get(ref)).data();
      if (current?.status === 'pending') transaction.update(ref, { verifiedTransactionId: verified.id });
    });
    return 'pending';
  }
  const settled = await settleRechargeTransaction({ rechargeRef: db.collection('recharges').doc(intent.reference),
    action: verified.status === 'APPROVED' ? 'approve' : 'reject', processedBy: 'wompi',
    wompiBeneficiaryRef: verified.status === 'APPROVED' && environment === 'prod'
      ? db.collection(intent.beneficiaryCollection).doc(intent.userId) : null,
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
  return settled.newStatus;
}

async function reconcileWompiPayment(data, context) {
  const identity = await owner(context);
  const reference = data?.rechargeId;
  if (!/^wompi_[a-f0-9]{48}$/.test(reference || '') ||
      (data?.tenantId && data.tenantId !== identity.tenantId)) throw fail();
  const ref = intentRef(reference);
  const intent = (await ref.get()).data();
  // Check ownership BEFORE loading credentials, consuming a lease or making HTTP.
  if (!intent || intent.userId !== identity.uid || intent.tenantId !== identity.tenantId) throw fail();
  const result = { reference, status: intent.status, environment: intent.environment, providerChecked: false };
  if (intent.status !== 'pending') return result;
  const transactionId = intent.verifiedTransactionId || data?.transactionId;
  if (!transactionId) return { ...result, requiresTransactionId: true };
  if (!validId(transactionId)) throw new HttpsError('invalid-argument', 'Identificador de transacción inválido');
  // Persistent per-intent lease bounds requests across processes and tabs. The
  // untrusted locator is NEVER persisted before a successful provider match.
  const claimed = await db.runTransaction(async transaction => {
    const current = (await transaction.get(ref)).data();
    if (current.status !== 'pending' || current.reconcileAfterMs > Date.now()) return false;
    transaction.update(ref, { reconcileAfterMs: Date.now() + 15000 });
    return true;
  });
  if (!claimed) return { ...result, status: (await ref.get()).data().status };
  const config = (await versionRef(intent.tenantId, intent.configVersion).get()).data();
  const verified = await retrievePayment(intent, config, transactionId, true);
  const status = await settleVerifiedPayment(intent, verified);
  return { ...result, status, providerChecked: true };
}

async function wompiWebhook(req, res) {
  const environment = Object.hasOwn(API_BASES, req.params.environment) ? req.params.environment : 'invalid';
  console.info(JSON.stringify({ event: 'wompi_webhook_received', environment }));
  try {
    await handleWompiEvent(req.body, req.params.environment);
    console.info(JSON.stringify({ event: 'wompi_webhook_verified', environment }));
    res.status(200).json({ received: true });
  } catch (error) {
    console.warn(JSON.stringify({ event: 'wompi_webhook_rejected', environment, code: error?.code === 'unavailable' ? 'provider_unavailable' : 'invalid_event' }));
    // Same response for unknown references, wrong tenants and invalid signatures.
    res.status(error?.code === 'unavailable' ? 503 : 400).json({ received: false });
  }
}

module.exports = { getWompiConfig, saveWompiConfig, getWompiAvailability, getWompiQuote, createWompiCheckout, reconcileWompiPayment, handleWompiEvent, wompiWebhook };
