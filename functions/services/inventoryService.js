const { db } = require('../config');
const { randomBytes } = require('node:crypto');
const { linkRecord } = require('./publicLinks');

function generateToken() {
  return randomBytes(32).toString('hex');
}

function buildTicketCode(purchaseId, idx = 0) {
  const shortId = (purchaseId || '').slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${idx + 1}`;
}

async function findAvailableAccounts(serviceId, limit = 20) {
  const [newAccountsSnap, legacyAccountsSnap] = await Promise.all([
    db.collection('services').doc(serviceId).collection('accounts')
      .where('availableProfiles', '>', 0).limit(limit).get(),
    db.collection('services').doc(serviceId).collection('accounts')
      .where('status', '==', 'available').limit(limit).get(),
  ]);

  const accountMap = new Map();
  newAccountsSnap.docs.forEach(doc => accountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() }));
  legacyAccountsSnap.docs.forEach(doc => {
    if (!accountMap.has(doc.ref.path) && doc.data().availableProfiles === undefined) {
      accountMap.set(doc.ref.path, { ref: doc.ref, id: doc.id, data: doc.data() });
    }
  });

  return Array.from(accountMap.values());
}

async function findAvailableProfiles(accounts) {
  const profileCandidates = [];

  const accountsWithProfiles = accounts.filter(acct => {
    const acctData = acct.data;
    const availCount = acctData.availableProfiles ?? (acctData.status === 'available' ? 1 : 0);
    return availCount > 0 && acctData.availableProfiles !== undefined;
  });

  const legacyAccounts = accounts.filter(acct => {
    const acctData = acct.data;
    const availCount = acctData.availableProfiles ?? (acctData.status === 'available' ? 1 : 0);
    return availCount > 0 && acctData.availableProfiles === undefined;
  });

  if (accountsWithProfiles.length > 0) {
    const profileQueries = accountsWithProfiles.map(acct =>
      acct.ref.collection('profiles').where('status', '==', 'available').limit(5).get()
    );
    const profilesSnaps = await Promise.all(profileQueries);

    profilesSnaps.forEach((profilesSnap, idx) => {
      const acct = accountsWithProfiles[idx];
      profilesSnap.docs.forEach(profDoc => {
        profileCandidates.push({
          accountRef: acct.ref,
          accountData: acct.data,
          profileRef: profDoc.ref,
          profileData: profDoc.data(),
        });
      });
    });
  }

  legacyAccounts.forEach(acct => {
    profileCandidates.push({
      accountRef: acct.ref,
      accountData: acct.data,
      profileRef: null,
      profileData: { name: 'Perfil 1', pin: null, status: 'available' },
    });
  });

  return profileCandidates;
}

async function selectProfileInTransaction(transaction, profileCandidates) {
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
        return {
          accountRef: candidate.accountRef,
          profileRef: candidate.profileRef,
          profileName: profData.name,
          profilePin: profData.pin || null,
          credential: acctData.credential,
        };
      }
    } else {
      const acctDoc = await transaction.get(candidate.accountRef);
      if (!acctDoc.exists) continue;
      const acctData = acctDoc.data();
      if (acctData.status === 'available' && (acctData.availableProfiles === undefined || acctData.availableProfiles > 0)) {
        return {
          accountRef: candidate.accountRef,
          profileRef: null,
          profileName: 'Perfil 1',
          profilePin: null,
          credential: acctData.credential,
        };
      }
    }
  }
  return null;
}

async function createPublicLinks(serviceId, purchaseId, credentials, serviceName, resellerId = null, hasCodeExtraction = false, committedPurchase) {
  const linkTokens = [];
  if (!hasCodeExtraction) return linkTokens;

  const now = new Date();
  // Keep one link per purchased profile, including shared-parent profiles.
  for (let i = 0; i < credentials.length; i++) {
    const token = generateToken();
    // Use references returned by the successful financial transaction. Fresh
    // catalog/tenant reads here would introduce new post-debit failure paths.
    // Public resolution still revalidates the live assignment on every lookup.
    const row = committedPurchase.profiles ? committedPurchase.profiles[i] : committedPurchase;
    const scope = { purchase: committedPurchase, tenantId: committedPurchase.tenantId,
      serviceId, serviceName, accountId: row.accountId, profileId: row.profileId || null,
      assignmentId: committedPurchase.profiles ? row.assignmentId : purchaseId };
    await db.collection('public_links').doc(token).create(linkRecord(scope, purchaseId, i, now));
    linkTokens.push(token);
  }

  return linkTokens;
}

module.exports = {
  generateToken,
  buildTicketCode,
  findAvailableAccounts,
  findAvailableProfiles,
  selectProfileInTransaction,
  createPublicLinks,
};
