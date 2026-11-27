// Runs existing isolated tests only: no install, build, packaging or publication.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const gates = {
  candidate: ['test', '--prefix', 'tests/security-rules'],
  handlers: ['run', 'test:handlers', '--prefix', 'tests/security-rules'],
  frontend: ['--silent', 'test', '--prefix', 'tests/security-frontend', '--', '--reporter=json'],
  runtime: ['run', 'test:runtime', '--prefix', 'tests/security-rules'],
  readiness: null,
};
const counts = { candidate: 29, handlers: 14, runtime: 15 };
const selected = process.argv.slice(2);
if (selected.length === 0) selected.push(...Object.keys(gates));
assert.ok(selected.every(name => Object.hasOwn(gates, name)), 'Unknown validation gate');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} failed (signal: ${result.signal ?? 'none'})`);
  return result.stdout;
}

for (const name of selected) {
  console.log(`\nManual validation gate: ${name}`);
  if (name === 'readiness') {
    for (const script of ['contract-dry-run.mjs', 'expand-readiness.mjs']) {
      run(process.execPath, [`tests/security-rules/${script}`, '--dry-run']);
    }
    continue;
  }
  if (name === 'frontend') run(process.execPath, ['tests/security-frontend/check-contracts.mjs']);
  const output = run('npm', gates[name]);
  if (name === 'frontend') {
    const report = JSON.parse(output);
    assert.equal(report.success, true);
    assert.equal(report.numTotalTests, 196);
    assert.equal(report.numPassedTests, 196);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    assert.equal(report.numTodoTests, 0);
    const cases = report.testResults.flatMap(file => file.assertionResults);
    assert.equal(cases.length, 196);
    assert.ok(cases.every(test => test.status === 'passed'), 'Skipped/todo frontend tests cannot pass this gate');
  } else {
    for (const [field, expected] of Object.entries({
      tests: counts[name], pass: counts[name], fail: 0, cancelled: 0, skipped: 0, todo: 0,
    })) {
      const values = [...output.matchAll(new RegExp(`^# ${field} (\\d+)\\r?$`, 'gm'))];
      assert.equal(values.length, 1, `Missing or ambiguous TAP summary: ${field}`);
      assert.equal(Number(values[0][1]), expected, `Unexpected TAP ${field}: ${name}`);
    }
  }
}
console.log('\nRequested source validation gates passed. Release remains NO-GO; see MANUAL_VALIDATION.md.');
