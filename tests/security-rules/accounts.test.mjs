import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { assertLocalTarget, projectId, host, port, readBaseline } from './baseline.mjs';

// These assertions execute BEFORE initializing any Firebase SDK context.
assertLocalTarget();
const rules = await readBaseline();
let environment;
let anonymous;
const clients = {};
const admins = {};
const tenants = ['a', 'b'];
const accountPath = (tenant, id) => `services/service-${tenant}/accounts/${id}`;
const credential = (tenant, id) => ({
  email: `fictional-${tenant}-${id}@example.invalid`,
  password: `FICTIONAL-NOT-A-REAL-PASSWORD-${tenant}-${id}`,
});

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port, rules } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const tenant of tenants) {
      batch.set(doc(db, `services/service-${tenant}`), { tenantId: `tenant-${tenant}` });
      batch.set(doc(db, `public_links/fictional-revoked-${tenant}`), {
        tenantId: `tenant-${tenant}`, status: 'revoked', expiresAt: new Date('2000-01-01'), credential: credential(tenant, 'link'),
      });
      for (const role of ['client', 'admin']) {
        batch.set(doc(db, `users/${role}-${tenant}`), {
          role: role === 'client' ? 'customer' : 'admin', tenantId: `tenant-${tenant}`,
        });
      }
      for (const status of ['available', 'sold']) {
        batch.set(doc(db, accountPath(tenant, status)), {
          tenantId: `tenant-${tenant}`, status,
          soldTo: status === 'sold' ? `client-${tenant}` : null,
          credential: credential(tenant, status),
        });
      }
    }
    await batch.commit();
  });
  anonymous = environment.unauthenticatedContext().firestore();
  for (const tenant of tenants) {
    // Rules use uid and users/{uid}. No role/tenant custom claims are invented.
    clients[tenant] = environment.authenticatedContext(`client-${tenant}`, {
      email: `fictional-client-${tenant}@example.invalid`, email_verified: true,
    }).firestore();
    admins[tenant] = environment.authenticatedContext(`admin-${tenant}`, {
      email: `fictional-admin-${tenant}@example.invalid`, email_verified: true,
    }).firestore();
  }
}, { timeout: 30000 });

after(async () => {
  if (environment) {
    try { await environment.clearFirestore(); } finally { await environment.cleanup(); }
  }
}, { timeout: 15000 });

async function expectCredential(db, tenant, status) {
  const snapshot = await assertSucceeds(getDoc(doc(db, accountPath(tenant, status))));
  assert.equal(snapshot.exists(), true);
  assert.equal(snapshot.data().status, status);
  assert.deepEqual(snapshot.data().credential, credential(tenant, status));
}

for (const tenant of tenants) {
  const other = tenant === 'a' ? 'b' : 'a';
  test(`EXPOSURE: anonymous direct get ignores revoked/expired public link in ${tenant} (characterization ONLY)`, async () => {
    const snapshot = await assertSucceeds(getDoc(doc(anonymous, `public_links/fictional-revoked-${tenant}`)));
    assert.deepEqual(snapshot.data().credential, credential(tenant, 'link'));
  });
  test(`EXPOSURE: anonymous get available in tenant ${tenant} returns email AND password`, async () => {
    await expectCredential(anonymous, tenant, 'available');
  });
  test(`EXPOSURE: anonymous available query in tenant ${tenant} returns email AND password`, async () => {
    const snapshot = await assertSucceeds(getDocs(query(
      collection(anonymous, `services/service-${tenant}/accounts`), where('status', '==', 'available'),
    )));
    assert.equal(snapshot.size, 1);
    assert.equal(snapshot.docs[0].id, 'available');
    assert.deepEqual(snapshot.docs[0].data().credential, credential(tenant, 'available'));
  });
  test(`anonymous cannot get sold account in tenant ${tenant}`, async () => {
    await assertFails(getDoc(doc(anonymous, accountPath(tenant, 'sold'))));
  });
  test(`anonymous cannot list unfiltered accounts in tenant ${tenant}`, async () => {
    await assertFails(getDocs(collection(anonymous, `services/service-${tenant}/accounts`)));
  });
  test(`owner client ${tenant} reads own sold account including credential`, async () => {
    await expectCredential(clients[tenant], tenant, 'sold');
  });
  test(`client ${other} cannot read another owner's sold account in tenant ${tenant}`, async () => {
    await assertFails(getDoc(doc(clients[other], accountPath(tenant, 'sold'))));
  });
  test(`admin ${tenant} reads sold account of its service tenant`, async () => {
    await expectCredential(admins[tenant], tenant, 'sold');
  });
  test(`admin ${other} cannot read sold account of service tenant ${tenant}`, async () => {
    await assertFails(getDoc(doc(admins[other], accountPath(tenant, 'sold'))));
  });
  test(`EXPOSURE: client ${other} reads available credential across tenants in ${tenant}`, async () => {
    await expectCredential(clients[other], tenant, 'available');
  });
}

// Opt-in target assertion: intentionally FAILS against this vulnerable baseline.
// It is absent from the characterization run, never skipped or counted as a fix.
if (process.env.SECURITY_RULES_DIAGNOSTIC_DENIAL === '1') {
  test('DIAGNOSTIC TARGET (expected failure): anonymous available read must be denied', async () => {
    await assertFails(getDoc(doc(anonymous, accountPath('a', 'available'))));
  });
}
