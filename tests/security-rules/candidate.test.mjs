import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { assertLocalTarget, projectId, host, port, readBaseline } from './baseline.mjs';
import { readCandidate } from './candidate.mjs';

assertLocalTarget();
const rules = await readCandidate();
let env;
let anon;
const clients = {};
const admins = {};
const resellers = {};
let superadmin;
const path = (t, status) => `services/service-${t}/accounts/${status}`;
const profile = (t, status) => `${path(t, 'available')}/profiles/${status}`;
const credential = { email: 'fictional@example.invalid', password: 'FICTIONAL-ONLY' };

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/root'), { role: 'superadmin' });
    for (const t of ['a', 'b']) {
      batch.set(doc(db, `services/service-${t}`), { tenantId: `tenant-${t}`, name: 'Public metadata' });
      batch.set(doc(db, `users/admin-${t}`), { role: 'admin', tenantId: `tenant-${t}` });
      batch.set(doc(db, `users/client-${t}`), { role: 'customer', tenantId: `tenant-${t}` });
      batch.set(doc(db, `users/reseller-${t}`), { role: 'reseller', tenantId: `tenant-${t}` });
      batch.set(doc(db, `public_links/${'A'.repeat(20)}-${t}`), {
        tenantId: `tenant-${t}`, resellerId: `reseller-${t}`, status: 'active',
        expiresAt: new Date('2099-01-01'), credential,
      });
      batch.set(doc(db, `purchases/bulk-${t}`), { resellerId: `reseller-${t}`, tenantId: `tenant-${t}`, profiles: [{ credential }] });
      for (const status of ['available', 'sold']) {
        batch.set(doc(db, path(t, status)), {
          status, credential, soldTo: status === 'sold' ? `client-${t}` : null,
        });
        batch.set(doc(db, profile(t, status)), {
          status, pin: 'FICTIONAL-PIN', soldTo: status === 'sold' ? `client-${t}` : null,
          purchaseId: 'fictional-purchase',
        });
      }
      // Available with stale soldTo must not grant ownership.
      batch.set(doc(db, path(t, 'stale')), { status: 'available', soldTo: `client-${t}`, credential });
      batch.set(doc(db, `${path(t, 'available')}/secrets/login`), { credential });
      batch.set(doc(db, `purchases/purchase-${t}`), { customerId: `client-${t}`, tenantId: `tenant-${t}` });
      batch.set(doc(db, `tenants/tenant-${t}/secrets/wompi`), { privateKey: 'FICTIONAL-ONLY' });
      batch.set(doc(db, `tenants/tenant-${t}/secrets/wompi_fixture`), { eventsSecret: 'FICTIONAL-ONLY' });
      for (const name of ['wompi_intents', 'wompi_requests', 'wompi_payment_consumptions']) {
        batch.set(doc(db, `${name}/fixture-${t}`), { tenantId: `tenant-${t}`, userId: `client-${t}` });
      }
    }
    await batch.commit();
  });
  anon = env.unauthenticatedContext().firestore();
  superadmin = env.authenticatedContext('root').firestore();
  for (const t of ['a', 'b']) {
    clients[t] = env.authenticatedContext(`client-${t}`).firestore();
    admins[t] = env.authenticatedContext(`admin-${t}`).firestore();
    resellers[t] = env.authenticatedContext(`reseller-${t}`).firestore();
  }
});

after(async () => {
  if (env) try { await env.clearFirestore(); } finally { await env.cleanup(); }
});

