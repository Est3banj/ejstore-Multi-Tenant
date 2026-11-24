"""Replay standard patches in a fresh HEAD export; run isolated source gates.

No Git repository/index is created in the snapshot. Logs stay in approved temp;
only compact evidence is persisted into manifest.json. This is not a builder.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TEMP = Path('/var/folders/zq/6h6qz_616b371m8v3q93wklh0000gn/T/opencode')
manifest = json.loads((HERE / 'manifest.json').read_text())
BASE = manifest['baseHead']
assert TEMP.is_dir()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

assert git('rev-parse', 'HEAD').decode().strip() == BASE
before_diff = git('diff', '--no-ext-diff', '--no-textconv', 'HEAD')
before_index = git('diff', '--cached')
assert not before_index

if sys.argv[1:] == ['--audit-only']:
    target = Path(manifest['verification']['snapshot'])
    assert target.resolve().is_relative_to(TEMP.resolve())
    for p, digest in manifest['finalSources'].items():
        assert sha((target / p).read_bytes()) == digest, p
    for unit in manifest['units']:
        patch = (HERE / unit['patch']).read_bytes()
        assert sha(patch) == unit['sha256']
        headers = re.findall(r'^diff --git a/(\S+) b/(\S+)$', patch.decode(), re.M)
        assert len(headers) == unit['fileCount']
        assert all(a == b and not Path(a).is_absolute() and '..' not in Path(a).parts for a, b in headers)
        assert not any(p == 'firestore.rules' for p, _ in headers)
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|"private_key"\s*:', patch)
    selection = json.loads((ROOT / 'tests/security-rules/SELECTION.json').read_text())
    for e in selection['entries']:
        assert sha((ROOT / e['path']).read_bytes()) == e['workingTreeSha256'], e['path']
    # Re-check the six former integration holes against the APPLIED snapshot and
    # the frozen working tree. This only asserts selected real contracts exist;
    # behavior is covered by the external-boundary-only integration suite.
    sources = {p: (target / p).read_text() for p in
               ['src/services/auth.ts', 'src/services/firebase.ts', 'src/services/firestore.ts',
                'src/store/authStore.ts', 'src/types/index.ts', 'src/types/marketplace.ts']}
    contracts = [
        ('src/services/auth.ts', 'export const SIGNUP_BONUS', 'src/pages/Product.jsx:10',
         'HEAD had no named export; single signup policy now shared by Product copy and register write.'),
        ('src/services/firebase.ts', 'export const logAnalyticsEvent', 'src/pages/Product.jsx:11',
         'HEAD had no export; real GA4 wrapper selected while adminApp/Functions exports from HEAD are kept.'),
        ('src/services/firestore.ts', 'export const getWholesaleServices', 'src/pages/reseller/CatalogoMayorista.tsx:5',
         'HEAD had no export/serviceType projection; real tenant-scoped read selected, diamond excluded, errors propagate.'),
        ('src/store/authStore.ts', 'patchBalance:', 'src/pages/Product.jsx:169,282',
         'HEAD had no method; absolute-balance patch selected with identity/finite guards and stale-refresh guard.'),
        ('src/types/index.ts', 'serviceType?:', 'src/components/ServiceCard.tsx:19',
         'HEAD type lacked the discriminator; diamond/subscription union selected.'),
        ('src/types/marketplace.ts', 'export interface DiamondOrder', 'src/services/marketplace.ts:42-46',
         'HEAD types lacked prior DiamondOrder request/response contracts; type-only imports are checked by the focused typecheck.'),
    ]
    resolved = []
    for p, symbol, consumer, head_gap in contracts:
        assert symbol in sources[p], p
        assert symbol in (ROOT / p).read_text(), p
        resolved.append({'boundary': p, 'requiredSymbol': symbol, 'consumer': consumer,
                         'status': 'RESOLVED', 'headGap': head_gap,
                         'evidence': 'Symbol present in applied snapshot and frozen working tree; contracts.test.tsx exercises the real implementation with SDK/HTTP doubles only.',
                         'snapshotSha256': sha(sources[p].encode())})
    api_client = (target / 'src/services/apiClient.ts').read_text()
    catalog = (target / 'src/pages/reseller/CatalogoMayorista.tsx').read_text()
    assert 'customAdminCallable' in api_client and 'customCallable' in api_client
    assert 'const { adminUser }' in catalog and 'adminDb' in catalog
    assert 'adminAuth = getAuth(adminApp)' in (target / 'src/services/firebase.ts').read_text()
    suite = (target / 'tests/security-frontend/contracts.test.tsx').read_text()
    boundary = (target / 'tests/security-frontend/sdk-boundary.ts').read_text()
    internal_mock = re.search(r"vi\.mock\(\s*['\"]\.\./\.\./src/(services|store|utils)/", suite)
    assert internal_mock is None, 'Internal contract mock would hide a missing export'
    assert set(re.findall(r"vi\.mock\('([^']+)'", suite + boundary)) <= {
        'firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage',
        'firebase/functions', 'firebase/analytics'}
    for p, digest in manifest['contractProvenance'].items():
        assert sha((ROOT / p).read_bytes()) == digest, p
    for p, digest in manifest['contractTemplatesSha256'].items():
        assert sha((HERE / 'sources' / p).read_bytes()) == digest, p
    resolved.append({'boundary': 'src/services/firebase.ts + src/store/authStore.ts + src/services/apiClient.ts + Catalog',
                     'status': 'RESOLVED', 'headGap': 'HEAD keeps auth/adminAuth separate while A2 expected unified session.',
                     'evidence': 'Dual apps retained: customCallable uses auth, customAdminCallable uses adminAuth, Catalog reads adminUser/adminDb. Suite asserts distinct Bearer tokens, rejects missing/failed/empty tokens and in-flight identity changes without cross-session fallback, and verifies listener cleanup.'})
    manifest['resolvedIntegrationBoundaries'] = resolved
    manifest['integrationBlockers'] = []
    manifest['status'] = 'GO focused frontend integration/source review; NO-GO deployment/CONTRACT; no full-app browser/E2E evidence'
    manifest['verification']['finalAudit'] = {
        'patchPathsSafe': True, 'privateKeyAndGitHubTokenPatternScan': 'PASS (known patterns only)',
        'workingTreeSelection109HashesPreserved': True,
        'trackedDiffSha256': sha(before_diff), 'index': 'empty',
        'helperSha256': {p.name: sha(p.read_bytes()) for p in HERE.iterdir() if p.suffix in ['.py', '.md']}}
    assert sha(before_diff) == manifest['trackedDiffSha256']
    assert sha((target / 'firestore.rules').read_bytes()) == manifest['rules']['snapshotSha256']
    (HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'status': manifest['status'], 'resolvedBoundaries': len(resolved),
                      'remainingBlockers': 0,
                      'manifestSha256': sha((HERE / 'manifest.json').read_bytes()),
                      'finalSourcesSha256': manifest['finalSourcesSha256']}, indent=2))
    sys.exit(0)

if sys.argv[1:] == ['--target-runtime']:
    # Use existing binaries only; no runtime download or global configuration.
    target = Path(manifest['verification']['snapshot'])
    assert target.resolve().is_relative_to(TEMP.resolve())
    for p, digest in manifest['finalSources'].items():
        assert sha((target / p).read_bytes()) == digest, p
    node = Path('/usr/local/bin/node')
    java_home = Path('/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home')
    assert node.is_file() and (java_home / 'bin/java').is_file()
    env22 = {**os.environ, 'JAVA_HOME': str(java_home), 'TMPDIR': str(TEMP),
             'PATH': os.pathsep.join([str(target / 'tests/security-tools/node_modules/.bin'),
                                     str(node.parent), str(java_home / 'bin'), os.environ['PATH']])}
    for key in ['NODE_OPTIONS', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN',
                'FIREBASE_SERVICE_ACCOUNT', 'FIRESTORE_EMULATOR_HOST', 'ALLOWED_ORIGINS']:
        env22.pop(key, None)
    version = subprocess.check_output([str(node), '--version'], env=env22, text=True).strip()
    assert version.startswith('v22.')
    java = subprocess.run([str(java_home / 'bin/java'), '-version'], env=env22, capture_output=True, text=True, check=True).stderr
    assert '21.0.8' in java
    result = subprocess.run([str(node), 'tests/security-rules/manual-validation.mjs'], cwd=target,
                            env=env22, capture_output=True, timeout=300)
    log = Path(manifest['verification']['logs']) / 'final-node22-java21.log'
    log.write_bytes(result.stdout + result.stderr)
    assert result.returncode == 0, str(log)
    assert 'Requested source validation gates passed.' in result.stdout.decode()
    assert sha((target / 'firestore.rules').read_bytes()) == manifest['rules']['snapshotSha256']
    assert git('diff', '--no-ext-diff', '--no-textconv', 'HEAD') == before_diff
    assert git('diff', '--cached') == before_index
    proof = {'node': version, 'nodeBinary': str(node), 'java': java.strip(),
             'javaHome': str(java_home), 'os': sys.platform, 'exitCode': result.returncode,
              'sourceTests': 122, 'allFiveManualGates': 'PASS', 'log': str(log),
             'logSha256': sha(result.stdout + result.stderr),
             'limit': 'Local macOS / existing Oracle Java 21; NOT GitHub Ubuntu / Temurin proof'}
    manifest['verification']['targetRuntime'] = proof
    (HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(proof, indent=2))
    sys.exit(0)
assert not sys.argv[1:]

def safe(p):
    return not (Path(p).is_absolute() or '..' in Path(p).parts or any(
        x.startswith('.env') or 'serviceaccount' in x.lower() or x in
        {'.git', '.vercel', '.firebase', 'node_modules', 'dist', 'logs', 'cache',
         'playwright-report', 'test-results'} for x in Path(p).parts))

archive = git('archive', '--format=tar', BASE)

def export(prefix):
    target = Path(tempfile.mkdtemp(prefix=prefix, dir=TEMP))
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            if member.isfile() and safe(member.name) and not member.name.endswith(('.map', '.jar', '.png', '.jpg', '.zip')):
                dest = target / member.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(tar.extractfile(member).read())
    return target

snapshot = export('security-units-verified-')
logs = Path(tempfile.mkdtemp(prefix='security-units-logs-', dir=TEMP))
results = []
env = {**os.environ, 'TMPDIR': str(TEMP),
       'JAVA_HOME': '/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home',
       'PATH': '/usr/local/bin:/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin:' + os.environ['PATH']}
for key in ['NODE_OPTIONS', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN',
            'FIREBASE_SERVICE_ACCOUNT', 'FIRESTORE_EMULATOR_HOST', 'ALLOWED_ORIGINS']:
    env.pop(key, None)

def run(label, args, cwd=snapshot, extra_env=None, input=None, timeout=300000):
    result = subprocess.run(args, cwd=cwd, env={**env, **(extra_env or {})}, input=input,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout / 1000)
    output = result.stdout + result.stderr
    log = logs / f'{label}.log'
    log.write_bytes(output)
    record = {'gate': label, 'exitCode': result.returncode, 'logSha256': sha(output), 'log': str(log)}
    results.append(record)
    if not label.startswith('syntax-') or result.returncode:
        print(json.dumps({k: v for k, v in record.items() if k != 'log'}), flush=True)
    assert result.returncode == 0, f'{label}: inspect {log}'
    return result.stdout.decode()

def apply(unit, target=snapshot, suffix=''):
    patch = HERE / unit['patch']
    assert sha(patch.read_bytes()) == unit['sha256']
    assert all(safe(f['path']) for f in unit['files'])
    for f in unit['files']:
        dest = target / f['path']
        assert not dest.is_symlink()
        assert (sha(dest.read_bytes()) if dest.exists() else None) == f['before'], f['path']
    run(unit['unit'] + suffix + '-check', ['git', 'apply', '--check', str(patch)], cwd=target)
    run(unit['unit'] + suffix + '-apply', ['git', 'apply', str(patch)], cwd=target)
    for f in unit['files']:
        assert sha((target / f['path']).read_bytes()) == f['after'], f['path']

def registry(target, count, label):
    # Compare the REAL registry to its existing authoritative table. No replicated
    # route table or test substitute; legacy bodies are outside this structure gate.
    code = r"""
