import assert from 'node:assert/strict';
import { readBaseline } from './baseline.mjs';

// CONTRACT candidate only, constructed in memory from the hash-pinned audit
// baseline. NOT referenced by firebase.json or deployable as a rules file.
// Promote only after the compatibility gates in STAGE2.md have been met.
export async function readCandidate() {
  let rules = await readBaseline();
  const replaceOnce = (from, to) => {
    assert.equal(rules.split(from).length, 2, 'Candidate baseline anchor must occur exactly once');
    rules = rules.replace(from, to);
  };
  replaceOnce(`      allow read: if (
        (request.auth == null && resource.data.status == 'available') ||
        (request.auth != null && (
          resource.data.status == 'available' ||
          resource.data.soldTo == request.auth.uid ||
          isSuperadmin() ||
          (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId))
        ))
      );`, `      allow read: if request.auth != null && (
        (resource.data.status == 'sold' && resource.data.get('soldTo', null) == request.auth.uid) ||
        isSuperadmin() ||
        (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId))
      );`);
  replaceOnce(`          isAdmin() ||
          resource.data.soldTo == request.auth.uid`, `          isSuperadmin() ||
          (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId)) ||
          (resource.data.status == 'sold' && resource.data.get('soldTo', null) == request.auth.uid)`);
  replaceOnce(`        allow create: if request.auth != null && isAdmin();`, `        allow create: if request.auth != null && (
          isSuperadmin() ||
          (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId))
        );`);
  replaceOnce(`          resource.data.status == 'sold' ? resource.data.soldTo == request.auth.uid : isAdmin()`, `          isSuperadmin() ||
          (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId)) ||
          (resource.data.status == 'sold' && resource.data.get('soldTo', null) == request.auth.uid &&
            request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'pin']))`);
  replaceOnce(`        allow delete: if request.auth != null && isAdmin();`, `        allow delete: if request.auth != null && (
          isSuperadmin() ||
          (isAdmin() && isTenantAdminFor(get(/databases/$(database)/documents/services/$(serviceId)).data.tenantId))
        );`);
  return rules;
}
