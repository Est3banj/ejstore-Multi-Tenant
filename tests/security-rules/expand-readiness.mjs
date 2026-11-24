// Read-only source manifest. Not a builder, packager or deployment command.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBaseline } from './baseline.mjs';

assert.deepEqual(process.argv.slice(2), ['--dry-run']);
await readBaseline();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = new Map();
const external = new Set();
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
function visit(path) {
  assert.ok(path.startsWith(`${root}/`), 'Relative dependency escapes workspace');
  const name = relative(root, path);
  if (files.has(name)) return;
  const source = readFileSync(path, 'utf8');
  files.set(name, hash(source));
  const requires = [...source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)];
  assert.equal((source.match(/\brequire\s*\(/g) || []).length, requires.length, `Non-literal require needs review: ${name}`);
  assert.equal(/\bimport\s*\(/.test(source), false, `Dynamic import needs review: ${name}`);
  for (const [, , specifier] of requires) {
    if (specifier.startsWith('.')) visit(createRequire(path).resolve(specifier));
    else if (!builtins.has(specifier)) external.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
  }
}
visit(resolve(root, 'api.cjs'));
// Preserve CJS package boundaries and routing; use the API package/lock as the
// ROOT package/lock in the isolated delivery (root wrapper chooses nearest pkg).
for (const name of ['api/package.json', 'api/package-lock.json', 'functions/package.json', 'vercel.json']) {
  files.set(name, hash(readFileSync(resolve(root, name))));
}
const pkg = JSON.parse(readFileSync(resolve(root, 'api/package.json')));
const lock = JSON.parse(readFileSync(resolve(root, 'api/package-lock.json')));
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
assert.equal(pkg.engines.node, '22');
const missing = [...external].filter(name => !pkg.dependencies[name]);
// Existing optional monitoring branch is bypassed on Vercel. This is not a new
// dependency or an assertion that other deployment targets are supported.
assert.deepEqual(missing, ['@google-cloud/monitoring']);
const monitoring = readFileSync(resolve(root, 'functions/services/monitoring.js'), 'utf8');
assert.match(monitoring, /const NO_OP = .*process\.env\.VERCEL/);
const sources = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)));
const bundleRoot = resolve(root, '.vercel/output/functions/api.cjs.func');
const bundleComparison = { matching: 0, missing: [], different: [] };
for (const [name, digest] of files) {
  if (!name.endsWith('.js') && !name.endsWith('.cjs')) continue;
  const target = resolve(bundleRoot, name);
  if (!existsSync(target)) bundleComparison.missing.push(name);
  else if (hash(readFileSync(target)) !== digest) bundleComparison.different.push(name);
  else bundleComparison.matching++;
}
const readJson = path => existsSync(resolve(root, path)) ? JSON.parse(readFileSync(resolve(root, path))) : null;
const vc = readJson('.vercel/output/functions/api.cjs.func/.vc-config.json');
const output = readJson('.vercel/output/config.json');
const htmlPath = resolve(root, 'dist/index.html');
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
const main = html.match(/<script[^>]+src="([^"?]+\.js)"/)?.[1];
const mainPath = main?.startsWith('/assets/') ? resolve(root, `dist${main}`) : null;
const js = mainPath && existsSync(mainPath) ? readFileSync(mainPath, 'utf8') : '';
console.log(JSON.stringify({
  mode: 'READ ONLY / SOURCE DELIVERY MANIFEST / NOT A DEPLOYABLE BUILD',
  runtime: { active: process.version, required: '22', node22Verified: process.versions.node.split('.')[0] === '22' },
  entry: 'api.cjs', sourceCount: files.size, sourceManifestSha256: hash(JSON.stringify(sources)),
  sources,
  isolatedRootMapping: { 'package.json': 'api/package.json', 'package-lock.json': 'api/package-lock.json' },
  runtimeDependencies: Object.fromEntries(Object.entries(pkg.dependencies).sort()),
  optionalDependencyGate: { missing, requirement: 'VERCEL truthy; otherwise review monitoring dependency before delivery' },
  artifacts: {
    frontendIndexPresent: existsSync(resolve(root, 'dist/index.html')),
    vercelOutputConfigPresent: existsSync(resolve(root, '.vercel/output/config.json')),
    api: { runtime: vc?.runtime, handler: vc?.handler, routes: output?.routes, bundleComparison },
    frontend: { main, htmlSha256: html ? hash(html) : null, mainSha256: js ? hash(js) : null,
      hasStockEndpoint: js.includes('getStockAvailability'), hasRecoveryEndpoint: js.includes('getPurchaseCredentials') },
    provenanceVerified: false,
  },
  excluded: ['root package/lock (frontend and local file dependency)', '.env* at all levels', 'node_modules', 'tests', 'rules', 'firebase configs', '.github', '.git', 'frontend sources/assets'],
  gate: 'NO-GO publication: no verified prebuilt artifact; NEVER BUILD applies locally and remotely. See STAGE4.md.',
}, null, 2));