const fs = require('node:fs'); const vm = require('node:vm'); const assert = require('node:assert/strict');
const moduleBoundary = {exports:{}};
vm.runInNewContext(fs.readFileSync('api/src/registry.js','utf8'), {
  module: moduleBoundary, require: () => new Proxy({}, {get: () => () => {throw Error('No handler execution in structure gate')}})
});
const table = fs.readFileSync('api/tests/registry.test.js','utf8').match(/const SPEC_ROUTES = (\[[\s\S]*?\]);/)[1];
const expected = vm.runInNewContext(table); const registry = moduleBoundary.exports.FN_REGISTRY;
assert.equal(expected.length, Number(process.argv[1]));
assert.deepEqual(Object.keys(registry).sort(), Array.from(expected, r => r.name).sort());
for (const r of expected) {assert.equal(registry[r.name].auth,r.auth); assert.equal(typeof registry[r.name].handler,'function')}
console.log(JSON.stringify({routes: expected.length, exactTable: true, handlerBodiesTested: false}));
"""
    return json.loads(run(label, ['node', '--input-type=commonjs', '-e', code, str(count)], cwd=target))

def tap(label, output, count):
    for field, expected in {'tests': count, 'pass': count, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}.items():
        matches = re.findall(r'^# ' + field + r' (\d+)\r?$', output, re.M)
        assert matches == [str(expected)], (label, field, matches)
    results[-1]['tests'] = count

def install(package, label):
    descriptor = json.loads((snapshot / package / 'package.json').read_text())
    lock = json.loads((snapshot / package / 'package-lock.json').read_text())
    assert descriptor['devDependencies'] == lock['packages']['']['devDependencies']
    for entry in lock['packages'].values():
        if 'resolved' in entry:
            assert entry['resolved'].startswith('https://registry.npmjs.org/') and entry.get('integrity')
    run(label, ['npm', 'ci', '--prefix', package, '--ignore-scripts', '--no-audit', '--no-fund',
                '--registry=https://registry.npmjs.org/'])

for unit in manifest['units']:
    apply(unit)
    if unit['unit'] == 'A1-runtime-base':
        for f in unit['files']:
            if f['path'].endswith(('.js', '.cjs')) and not f['path'].startswith('api/tests/'):
                run('syntax-' + f['path'].replace('/', '_'), ['node', '--check', f['path']])
        registry(snapshot, 44, 'A1-registry44')
    elif unit['unit'] == 'B-expand':
        install('tests/security-rules', 'B-install-locked-rules')
        tap('B-handlers', run('B-handlers', ['npm', 'run', 'test:handlers', '--prefix', 'tests/security-rules']), 14)
        tap('B-runtime', run('B-runtime', ['npm', 'run', 'test:runtime', '--prefix', 'tests/security-rules']), 15)
    elif unit['unit'] == 'C-consumers':
        install('tests/security-frontend', 'C-install-locked-frontend')
        run('C-real-contract-typecheck', ['node', 'tests/security-frontend/check-contracts.mjs'])
        output = run('C-frontend', ['npm', '--silent', 'test', '--prefix', 'tests/security-frontend', '--', '--reporter=json'])
        report = json.loads(output)
        assert report['success'] and report['numTotalTests'] == report['numPassedTests'] == 65
        assert report['numFailedTests'] == report['numPendingTests'] == report['numTodoTests'] == 0
        cases = [t for f in report['testResults'] for t in f['assertionResults']]
        assert len(cases) == 65 and all(t['status'] == 'passed' for t in cases)
        results[-1]['tests'] = 65
    elif unit['unit'] == 'D-manual-gates':
        install('tests/security-tools', 'D-install-locked-tools')
        env['PATH'] = str(snapshot / 'tests/security-tools/node_modules/.bin') + os.pathsep + env['PATH']
        tap('D-candidate', run('D-candidate', ['node', 'tests/security-rules/manual-validation.mjs', 'candidate']), 28)
        tap('D-historical', run('D-historical', ['npm', 'run', 'test:baseline', '--prefix', 'tests/security-rules']), 18)
        run('D-workflow', ['python3', 'tests/security-tools/check-workflow.py'])
        contract = json.loads(run('D-contract-dry-run', ['node', 'tests/security-rules/contract-dry-run.mjs', '--dry-run']))
        api = json.loads(run('D-expand-dry-run', ['node', 'tests/security-rules/expand-readiness.mjs', '--dry-run']))
        assert contract['candidateSha256'] == manifest['rules']['candidateSha256']
        assert api['sourceCount'] == 48

# Independent application branches: no preceding unrelated unit required.
independent = export('security-units-independent-')
for name in ['A1-runtime-base', 'B-expand']:
    apply(next(u for u in manifest['units'] if u['unit'] == name), independent, '-independent')
registry(independent, 46, 'independent-registry46')
tap('independent-handlers', run('independent-handlers',
    ['node', '--require', './tests/security-rules/loopback-only.cjs', '--test', 'tests/security-rules/availability.test.cjs'], cwd=independent), 14)
consumer_only = export('security-units-consumer-base-')
apply(next(u for u in manifest['units'] if u['unit'] == 'A2-consumer-base'), consumer_only, '-independent')

assert not (snapshot / '.git').exists()
for path, digest in manifest['finalSources'].items():
    assert not (snapshot / path).is_symlink()
    assert sha((snapshot / path).read_bytes()) == digest, path
assert sha((snapshot / 'firestore.rules').read_bytes()) == manifest['rules']['snapshotSha256']
assert sha((ROOT / 'firestore.rules').read_bytes()) == manifest['rules']['untouchedWorkingTreeSha256']
assert git('diff', '--no-ext-diff', '--no-textconv', 'HEAD') == before_diff
assert git('diff', '--cached') == before_index
assert not (snapshot / 'dist').exists() and not (snapshot / '.vercel').exists()
assert not (snapshot / 'api/node_modules').exists() and not (snapshot / 'functions/node_modules').exists()
# Reject credentials, external symlinks, or source sharing; npm .bin links within
# each isolated package are expected and may not escape the snapshot.
links = []
for path in snapshot.rglob('*'):
    rel = path.relative_to(snapshot)
    assert not any(p.startswith('.env') or 'serviceaccount' in p.lower() for p in rel.parts), str(rel)
    if path.is_symlink():
        assert 'node_modules' in rel.parts
        assert path.resolve().is_relative_to(snapshot.resolve()), str(rel)
        links.append(str(rel))
assert all('node_modules' in p.parts for p in (snapshot / 'node_modules').rglob('*')) if (snapshot / 'node_modules').exists() else True

manifest['status'] = 'GO source review; NO-GO deployment/CONTRACT'
manifest['verification'] = {'snapshot': str(snapshot), 'independentBackendSnapshot': str(independent),
    'independentConsumerBaseSnapshot': str(consumer_only), 'logs': str(logs), 'results': results,
    'sourceTests': {'candidate': 28, 'handlers': 14, 'frontend': 65, 'runtime': 15, 'total': 122},
    'historicalCharacterizationSeparate': 18,
    'finalGateComposition': 'B 29 + C 65 unchanged after D; D candidate 28. New 30 tests import real internal contracts.',
    'apiCount': api['sourceCount'], 'apiManifestSha256': api['sourceManifestSha256'],
    'subsetManifestSha256': contract['sourceManifestSha256'],
    'node': run('node-version', ['node', '--version']).strip(), 'npm': run('npm-version', ['npm', '--version']).strip(),
    'javaLog': run('java-version', ['java', '-version']),
    'sourceSymlinks': 0, 'externalSymlinks': 0, 'npmInternalSymlinks': len(links),
    'trackedDiffSha256': sha(before_diff), 'index': 'empty', 'noRootApiFunctionsInstall': True}
# java -version writes stderr: its complete, hashed log is in results.
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'status': manifest['status'], 'snapshot': str(snapshot), 'tests': 122,
                  'historicalSeparate': 18, 'apiManifestSha256': api['sourceManifestSha256'],
                  'subsetManifestSha256': contract['sourceManifestSha256']}, indent=2))
