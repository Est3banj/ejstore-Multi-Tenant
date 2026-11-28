const { randomBytes } = require('node:crypto');
const { HttpsError } = require('./httpsError');
const { validId } = require('./stockAvailability');

const denied = () => new HttpsError('not-found', 'Link no disponible');
const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(token);

function timestampMillis(value) {
  try {
    const millis = value instanceof Date ? value.getTime()
      : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value)
        : typeof value?.toMillis === 'function' ? value.toMillis() : NaN;
    return Number.isFinite(millis) ? millis : NaN;
  } catch { return NaN; }
}

// Resolve only immutable purchase references, never client-supplied credentials
// or an email search across inventory. Historical ambiguous bulk rows fail closed.
async function resolvePurchaseScope(db, purchaseId, accountIndex = 0) {
  if (!validId(purchaseId) || !Number.isSafeInteger(accountIndex) || accountIndex < 0) throw denied();
  const purchaseDoc = await db.collection('purchases').doc(purchaseId).get();
  if (!purchaseDoc.exists) throw denied();
  const purchase = purchaseDoc.data();
  if (purchase.status !== 'active' || !validId(purchase.tenantId) || !validId(purchase.serviceId)
      || !validId(purchase.customerId)) throw denied();
  const bulk = Array.isArray(purchase.profiles) && purchase.profiles.length > 0;
  const row = bulk ? purchase.profiles[accountIndex] : accountIndex === 0 ? purchase : null;
  if (!row || !validId(row.accountId) || (row.profileId != null && !validId(row.profileId))) throw denied();
  const assignmentId = bulk ? row.assignmentId : purchaseId;
  if (!validId(assignmentId)) throw denied();
  const tenant = await db.collection('tenants').doc(purchase.tenantId).get();
  const serviceRef = db.collection('services').doc(purchase.serviceId);
  const service = await serviceRef.get();
  // Catalog visibility does not revoke an already sold, active assignment.
  if (!tenant.exists || tenant.data().isActive === false || !service.exists
      || service.data().tenantId !== purchase.tenantId) throw denied();
  const accountRef = serviceRef.collection('accounts').doc(row.accountId);
  const account = await accountRef.get();
  if (!account.exists || (account.data().tenantId && account.data().tenantId !== purchase.tenantId)) throw denied();
  const profile = row.profileId ? await accountRef.collection('profiles').doc(row.profileId).get() : account;
  if (!profile.exists) throw denied();
  const assignment = profile.data();
  if (assignment.status !== 'sold' || assignment.soldTo !== purchase.customerId
      || assignment.purchaseId !== assignmentId) throw denied();
  return { purchase, tenantId: purchase.tenantId, serviceId: purchase.serviceId,
    accountId: row.accountId, profileId: row.profileId || null, assignmentId,
    serviceName: service.data().name || 'Servicio' };
}

function linkRecord(scope, purchaseId, accountIndex, now = new Date()) {
  return { tenantId: scope.tenantId, serviceId: scope.serviceId, accountId: scope.accountId,
    profileId: scope.profileId, assignmentId: scope.assignmentId, purchaseId, accountIndex,
    resellerId: scope.purchase.resellerId || null, serviceName: scope.serviceName,
    status: 'active', createdAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) };
}

function createPublicLinkHandlers(db, clock = Date.now) {
  return {
    async resolvePublicLink(data) {
      if (!data || !validToken(data.token) || Object.keys(data).some(key => key !== 'token')) throw denied();
      try {
        const doc = await db.collection('public_links').doc(data.token).get();
        if (!doc.exists) throw denied();
        const link = doc.data();
        const expires = timestampMillis(link.expiresAt);
        if (link.status !== 'active' || !Number.isFinite(expires) || expires <= clock()) throw denied();
        const scope = await resolvePurchaseScope(db, link.purchaseId, link.accountIndex);
        // Legacy links may omit these redundant fields only when their existing
        // purchase/account references prove the exact same current assignment.
        if (link.serviceId !== scope.serviceId || link.accountId !== scope.accountId
            || (link.tenantId != null && link.tenantId !== scope.tenantId)
            || (link.profileId || null) !== scope.profileId
            || (link.assignmentId != null && link.assignmentId !== scope.assignmentId)
            || (link.resellerId != null && link.resellerId !== scope.purchase.resellerId)) throw denied();
        return { serviceName: scope.serviceName, status: 'active',
          createdAt: Number.isFinite(timestampMillis(link.createdAt))
            ? new Date(timestampMillis(link.createdAt)).toISOString() : null,
          expiresAt: new Date(expires).toISOString() };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('unavailable', 'Link temporalmente no disponible');
      }
    },
    async createPublicLink(data, context) {
      if (!context?.auth?.uid) throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
      if (!data || !validId(data.purchaseId) || !Number.isSafeInteger(data.accountIndex)
          || data.accountIndex < 0 || Object.keys(data).some(key => !['purchaseId', 'accountIndex'].includes(key))) {
        throw new HttpsError('invalid-argument', 'Compra e índice válidos requeridos');
      }
      try {
        const scope = await resolvePurchaseScope(db, data.purchaseId, data.accountIndex);
        if (scope.purchase.customerId !== context.auth.uid) throw denied();
        const token = randomBytes(32).toString('hex');
        const purchaseRef = db.collection('purchases').doc(data.purchaseId);
        await db.runTransaction(async transaction => {
          const current = await transaction.get(purchaseRef);
          if (!current.exists || current.data().customerId !== context.auth.uid || current.data().status !== 'active') throw denied();
          const linkTokens = [...(current.data().linkTokens || [])];
          while (linkTokens.length <= data.accountIndex) linkTokens.push(null);
          linkTokens[data.accountIndex] = token;
          transaction.create(db.collection('public_links').doc(token), linkRecord(scope, data.purchaseId, data.accountIndex, new Date(clock())));
          transaction.update(purchaseRef, { linkTokens });
        });
        return { token };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('unavailable', 'No se pudo crear el link');
      }
    },
  };
}

module.exports = { createPublicLinkHandlers, resolvePurchaseScope, linkRecord, timestampMillis };
