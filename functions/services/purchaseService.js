const { admin, db } = require('../config');
const { 
  findAvailableAccounts, 
  findAvailableProfiles, 
  selectProfileInTransaction,
  createPublicLinks,
  buildTicketCode 
} = require('./inventoryService');
const { sendPurchaseNotifications } = require('./notificationService');
const { 
  recordPurchaseLatency, 
  recordPurchaseSuccess, 
  recordPurchaseError 
} = require('./monitoring');
const { withIdempotency, validateIdempotencyKey } = require('./idempotencyService');

async function processPurchase({ serviceId, tenantId, customerId, customerEmail, hasCodeExtraction, idempotencyKey }) {
  const startTime = Date.now();

  if (idempotencyKey) {
    const validation = validateIdempotencyKey(idempotencyKey);
    if (!validation.valid) {
      throw new Error(`IDEMPOTENCY_INVALID: ${validation.error}`);
    }
  }

  const operation = async () => {
    // Guard diamond (spec:diamond-services#distributor-exclusion, design:DD8):
    // los diamantes sólo se compran vía createDiamondOrder — ANTES de tocar
    // stock/balance. Legacy sin serviceType ⇒ 'subscription' (default).
    const serviceRef = db.collection('services').doc(serviceId);
    const serviceDocPre = await serviceRef.get();
    const serviceData = serviceDocPre.data();
    if (!serviceData) {
      throw new Error('SERVICE_NOT_FOUND');
    }
    // P0-3: el recurso comprado debe pertenecer al tenant declarado (paridad
    // con createDiamondOrder DD8 y con getStockAvailability).
    if (serviceData.tenantId !== tenantId) {
      throw new Error('PERMISSION_DENIED');
    }
    if ((serviceData.serviceType || 'subscription') === 'diamond') {
      throw new Error('DIAMOND_NOT_PURCHASABLE');
    }
    const serviceHasCodeExtraction = serviceData.hasCodeExtraction === true;
    const price = serviceData.promotionalPrice || serviceData.price;

    const candidateAccounts = await findAvailableAccounts(serviceId);
    if (candidateAccounts.length === 0) {
      throw new Error('SERVICE_EXHAUSTED');
    }

    const profileCandidates = await findAvailableProfiles(candidateAccounts);
    if (profileCandidates.length === 0) {
      throw new Error('SERVICE_EXHAUSTED');
    }

    const result = await db.runTransaction(async (transaction) => {
      const customerRef = db.collection('customers').doc(customerId);
      const customerDoc = await transaction.get(customerRef);

      if (!customerDoc.exists) {
        throw new Error('CUSTOMER_NOT_FOUND');
      }

      const customerData = customerDoc.data();
      if (customerData.tenantId && customerData.tenantId !== tenantId) {
        throw new Error('PERMISSION_DENIED');
      }

      const serviceDoc = await transaction.get(serviceRef);
      if (!serviceDoc.exists) {
        throw new Error('SERVICE_NOT_FOUND');
      }
      // P0-3: check autoritativo DENTRO de la transacción que debita (lectura
      // fresca; el pre-check de arriba es sólo early-exit).
      if (serviceDoc.data().tenantId !== tenantId) {
        throw new Error('PERMISSION_DENIED');
      }

      const rawBalance = customerData.balance ?? 0;
      if (typeof rawBalance !== 'number' || !Number.isFinite(rawBalance) || rawBalance < 0) {
        throw new Error('BALANCE_INVALID');
      }
      const currentBalance = rawBalance;
      if (currentBalance < price) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const selected = await selectProfileInTransaction(transaction, profileCandidates);
      if (!selected) {
        throw new Error('SERVICE_EXHAUSTED');
      }

      const now = new Date().toISOString();
      const purchaseRef = db.collection('purchases').doc();

      if (selected.profileRef) {
        transaction.update(selected.profileRef, {
          status: 'sold',
          soldTo: customerId,
          purchaseId: purchaseRef.id,
          assignedAt: now,
        });
        transaction.update(selected.accountRef, {
          availableProfiles: admin.firestore.FieldValue.increment(-1),
        });
      } else {
        transaction.update(selected.accountRef, {
          status: 'sold',
          soldTo: customerId,
          updatedAt: now,
          purchaseId: purchaseRef.id,
        });
      }

      transaction.update(customerRef, {
        balance: currentBalance - price,
      });

      transaction.set(purchaseRef, {
        customerId,
        customerEmail: customerEmail || '',
        serviceId,
        serviceName: serviceData.name,
        accountId: selected.accountRef.id,
        profileId: selected.profileRef ? selected.profileRef.id : null,
        profileName: selected.profileName,
        profilePin: selected.profilePin,
        price,
        status: 'active',
        tenantId,
        createdAt: now,
      });

      return {
        purchaseId: purchaseRef.id,
        accountId: selected.accountRef.id,
        profileId: selected.profileRef ? selected.profileRef.id : null,
        credential: selected.credential,
        serviceName: serviceData.name,
        profileName: selected.profileName,
        profilePin: selected.profilePin,
        price,
        newBalance: currentBalance - price,
        hasCodeExtraction: serviceHasCodeExtraction,
      };
    });

    const linkTokens = await createPublicLinks(
      serviceId,
      result.purchaseId,
      [{
        credential: result.credential,
        profileId: result.profileId,
        profileName: result.profileName,
        profilePin: result.profilePin,
      }],
      result.serviceName,
      null,
      result.hasCodeExtraction,
      { tenantId, customerId, accountId: result.accountId, profileId: result.profileId }
    );

    if (linkTokens.length > 0) {
      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens });
    }

    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId,
      amount: -result.price,
      type: 'purchase',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    const ticketCode = buildTicketCode(result.purchaseId, 0);
    await sendPurchaseNotifications({
      tenantId,
      customerEmail: result.customerEmail,
      customerName: result.customerEmail || 'Cliente',
      serviceName: result.serviceName,
      credential: result.credential,
      profileName: result.profileName,
      profilePin: result.profilePin,
      price: result.price,
      newBalance: result.newBalance,
      ticketCode,
      rules: serviceData.rules || '',
      hasCodeExtraction: result.hasCodeExtraction,
      purchaseId: result.purchaseId,
    });

    await recordPurchaseLatency(tenantId, 'purchase', 'success', Date.now() - startTime);
    await recordPurchaseSuccess(tenantId, 'purchase');

    return {
      ...result,
      ticketCode,
      linkTokens: linkTokens.length > 0 ? linkTokens : null,
    };
  };

  if (idempotencyKey) {
    return await withIdempotency(idempotencyKey, tenantId, operation);
  }

  return await operation();
}