test('Wompi credentials, immutable intents, request keys and payment consumption are server-only for every client role', async () => {
  // Prove secrecy under both CONTRACT and the audited pre-CONTRACT rules.
  // Loading rules here changes the local demo emulator only.
  for (const selected of [rules, await readBaseline()]) {
    const loaded = await initializeTestEnvironment({ projectId, firestore: { host, port, rules: selected } });
    try {
      for (const db of [anon, clients.a, clients.b, admins.a, admins.b, resellers.a, resellers.b, superadmin]) {
        for (const path of ['tenants/tenant-a/secrets/wompi', 'tenants/tenant-a/secrets/wompi_fixture',
          'wompi_intents/fixture-a', 'wompi_requests/fixture-a', 'wompi_payment_consumptions/fixture-a']) {
          await assertFails(getDoc(doc(db, path)));
          await assertFails(setDoc(doc(db, path), { enabled: true, status: 'approved' }));
          await assertFails(deleteDoc(doc(db, path)));
        }
      }
    } finally {
      await loaded.cleanup();
    }
  }
  const restored = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });
  await restored.cleanup();
});

for (const t of ['a', 'b']) {
  const other = t === 'a' ? 'b' : 'a';
  test(`${t}: public service metadata remains readable`, async () => {
    await assertSucceeds(getDoc(doc(anon, `services/service-${t}`)));
  });
  test(`${t}: public bearer link documents deny all client reads, queries and mutations`, async () => {
    for (const db of [anon, clients[t], clients[other], resellers[t], admins[t], admins[other], superadmin]) {
      const ref = doc(db, `public_links/${'A'.repeat(20)}-${t}`);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db, 'public_links')));
      await assertFails(getDocs(query(collection(db, 'public_links'), where('resellerId', '==', `reseller-${t}`))));
      await assertFails(setDoc(doc(db, `public_links/forged-${t}`), { resellerId: `reseller-${t}`, status: 'active' }));
      await assertFails(updateDoc(ref, { status: 'active' }));
      await assertFails(deleteDoc(ref));
    }
  });
  for (const kind of ['anon', 'same-client', 'other-client', 'other-admin']) {
    test(`${t}: ${kind} cannot get or query available accounts`, async () => {
      const db = { anon, 'same-client': clients[t], 'other-client': clients[other], 'other-admin': admins[other] }[kind];
      await assertFails(getDoc(doc(db, path(t, 'available'))));
      await assertFails(getDocs(query(collection(db, `services/service-${t}/accounts`), where('status', '==', 'available'))));
      await assertFails(getDocs(collection(db, `services/service-${t}/accounts`)));
    });
  }
  test(`${t}: stale soldTo never grants available access`, async () => {
    await assertFails(getDoc(doc(clients[t], path(t, 'stale'))));
  });
  test(`${t}: sold owner reads credential and filtered owned accounts`, async () => {
    const snap = await assertSucceeds(getDoc(doc(clients[t], path(t, 'sold'))));
    assert.deepEqual(snap.data().credential, credential);
    await assertSucceeds(getDocs(query(collection(clients[t], `services/service-${t}/accounts`),
      where('status', '==', 'sold'), where('soldTo', '==', `client-${t}`))));
  });
  test(`${t}: sold account denied to anon and unrelated customer/admin`, async () => {
    for (const db of [anon, clients[other], admins[other]]) await assertFails(getDoc(doc(db, path(t, 'sold'))));
  });
  test(`${t}: scoped admin and superadmin retain full inventory read/write`, async () => {
    for (const db of [admins[t], superadmin]) {
      await assertSucceeds(getDocs(collection(db, `services/service-${t}/accounts`)));
      await assertSucceeds(updateDoc(doc(db, path(t, 'available')), { label: 'synthetic' }));
      await assertSucceeds(getDoc(doc(db, `${path(t, 'available')}/secrets/login`)));
    }
    await assertFails(updateDoc(doc(admins[other], path(t, 'available')), { label: 'forbidden' }));
  });
  test(`${t}: profiles scoped; owner reads own sold profile but not parent or siblings`, async () => {
    await assertSucceeds(getDoc(doc(clients[t], profile(t, 'sold'))));
    for (const db of [anon, clients[t], clients[other], admins[other]]) {
      await assertFails(getDoc(doc(db, profile(t, 'available'))));
    }
    for (const db of [anon, clients[other], admins[other]]) await assertFails(getDoc(doc(db, profile(t, 'sold'))));
    await assertSucceeds(getDocs(collection(admins[t], `${path(t, 'available')}/profiles`)));
    await assertFails(getDoc(doc(clients[t], `${path(t, 'available')}/secrets/login`)));
  });
  test(`${t}: owner cannot forge assignment; foreign admin cannot mutate profiles`, async () => {
    await assertFails(updateDoc(doc(clients[t], profile(t, 'sold')), { soldTo: `client-${other}` }));
    await assertFails(updateDoc(doc(clients[t], profile(t, 'sold')), { purchaseId: 'forged' }));
    await assertSucceeds(updateDoc(doc(clients[t], profile(t, 'sold')), { pin: 'synthetic-new' }));
    await assertSucceeds(updateDoc(doc(admins[t], profile(t, 'sold')), { name: 'Admin edit' }));
    await assertFails(updateDoc(doc(admins[other], profile(t, 'available')), { pin: 'forbidden' }));
    await assertFails(setDoc(doc(admins[other], `${path(t, 'available')}/profiles/forged`), { status: 'available' }));
    await assertFails(deleteDoc(doc(admins[other], profile(t, 'available'))));
  });
  test(`${t}: purchase owner delivery metadata stays private`, async () => {
    await assertSucceeds(getDoc(doc(clients[t], `purchases/purchase-${t}`)));
    await assertFails(getDoc(doc(clients[other], `purchases/purchase-${t}`)));
    await assertFails(getDoc(doc(anon, `purchases/purchase-${t}`)));
  });
  test(`${t}: reseller uses private bulk delivery, never available parent inventory`, async () => {
    const bulk = await assertSucceeds(getDoc(doc(resellers[t], `purchases/bulk-${t}`)));
    assert.deepEqual(bulk.data().profiles[0].credential, credential);
    await assertFails(getDoc(doc(resellers[other], `purchases/bulk-${t}`)));
    await assertFails(getDoc(doc(resellers[t], path(t, 'available'))));
    await assertFails(getDocs(query(collection(resellers[t], `services/service-${t}/accounts`), where('status', '==', 'available'))));
    await assertFails(getDocs(collection(resellers[t], `${path(t, 'available')}/profiles`)));
  });
  test(`${t}: scoped admin batch import creates parent and profiles; owner query stays scoped`, async () => {
    for (const [role, db] of [['admin', admins[t]], ['root', superadmin]]) {
      const parent = `services/service-${t}/accounts/import-${role}`;
      const batch = writeBatch(db);
      batch.set(doc(db, parent), { status: 'available', credential, totalProfiles: 1, availableProfiles: 1 });
      batch.set(doc(db, `${parent}/profiles/new`), { status: 'available', name: 'Synthetic', pin: 'FICTIONAL' });
      await assertSucceeds(batch.commit());
      await assertSucceeds(getDocs(collection(db, `${parent}/profiles`)));
      await assertSucceeds(deleteDoc(doc(db, `${parent}/profiles/new`)));
      await assertSucceeds(deleteDoc(doc(db, parent)));
    }
    const parent = `services/service-${t}/accounts/import-foreign`;
    const foreign = writeBatch(admins[other]);
    foreign.set(doc(admins[other], parent), { status: 'available', credential });
    foreign.set(doc(admins[other], `${parent}/profiles/new`), { status: 'available' });
    await assertFails(foreign.commit());
    await assertSucceeds(getDocs(query(collection(clients[t], `${path(t, 'available')}/profiles`),
      where('status', '==', 'sold'), where('soldTo', '==', `client-${t}`))));
    await assertFails(getDocs(collection(clients[t], `${path(t, 'available')}/profiles`)));
    await assertFails(getDoc(doc(clients[t], path(t, 'available'))));
  });
}
