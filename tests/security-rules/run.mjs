import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectId, host, port, readBaseline, rulesHash } from './baseline.mjs';

assert.ok(process.argv.slice(2).every((arg) => ['--diagnostic-denial', '--baseline'].includes(arg)));
const diagnostic = process.argv.includes('--diagnostic-denial');
const baseline = diagnostic || process.argv.includes('--baseline');
await readBaseline();
assert.match(projectId, /^demo-[a-z0-9-]+$/);
const packageDir = fileURLToPath(new URL('.', import.meta.url));
const config = fileURLToPath(new URL('../../firebase.security-rules.json', import.meta.url));
const cache = join(homedir(), '.cache/firebase/emulators');
await access(join(cache, 'cloud-firestore-emulator-v1.20.4.jar'));

// Fail on occupied ports instead of attaching to an unrelated local emulator.
for (const candidate of [port, 4409, 4509, 9159]) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(candidate, host, () => server.close(resolve));
  });
}

const scratch = await mkdtemp(join(tmpdir(), 'ejstore-security-rules-'));
const env = {
  PATH: process.env.PATH,
  ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
  HOME: scratch,
  XDG_CONFIG_HOME: scratch,
  TMPDIR: scratch,
  CI: 'true',
  NO_UPDATE_NOTIFIER: '1',
  FIREBASE_CLI_DISABLE_TELEMETRY: '1',
  FIREBASE_EMULATORS_PATH: cache,
  GCE_METADATA_HOST: '127.0.0.1:9',
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: `${host}:${port}`,
  NODE_OPTIONS: `--require=${JSON.stringify(join(packageDir, 'loopback-only.cjs'))}`,
  ...(diagnostic ? { SECURITY_RULES_DIAGNOSTIC_DENIAL: '1' } : {}),
};

let child;
let timer;
const stop = () => {
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
};
const interrupt = () => { stop(); process.exitCode = 130; };
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  const version = spawnSync('firebase', ['--version'], {
    cwd: scratch, env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(version.status, 0, 'Firebase CLI version check failed');
  assert.equal(version.stdout.trim(), '15.15.0', 'Use the audited Firebase CLI 15.15.0');
  console.log(`Historical fixture SHA-256: ${rulesHash}; CLI ${version.stdout.trim()}; Node ${process.version}`);
  console.log(baseline ? 'Mode: historical characterization (NOT a security gate)' : 'Mode: CONTRACT candidate (in-memory rules, active rules unchanged)');
  const command = [process.execPath, '--test', '--test-concurrency=1',
    '--test-timeout=45000', '--test-reporter=tap', join(packageDir, baseline ? 'accounts.test.mjs' : 'candidate.test.mjs')]
    .map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
  child = spawn('firebase', ['emulators:exec', '--only', 'firestore',
    '--project', projectId, '--config', config, '--non-interactive', command], {
    cwd: scratch, env, stdio: 'inherit', detached: true,
  });
  timer = setTimeout(() => { console.error('Emulator suite exceeded 180 seconds'); stop(); }, 180000);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  clearTimeout(timer);
  stop();
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  await rm(scratch, { recursive: true, force: true });
}