async function processBulkPurchase({ serviceId, tenantId, resellerId, resellerEmail, resellerName, quantity, customerName, resellerCommissionPercent, idempotencyKey }) {
  const startTime = Date.now();

  if (idempotencyKey) {
    const validation = validateIdempotencyKey(idempotencyKey);
    if (!validation.valid) {
      throw new Error(`IDEMPOTENCY_INVALID: ${validation.error}`);
    }
  }

  const operation = async () => {
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 50) {
      throw new Error('INVALID_QUANTITY');
    }

    const serviceDoc = await db.collection('services').doc(serviceId).get();
    if (!serviceDoc.exists) {
      throw new Error('SERVICE_NOT_FOUND');
    }

    const serviceData = serviceDoc.data();
    // P0-3: servicio comprado debe ser del tenant declarado (paridad con
    // processPurchase y con createDiamondOrder DD8).
    if (serviceData.tenantId !== tenantId) {
      throw new Error('PERMISSION_DENIED');
    }
    // Guard diamond (spec:diamond-services#distributor-exclusion, design:DD1/DD8):
    // el canal mayorista NUNCA vende diamantes — antes de tocar stock/balance.
    if ((serviceData.serviceType || 'subscription') === 'diamond') {
      throw new Error('DIAMOND_NOT_PURCHASABLE');
    }
    const hasCodeExtraction = serviceData.hasCodeExtraction === true;

    const basePrice = serviceData.promotionalPrice || serviceData.price;
    const wholesalePrice = serviceData.wholesalePrice
      || Math.round(basePrice * (1 - (resellerCommissionPercent || 0) / 100));
    const totalPrice = wholesalePrice * qty;

    const resellerRef = db.collection('resellers').doc(resellerId);
    const resellerDoc = await resellerRef.get();
    if (!resellerDoc.exists) {
      throw new Error('RESELLER_NOT_FOUND');
    }
    const resellerData = resellerDoc.data();
    // P0-3: en bulk el único ancla de tenant del actor es el doc del reseller
    // (no hay customer en el flujo) — sin este gate, un reseller del tenant A
    // compraría stock del tenant B debitando su propio saldo.
    if (resellerData.tenantId !== tenantId) {
      throw new Error('PERMISSION_DENIED');
    }
    if (!resellerData.isActive) {
      throw new Error('RESELLER_INACTIVE');
    }
    const rawResellerBalance = resellerData.balance ?? 0;
    if (typeof rawResellerBalance !== 'number' || !Number.isFinite(rawResellerBalance) || rawResellerBalance < 0) {
      throw new Error('BALANCE_INVALID');
    }
    if (rawResellerBalance < totalPrice) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const limitMultiplier = Math.min(qty * 2, 50);
    const bulkAccounts = await findAvailableAccounts(serviceId, limitMultiplier);
    const bulkCandidates = await findAvailableProfiles(bulkAccounts);

    if (bulkCandidates.length < qty) {
      throw new Error(`STOCK_INSUFFICIENT: ${bulkCandidates.length}/${qty}`);
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshResellerDoc = await transaction.get(resellerRef);
      const rawBalance = freshResellerDoc.data().balance ?? 0;
      if (typeof rawBalance !== 'number' || !Number.isFinite(rawBalance) || rawBalance < 0) {
        throw new Error('BALANCE_INVALID');
      }
      const freshBalance = rawBalance;
      if (freshBalance < totalPrice) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const now = admin.firestore.Timestamp.now();
      const purchaseRef = db.collection('purchases').doc();
      const soldProfiles = [];
      const soldAccountRefs = new Map();
      const writeOps = [];

      for (let i = 0; i < bulkCandidates.length && soldProfiles.length < qty; i++) {
        const candidate = bulkCandidates[i];

        if (candidate.profileRef) {
          const [acctDoc, profDoc] = await Promise.all([
            transaction.get(candidate.accountRef),
            transaction.get(candidate.profileRef),
          ]);
          if (!acctDoc.exists || !profDoc.exists) continue;
          const acctData = acctDoc.data();
          const profData = profDoc.data();
          if ((acctData.availableProfiles || 0) <= 0 || profData.status !== 'available') continue;

          writeOps.push({
            ref: candidate.profileRef,
            type: 'profile',
            data: {
              status: 'sold',
              soldTo: resellerId,
              purchaseId: `${purchaseRef.id}_${i}`,
              assignedAt: now,
            },
          });

          const key = candidate.accountRef.path;
          if (soldAccountRefs.has(key)) {
            soldAccountRefs.get(key).count++;
          } else {
            soldAccountRefs.set(key, { ref: candidate.accountRef, count: 1 });
          }

          soldProfiles.push({
            profileRef: candidate.profileRef,
            assignmentId: `${purchaseRef.id}_${i}`,
            profileName: profData.name,
            profilePin: profData.pin || null,
            credential: acctData.credential,
            accountRef: candidate.accountRef,
          });
        } else {
          const acctDoc = await transaction.get(candidate.accountRef);
          if (!acctDoc.exists) continue;
          const acctData = acctDoc.data();
          if (acctData.status !== 'available') continue;

          writeOps.push({
            ref: candidate.accountRef,
            type: 'legacy_account',
            data: {
              status: 'sold',
              soldTo: resellerId,
              purchaseId: `${purchaseRef.id}_${i}`,
              updatedAt: now,
            },
          });

          const key = candidate.accountRef.path;
          if (soldAccountRefs.has(key)) {
            soldAccountRefs.get(key).count++;
          } else {
            soldAccountRefs.set(key, { ref: candidate.accountRef, count: 1 });
          }

          soldProfiles.push({
            profileRef: null,
            assignmentId: `${purchaseRef.id}_${i}`,
            profileName: 'Perfil 1',
            profilePin: null,
            credential: acctData.credential,
            accountRef: candidate.accountRef,
          });
        }
      }

      if (soldProfiles.length < qty) {
        throw new Error(`STOCK_INSUFFICIENT: ${soldProfiles.length}/${qty}`);
      }

      transaction.update(resellerRef, {
        balance: freshBalance - totalPrice,
        updatedAt: now,
      });

      for (const op of writeOps) {
        transaction.update(op.ref, op.data);
      }

      for (const [, { ref, count }] of soldAccountRefs) {
        transaction.update(ref, {
          availableProfiles: admin.firestore.FieldValue.increment(-count),
        });
      }

      const profilesData = soldProfiles.map(p => ({
        accountId: p.accountRef.id,
        assignmentId: p.assignmentId,
        profileId: p.profileRef ? p.profileRef.id : null,
        profileName: p.profileName,
        profilePin: p.profilePin,
        credential: p.credential,
      }));

      const uniqueCredentials = [...new Map(
        soldProfiles.map(p => [p.credential.email || JSON.stringify(p.credential), p.credential])
      ).values()];

      const accountIds = [...soldAccountRefs.keys()].map(path => {
        const parts = path.split('/');
        return parts[parts.length - 1];
      });

      transaction.set(purchaseRef, {
        resellerId,
        customerId: resellerId,
        customerEmail: resellerEmail || '',
        serviceId,
        serviceName: serviceData.name,
        accountIds,
        credentials: uniqueCredentials,
        profiles: profilesData,
        price: totalPrice,
        quantity: qty,
        unitPrice: wholesalePrice,
        status: 'active',
        type: 'bulk',
        tenantId,
        durationDays: serviceData.durationDays || 30,
        customerName: customerName || null,
        createdAt: now,
      });

      return {
        purchaseId: purchaseRef.id,
        credentials: uniqueCredentials,
        profiles: profilesData,
        serviceName: serviceData.name,
        quantity: qty,
        newBalance: freshBalance - totalPrice,
        wholesalePrice,
        totalPrice,
      };
    });

    const linkTokens = await createPublicLinks(
      serviceId,
      result.purchaseId,
      result.profiles,
      result.serviceName,
      resellerId,
      hasCodeExtraction,
      { tenantId, customerId: resellerId, resellerId, profiles: result.profiles }
    );

    if (linkTokens.length > 0) {
      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens });
    }

    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId: resellerId,
      amount: -result.totalPrice,
      type: 'bulk_purchase',
      description: 'Compra al por mayor',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    const ticketCode = buildTicketCode(result.purchaseId, 0);
    await sendPurchaseNotifications({
      tenantId,
      customerEmail: resellerEmail,
      customerName: resellerName,
      resellerId,
      resellerName,
      serviceName: result.serviceName,
      credential: result.credentials[0],
      profileName: result.profiles[0]?.profileName,
      profilePin: result.profiles[0]?.profilePin,
      price: result.totalPrice,
      newBalance: result.newBalance,
      ticketCode,
      rules: serviceData.rules || '',
      hasCodeExtraction,
      purchaseId: result.purchaseId,
      quantity: result.quantity,
      unitPrice: result.wholesalePrice,
    });

    await recordPurchaseLatency(tenantId, 'bulk_purchase', 'success', Date.now() - startTime);
    await recordPurchaseSuccess(tenantId, 'bulk_purchase');

    return {
      ...result,
      ticketCode,
      linkTokens: linkTokens.length > 0 ? linkTokens : undefined,
    };
  };

  if (idempotencyKey) {
    return await withIdempotency(idempotencyKey, tenantId, operation);
  }

  return await operation();
}

module.exports = {
  processPurchase,
  processBulkPurchase,
};
