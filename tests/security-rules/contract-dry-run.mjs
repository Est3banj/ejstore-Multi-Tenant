import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readBaseline } from './baseline.mjs';
import { readCandidate } from './candidate.mjs';

assert.deepEqual(process.argv.slice(2), ['--dry-run'], 'Only --dry-run is supported; this script cannot deploy or write rules');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = await readBaseline(); // Pins the active file to the audited original.
const candidate = await readCandidate();
assert.notEqual(hash(candidate), hash(baseline));
const paths = [
  'api/src/registry.js', 'api/src/app.js', 'api/src/middleware.js', 'api/src/config.js',
  'functions/availability.js', 'functions/services/stockAvailability.js', 'functions/services/purchaseCredentials.js',
  'functions/accounts.js', 'functions/services/publicLinks.js', 'functions/services/inventoryService.js', 'functions/services/purchaseService.js',
  'src/pages/public/VerCuenta.tsx', 'src/pages/reseller/MisClientes.tsx',
  'src/services/apiClient.ts', 'src/services/marketplace.ts', 'src/pages/Home.jsx', 'src/pages/Product.jsx',
  'src/pages/reseller/CatalogoMayorista.tsx', 'src/components/ServiceCard.tsx',
  'src/pages/customer/MisServicios.tsx', 'src/pages/customer/PurchaseResult.tsx',
];
const sources = Object.fromEntries(await Promise.all(paths.map(async path =>
  [path, hash(await readFile(new URL(`../../${path}`, import.meta.url)))])));
console.log(JSON.stringify({
  mode: 'LOCAL DRY RUN — no files written, no network, no deployment',
  baselineSha256: hash(baseline), candidateSha256: hash(candidate),
  sourceManifestSha256: hash(JSON.stringify(sources)), sources,
  gate: 'NOT AUTHORIZED: satisfy STAGE3.md gates before a separately approved promotion',
  scope: 'Source subset fingerprint; not a built artifact, deployment archive or proof of live backend routes',
}, null, 2));
