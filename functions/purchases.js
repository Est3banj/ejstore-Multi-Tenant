const { functions, admin, db, axios } = require('./config');
const { sendTelegramAdminNotification, sendTelegramResellerNotification } = require('./telegram');
const { sendEmail, buildPurchaseEmail } = require('./email');

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Código de ticket visible para el usuario: TKT-{purchaseId[:6]}-{idx+1}
function buildTicketCode(purchaseId, idx = 0) {
  const shortId = (purchaseId || '').slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${idx + 1}`;
}

const processPurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { serviceId, tenantId } = data;

  if (!serviceId || !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId y tenantId son requeridos');
  }

  const [newAccountsSnap, legacyAccountsSnap] = await Promise.all([
    db.collection('services').doc(serviceId).collection('accounts')
      .where('availableProfiles', '>', 0).limit(20).get(),
    db.collection('services').doc(serviceId).collection('accounts')
      .where('status', '==', 'available').limit(20).get(),
  ]);

  const accountMap = new Map();
  newAccountsSnap.docs.forEach(doc => accountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() }));
  legacyAccountsSnap.docs.forEach(doc => {
    if (!accountMap.has(doc.ref.path) && doc.data().availableProfiles === undefined) {
      accountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() });
    }
  });

  const candidateAccounts = Array.from(accountMap.values());
  if (candidateAccounts.length === 0) {
    throw new functions.https.HttpsError('failed-precondition',
      'Servicio agotado, contacta al administrador'
    );
  }

  const profileCandidates = [];
  for (const acct of candidateAccounts) {
    const acctData = acct.data;
    const availCount = acctData.availableProfiles ?? (acctData.status === 'available' ? 1 : 0);
    if (availCount <= 0) continue;

    if (acctData.availableProfiles !== undefined) {
      const profilesSnap = await acct.ref.collection('profiles')
        .where('status', '==', 'available').limit(5).get();
      profilesSnap.docs.forEach(profDoc => {
        profileCandidates.push({
          accountRef: acct.ref,
          accountData: acctData,
          profileRef: profDoc.ref,
          profileData: profDoc.data(),
        });
      });
    } else {
      profileCandidates.push({
        accountRef: acct.ref,
        accountData: acctData,
        profileRef: null,
        profileData: { name: 'Perfil 1', pin: null, status: 'available' },
      });
    }
  }

  if (profileCandidates.length === 0) {
    throw new functions.https.HttpsError('failed-precondition',
      'Servicio agotado, contacta al administrador'
    );
  }

  try {
    const serviceRef = db.collection('services').doc(serviceId);
    const serviceDocPre = await serviceRef.get();
    const hasCodeExtraction = serviceDocPre.exists && serviceDocPre.data().hasCodeExtraction === true;

    const result = await db.runTransaction(async (transaction) => {
      const customerRef = db.collection('customers').doc(context.auth.uid);
      const customerDoc = await transaction.get(customerRef);

      if (!customerDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Cliente no encontrado');
      }

      const customerData = customerDoc.data();

      if (customerData.tenantId && customerData.tenantId !== tenantId) {
        throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este servicio');
      }

      const serviceDoc = await transaction.get(serviceRef);

      if (!serviceDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
      }

      const serviceData = serviceDoc.data();
      const price = serviceData.promotionalPrice || serviceData.price;
      const currentBalance = customerData.balance || 0;

      if (currentBalance < price) {
        throw new functions.https.HttpsError('failed-precondition',
          `Saldo insuficiente. Necesitas $${price.toLocaleString()}, tenés $${currentBalance.toLocaleString()}`
        );
      }

      let selected = null;
      for (const candidate of profileCandidates) {
        if (candidate.profileRef) {
          const [acctDoc, profDoc] = await Promise.all([
            transaction.get(candidate.accountRef),
            transaction.get(candidate.profileRef),
          ]);
          if (!acctDoc.exists || !profDoc.exists) continue;
          const acctData = acctDoc.data();
          const profData = profDoc.data();
          if ((acctData.availableProfiles || 0) > 0 && profData.status === 'available') {
            selected = {
              accountRef: candidate.accountRef,
              profileRef: candidate.profileRef,
              profileName: profData.name,
              profilePin: profData.pin || null,
              credential: acctData.credential,
            };
            break;
          }
        } else {
          const acctDoc = await transaction.get(candidate.accountRef);
          if (!acctDoc.exists) continue;
          const acctData = acctDoc.data();
          if (acctData.status === 'available' && (acctData.availableProfiles === undefined || acctData.availableProfiles > 0)) {
            selected = {
              accountRef: candidate.accountRef,
              profileRef: null,
              profileName: 'Perfil 1',
              profilePin: null,
              credential: acctData.credential,
            };
            break;
          }
        }
      }

      if (!selected) {
        throw new functions.https.HttpsError('failed-precondition',
          'Servicio agotado, contacta al administrador'
        );
      }

      const now = new Date().toISOString();
      const purchaseRef = db.collection('purchases').doc();

      if (selected.profileRef) {
        transaction.update(selected.profileRef, {
          status: 'sold',
          soldTo: context.auth.uid,
          purchaseId: purchaseRef.id,
          assignedAt: now,
        });
        transaction.update(selected.accountRef, {
          availableProfiles: admin.firestore.FieldValue.increment(-1),
        });
      } else {
        transaction.update(selected.accountRef, {
          status: 'sold',
          soldTo: context.auth.uid,
          updatedAt: now,
          purchaseId: purchaseRef.id,
        });
      }

      transaction.update(customerRef, {
        balance: currentBalance - price,
      });

      transaction.set(purchaseRef, {
        customerId: context.auth.uid,
        customerEmail: context.auth.token.email || '',
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
        credential: selected.credential,
        serviceName: serviceData.name,
        profileName: selected.profileName,
        profilePin: selected.profilePin,
        price,
        newBalance: currentBalance - price,
      };
    });

    let linkToken;
    if (hasCodeExtraction) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      linkToken = generateToken();

      await db.collection('public_links').doc(linkToken).set({
        token: linkToken,
        resellerId: null,
        accountId: result.accountId || '',
        serviceId,
        serviceName: result.serviceName,
        purchaseId: result.purchaseId,
        accountIndex: 0,
        credential: result.credential || {},
        createdAt: now,
        expiresAt,
        status: 'active',
      });

      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens: [linkToken] });
    }

    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId: context.auth.uid,
      amount: -result.price,
      type: 'purchase',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    const custEmail = context.auth.token.email;
    if (custEmail) {
      const freshSvcDoc = await serviceRef.get();
      const freshSvcData = freshSvcDoc.data() || {};
      const ticketCode = buildTicketCode(result.purchaseId, 0);
      const purchaseEmailHtml = buildPurchaseEmail({
        serviceName: result.serviceName,
        credential: result.credential,
        profileName: result.profileName,
        profilePin: result.profilePin,
        ticketId: ticketCode,
        rules: freshSvcData.rules || '',
      });
      sendEmail(tenantId, custEmail, 'Compra Exitosa - ' + result.serviceName, purchaseEmailHtml);
    }

    const customerEmail = context.auth.token.email || 'Desconocido';
    const ticketDisplay = buildTicketCode(result.purchaseId, 0);
    const purchaseMsg = `🛒 <b>Nueva Compra</b>\n\n👤 <b>Cliente:</b> ${customerEmail}\n🆔 <b>ID:</b> ${context.auth.uid}\n📦 <b>Servicio:</b> ${result.serviceName}\n📧 <b>Email:</b> ${result.credential?.email || '—'}\n👤 <b>Perfil:</b> ${result.profileName || '—'}\n💵 <b>Precio:</b> $${result.price.toLocaleString('es-CO')} COP\n💳 <b>Saldo restante:</b> $${result.newBalance.toLocaleString('es-CO')} COP\n🆔 <b>Ticket:</b> ${ticketDisplay}`;
    sendTelegramAdminNotification(tenantId, purchaseMsg);

    return {
      success: true,
      purchaseId: result.purchaseId,
      account: {
        credential: result.credential,
        serviceName: result.serviceName,
        profileName: result.profileName,
        profilePin: result.profilePin,
      },
      newBalance: result.newBalance,
      hasCodeExtraction,
      linkToken: linkToken || null,
      message: hasCodeExtraction
        ? `✅ Compra exitosa. Accedé al link público para compartir o extraer el código.`
        : `✅ Compra exitosa. ¡Disfrutá ${result.serviceName}!`
    };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('Error in processPurchase:', error);
    throw new functions.https.HttpsError('internal', 'Error al procesar la compra. Intentalo de nuevo.');
  }
});

const processBulkPurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'reseller') {
    throw new functions.https.HttpsError('permission-denied', 'Solo disponible para subdistribuidores');
  }

  const { serviceId, tenantId, quantity, customerName } = data;

  if (!serviceId || !tenantId || !quantity) {
    throw new functions.https.HttpsError('invalid-argument', 'serviceId, tenantId y quantity son requeridos');
  }

  const qty = parseInt(quantity);
  if (isNaN(qty) || qty < 1 || qty > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'La cantidad debe ser entre 1 y 50');
  }

  try {
    const resellerRef = db.collection('resellers').doc(context.auth.uid);
    const resellerDoc = await resellerRef.get();

    if (!resellerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Subdistribuidor no encontrado');
    }

    const resellerData = resellerDoc.data();
    if (!resellerData.isActive) {
      throw new functions.https.HttpsError('permission-denied', 'Subdistribuidor inactivo');
    }

    const serviceDoc = await db.collection('services').doc(serviceId).get();
    if (!serviceDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Servicio no encontrado');
    }

    const serviceData = serviceDoc.data();
    const hasCodeExtraction = serviceData.hasCodeExtraction === true;

    const basePrice = serviceData.promotionalPrice || serviceData.price;
    const wholesalePrice = serviceData.wholesalePrice
      || Math.round(basePrice * (1 - (resellerData.commissionPercent || 0) / 100));

    const totalPrice = wholesalePrice * qty;
    const currentBalance = resellerData.balance || 0;

    if (currentBalance < totalPrice) {
      throw new functions.https.HttpsError('failed-precondition',
        `Saldo insuficiente. Necesitas $${totalPrice.toLocaleString()}, tenés $${currentBalance.toLocaleString()}`
      );
    }

    const limitMultiplier = Math.min(qty * 2, 50);
    const [newBulkSnap, legacyBulkSnap] = await Promise.all([
      db.collection('services').doc(serviceId).collection('accounts')
        .where('availableProfiles', '>', 0).limit(limitMultiplier).get(),
      db.collection('services').doc(serviceId).collection('accounts')
        .where('status', '==', 'available').limit(limitMultiplier).get(),
    ]);

    const bulkAccountMap = new Map();
    newBulkSnap.docs.forEach(doc => bulkAccountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() }));
    legacyBulkSnap.docs.forEach(doc => {
      if (!bulkAccountMap.has(doc.ref.path) && doc.data().availableProfiles === undefined) {
        bulkAccountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() });
      }
    });

    const bulkAccounts = Array.from(bulkAccountMap.values());

    const bulkCandidates = [];
    for (const acct of bulkAccounts) {
      if (bulkCandidates.length >= qty) break;
      const acctData = acct.data;
      const availCount = acctData.availableProfiles ?? (acctData.status === 'available' ? 1 : 0);
      if (availCount <= 0) continue;

      if (acctData.availableProfiles !== undefined) {
        const need = qty - bulkCandidates.length;
        const profilesSnap = await acct.ref.collection('profiles')
          .where('status', '==', 'available').limit(need).get();
        profilesSnap.docs.forEach(profDoc => {
          if (bulkCandidates.length < qty) {
            bulkCandidates.push({
              accountRef: acct.ref,
              accountData: acctData,
              profileRef: profDoc.ref,
              profileData: profDoc.data(),
            });
          }
        });
      } else {
        bulkCandidates.push({
          accountRef: acct.ref,
          accountData: acctData,
          profileRef: null,
          profileData: { name: 'Perfil 1', pin: null, status: 'available' },
        });
      }
    }

    if (bulkCandidates.length < qty) {
      throw new functions.https.HttpsError('failed-precondition',
        `Stock insuficiente. Hay ${bulkCandidates.length} perfil(es) disponible(s), pediste ${qty}`
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const freshResellerDoc = await transaction.get(resellerRef);
      const freshBalance = freshResellerDoc.data().balance || 0;
      if (freshBalance < totalPrice) {
        throw new functions.https.HttpsError('failed-precondition', 'Saldo insuficiente');
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
              soldTo: context.auth.uid,
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
              soldTo: context.auth.uid,
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
            profileName: 'Perfil 1',
            profilePin: null,
            credential: acctData.credential,
            accountRef: candidate.accountRef,
          });
        }
      }

      if (soldProfiles.length < qty) {
        throw new functions.https.HttpsError('failed-precondition',
          `Stock insuficiente. Solo hay ${soldProfiles.length} perfil(es) disponible(s), pediste ${qty}`
        );
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
        resellerId: context.auth.uid,
        customerId: context.auth.uid,
        customerEmail: claims.email || '',
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
      };
    });

    const linkTokens = [];
    if (hasCodeExtraction) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const uniqueAccounts = [...new Map(
        result.profiles.map(p => [p.credential.email || JSON.stringify(p.credential), p])
      ).values()];

      for (let i = 0; i < uniqueAccounts.length; i++) {
        const token = generateToken();
        const profile = uniqueAccounts[i];

        await db.collection('public_links').doc(token).set({
          token,
          resellerId: context.auth.uid,
          accountId: profile.profileId || '',
          serviceId,
          serviceName: serviceData.name,
          purchaseId: result.purchaseId,
          accountIndex: i,
          credential: profile.credential,
          profileName: profile.profileName || null,
          profilePin: profile.profilePin || null,
          createdAt: now,
          expiresAt,
          status: 'active',
        });
        linkTokens.push(token);
      }

      await db.collection('purchases').doc(result.purchaseId).update({ linkTokens });
    }

    await db.collection('balanceTransactions').doc(result.purchaseId).set({
      customerId: context.auth.uid,
      amount: -totalPrice,
      type: 'bulk_purchase',
      description: 'Compra al por mayor',
      serviceId,
      serviceName: result.serviceName,
      purchaseId: result.purchaseId,
      createdAt: new Date().toISOString(),
    });

    const resellerName = resellerData.name || resellerData.email || context.auth.token.email || 'Distribuidor';
    const bulkTicketCode = buildTicketCode(result.purchaseId, 0);
    const bulkMsg = `🏪 <b>Compra al Por Mayor</b>\n\n👤 <b>Distribuidor:</b> ${resellerName}\n📧 <b>Email:</b> ${resellerData.email || context.auth.token.email || '—'}\n🆔 <b>ID:</b> ${context.auth.uid}\n📦 <b>Servicio:</b> ${result.serviceName}\n🔢 <b>Cantidad:</b> ${result.quantity}\n💵 <b>Precio unitario:</b> $${serviceData.wholesalePrice?.toLocaleString('es-CO') || '—'} COP\n💰 <b>Total:</b> $${totalPrice.toLocaleString('es-CO')} COP\n💳 <b>Saldo restante:</b> $${result.newBalance.toLocaleString('es-CO')} COP\n🆔 <b>Ticket:</b> ${bulkTicketCode}`;
    sendTelegramAdminNotification(tenantId, bulkMsg);
    sendTelegramResellerNotification(context.auth.uid, bulkMsg);

    return {
      success: true,
      purchaseId: result.purchaseId,
      credentials: result.credentials,
      profiles: result.profiles,
      serviceName: result.serviceName,
      quantity: result.quantity,
      newBalance: result.newBalance,
      hasCodeExtraction,
      linkTokens: linkTokens.length > 0 ? linkTokens : undefined,
      message: hasCodeExtraction
        ? `✅ Compra exitosa. Recibiste ${result.quantity} link(s) de acceso para compartir con tus clientes.`
        : `✅ Compra exitosa. Recibiste ${result.quantity} cuenta(s) de ${result.serviceName}.`,
    };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in processBulkPurchase:', error);
    throw new functions.https.HttpsError('internal', 'Error al procesar la compra');
  }
});

module.exports = { generateToken, processPurchase, processBulkPurchase };
