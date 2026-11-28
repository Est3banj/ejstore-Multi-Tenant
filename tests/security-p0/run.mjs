import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.equal(process.versions.node.split('.')[0], '22', 'Use Node 22');
const dir = fileURLToPath(new URL('.', import.meta.url));
const mode = process.argv[2];
const stressModes = {
  '--stress-wompi': { iterations: 10, count: 20, pattern: 'idempotent concurrent checkout|concurrent webhook retries' },
  '--stress-wompi-checkout': { iterations: 20, count: 20, pattern: 'idempotent concurrent checkout' },
  '--stress-wompi-scheduled': { iterations: 20, count: 20, pattern: 'scheduled concurrent checkout' },
  '--stress-wompi-settlement': { iterations: 20, count: 20, pattern: 'concurrent webhook retries' },
  '--stress-wompi-reconcile': { iterations: 20, count: 20, pattern: 'webhook and owner reconciliation race' },
  '--stress-wompi-distinct': { iterations: 20, count: 20, pattern: 'different concurrent final keys' },
};
const stress = Object.hasOwn(stressModes, mode) ? stressModes[mode] : null;
assert.ok(process.argv.length === 2 || (stress && process.argv.length === 3));
const guard = fileURLToPath(new URL('../security-rules/loopback-only.cjs', import.meta.url));
const cache = join(homedir(), '.cache/firebase/emulators');
await access(join(cache, 'cloud-firestore-emulator-v1.20.4.jar'));
for (const port of [8088, 9098, 4408, 4508, 9158]) {
  await new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const scratch = await mkdtemp(join(tmpdir(), 'ejstore-p0-'));
const env = {
  PATH: process.env.PATH, ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
  HOME: scratch, XDG_CONFIG_HOME: scratch, TMPDIR: scratch, CI: 'true',
  NO_UPDATE_NOTIFIER: '1', FIREBASE_CLI_DISABLE_TELEMETRY: '1', FIREBASE_EMULATORS_PATH: cache,
  GCE_METADATA_HOST: '127.0.0.1:9', GCLOUD_PROJECT: 'demo-ejstore-p0', GOOGLE_CLOUD_PROJECT: 'demo-ejstore-p0',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9098',
  NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
  // Use the already locked isolated Express package, never root/API installs.
  NODE_PATH: join(dir, '../security-rules/node_modules'),
  ...(stress ? { WOMPI_STRESS_ITERATIONS: String(stress.iterations) } : {}),
};
let child, timer;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; } } };
const interrupt = () => { stop(); process.exitCode = 130; };
process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
try {
  const version = spawnSync('firebase', ['--version'], { cwd: scratch, env, encoding: 'utf8', timeout: 15000 });
  assert.equal(version.status, 0); assert.equal(version.stdout.trim(), '15.15.0');
  await writeFile(join(scratch, 'firestore.rules'), 'rules_version = "2"; service cloud.firestore { match /databases/{db}/documents { match /{doc=**} { allow read, write: if false; } } }');
  await writeFile(join(scratch, 'firebase.json'), JSON.stringify({
    firestore: { rules: 'firestore.rules' },
    emulators: {
      firestore: { host: '127.0.0.1', port: 8088, websocketPort: 9158 },
      auth: { host: '127.0.0.1', port: 9098 }, hub: { host: '127.0.0.1', port: 4408 },
      logging: { host: '127.0.0.1', port: 4508 }, ui: { enabled: false }, singleProjectMode: true,
    },
  }));
  const command = [process.execPath, '--test', '--test-concurrency=1', '--test-timeout=90000', '--test-reporter=tap',
    ...(stress ? [`--test-name-pattern=${stress.pattern}`] : []),
    ...(stress ? ['wompi'] : ['recharges', 'purchases', 'admin', 'wompi']).map(name => join(dir, `${name}.test.cjs`))]
    .map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
  child = spawn('firebase', ['emulators:exec', '--only', 'firestore,auth', '--project', 'demo-ejstore-p0',
    '--config', join(scratch, 'firebase.json'), '--non-interactive', command], { cwd: scratch, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  timer = setTimeout(() => { console.error('P0 emulator gate exceeded 240 seconds'); stop(); }, 240000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) console.error(await readFile(join(scratch, 'firestore-debug.log'), 'utf8'));
  assert.equal(code, 0, 'P0 emulator command failed');
  for (const [key, count] of Object.entries({ tests: stress ? stress.count : 78, pass: stress ? stress.count : 78, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const values = [...output.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
    assert.equal(values.length, 1, `Missing or ambiguous TAP summary: ${key}`);
    assert.equal(Number(values[0][1]), count, `Expected ${key} ${count}`);
  }
  console.log(stress ? `Wompi stress: ${stress.count}/${stress.count} passed (${mode}).` : 'P0 + Wompi gate: 78/78 passed; no skipped/cancelled/todo tests.');
} finally {
  clearTimeout(timer); stop(); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  await rm(scratch, { recursive: true, force: true });
}
