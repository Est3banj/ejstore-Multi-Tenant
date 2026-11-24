import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const projectId = 'demo-ejstore-rules-stage1';
export const host = '127.0.0.1';
export const port = 8089;
export const rulesHash = 'c24b7c5fb757eeba7ec67e22fc0c5e514332624ae608584a6261e99cc62e276c';

export async function readBaseline() {
  const rules = await readFile(new URL('./fixtures/audited-original.rules', import.meta.url));
  assert.equal(createHash('sha256').update(rules).digest('hex'), rulesHash,
    'Historical audit fixture changed; review explicitly before updating its hash');
  return rules.toString('utf8');
}

export function assertLocalTarget() {
  assert.match(projectId, /^demo-[a-z0-9-]+$/);
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, `${host}:${port}`,
    'Refusing to use anything except the expected loopback Firestore emulator');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, undefined);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(process.env.FIREBASE_TOKEN, undefined);
}
