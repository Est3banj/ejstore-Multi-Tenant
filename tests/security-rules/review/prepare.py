"""Export review units, never the index. No install/test/build/deploy in this helper.

Inputs are frozen by SELECTION.json. All writes are review artifacts or a new
directory under the approved temporary parent. Source transformations below are
explicit boundary reconstruction, NOT a claim to recover a historical commit.
"""
import difflib
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
TEMP = Path('/var/folders/zq/6h6qz_616b371m8v3q93wklh0000gn/T/opencode')
BASE = '7c0d85e02d05e3884b9dff2ff44a9f8c3e428086'

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe(path):
    parts = Path(path).parts
    return (not Path(path).is_absolute() and '..' not in parts
            and not any(p.startswith('.env') or 'serviceaccount' in p.lower()
                        or p in {'.git', '.vercel', '.firebase', 'node_modules', 'dist',
                                 'logs', 'cache', 'playwright-report', 'test-results'} for p in parts)
            and not path.endswith(('.map', '.jar', '.png', '.jpg', '.zip')))

assert git('rev-parse', 'HEAD').decode().strip() == BASE
assert not git('diff', '--cached')
selection = json.loads((ROOT / 'tests/security-rules/SELECTION.json').read_text())
assert selection['baseHead'] == BASE
original = {}
for entry in selection['entries']:
    p = entry['path']
    assert safe(p) and not (ROOT / p).is_symlink(), p
    data = git('show', f'{BASE}:{p}') if entry['mode'] == 'HEAD' else (ROOT / p).read_bytes()
    assert sha(data) == entry['selectedSha256'], f'Selection drift: {p}'
    original[p] = data

head = {}
with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', BASE))) as tar:
    for member in tar.getmembers():
        if member.isfile() and safe(member.name):
            head[member.name] = tar.extractfile(member).read()

def text(p):
    return original[p].decode()

def replace(source, old, new):
    assert source.count(old) == 1, old[:100]
    return source.replace(old, new, 1)

def between(source, start, end):
    return source[source.index(start):source.index(end)]

units = {k: {} for k in ['A1-runtime-base', 'A2-consumer-base', 'B-expand', 'C-consumers', 'D-manual-gates']}
A1, A2, B, C, D = units.values()
expand = {'functions/availability.js', 'functions/services/stockAvailability.js',
          'functions/services/purchaseCredentials.js'}
api_sources = [e['path'] for e in selection['entries'] if any(
    'API readiness literal-require' in reason for reason in e['reasons'])]
for p in api_sources:
    if p == 'functions/package.json':
        continue  # HEAD already supplies the CJS boundary; do not import dirty scripts/deps.
    (B if p in expand else A1)[p] = original[p]

registry = text('api/src/registry.js')
registry = replace(registry, "const { getStockAvailability, getPurchaseCredentials } = require('../../functions/availability');\n", '')
registry = replace(registry, "  getStockAvailability: { auth: 'none', handler: getStockAvailability },\n  getPurchaseCredentials: { auth: 'bearer', handler: getPurchaseCredentials },\n", '')
A1['api/src/registry.js'] = registry.encode()
B['api/src/registry.js'] = original['api/src/registry.js']
app = text('api/src/app.js')
app = replace(app, between(app, "  app.use('/api/:fn',", '  app.use(corsMiddleware);'), '')
A1['api/src/app.js'] = app.encode()
B['api/src/app.js'] = original['api/src/app.js']
middleware = text('api/src/middleware.js')
middleware = replace(middleware, "  // Cache selection also varies for rejected and origin-less requests.\n  res.vary('Origin');\n", '')
middleware = replace(middleware, "    res.setHeader('Access-Control-Allow-Origin', origin);", "    res.setHeader('Access-Control-Allow-Origin', origin);\n    res.setHeader('Vary', 'Origin');")
A1['api/src/middleware.js'] = middleware.encode()
B['api/src/middleware.js'] = original['api/src/middleware.js']
table = text('api/tests/registry.test.js')
table = replace(table, "  { name: 'getStockAvailability', auth: 'none' },\n  { name: 'getPurchaseCredentials', auth: 'bearer' },\n", '')
table = table.replace('46 rutas (44 previas + stock público + recovery privado, sin excluded)', '44 rutas previas (sin excluded)').replace('toHaveLength(46)', 'toHaveLength(44)')
A1['api/tests/registry.test.js'] = table.encode()
B['api/tests/registry.test.js'] = original['api/tests/registry.test.js']

# Keep prior Product/diamond/wholesale behavior; peel only EXPAND hunks.
for p in ['src/services/marketplace.ts', 'src/pages/Product.jsx',
          'src/pages/reseller/CatalogoMayorista.tsx', 'src/components/ServiceCard.tsx',
          'src/pages/customer/PurchaseResult.tsx', 'src/components/PurchaseConfirmModal.tsx',
          'src/utils/freefire.ts', 'src/utils/tenantUrl.ts', 'src/services/apiClient.ts']:
    A2[p] = original[p]
    if p in ['src/services/marketplace.ts', 'src/pages/Product.jsx',
             'src/pages/reseller/CatalogoMayorista.tsx', 'src/components/ServiceCard.tsx',
             'src/pages/customer/PurchaseResult.tsx']:
        C[p] = original[p]

p = 'src/services/marketplace.ts'
s = text(p)
old = head[p].decode()
s = replace(s, between(s, '      // Las compras históricas', '\n      return base'),
            between(old, '      // Si la compra tiene accountId', '\n      return base'))
s = replace(s, between(s, '/** Public aggregate only.', '// ===== RESELLER ====='),
            between(old, '/**\n * Returns available stock', '// ===== RESELLER ====='))
A2[p] = s.encode()

# Home: select just existing inventory effect and tenant context. Landing CTA,
# motion/social-proof imports and markup stay HEAD; none are required by EXPAND.
p = 'src/pages/Home.jsx'
s = head[p].decode()
s = replace(s, 'const { services, settings }', 'const { services, settings, tenant }')
current_effect = between(text(p), '  // Cargar stock', '  // Filtrar servicios populares')
base_effect = current_effect
for a, b in [('    let active = true;\n    setStockMap({});\n', ''),
             ('getAvailableServiceStock(svc.id, tenant?.id)', 'getAvailableServiceStock(svc.id)'),
             ('catch { map[svc.id] = undefined; }', 'catch { map[svc.id] = 0; }'),
             ('if (active) setStockMap(map);', 'setStockMap(map);'),
             ('if (services.length > 0 && tenant?.id)', 'if (services.length > 0)'),
             ('    return () => { active = false; };\n', ''),
             ('}, [services, tenant?.id]);', '}, [services]);')]:
    base_effect = replace(base_effect, a, b)
home_effect = between(s, '  // Cargar stock', '  // Filtrar servicios populares')
A2[p] = replace(s, home_effect, base_effect).encode()
C[p] = replace(s, home_effect, current_effect).encode()

p = 'src/components/ServiceCard.tsx'
A2[p] = replace(text(p), 'const isByOrder = !isDiamond && stock === 0;',
                'const isByOrder = !isDiamond && stockCount === 0;').encode()
p = 'src/pages/customer/PurchaseResult.tsx'
s = replace(text(p), "import { getPurchaseCredentials } from '../../services/marketplace';\n", '')
A2[p] = replace(s, '          if (!credential && data.accountId) credential = await getPurchaseCredentials(purchaseId);\n', '').encode()
p = 'src/pages/Product.jsx'
s = text(p)
for a, b in [('  const [stockError, setStockError] = useState(false);\n', ''),
             ('    let active = true;\n    setStock(null);\n    setStockError(false);\n    setService(null);\n    setLoading(true);\n', ''),
             ('        if (!active) return;\n', ''),
             ('getAvailableServiceStock(id, tenant.id)', 'getAvailableServiceStock(id)'),
             ('if (active) setStock(stockCount);', 'setStock(stockCount);'),
             ('if (active) setStockError(true);', 'setStock(0);'),
             ('if (active) setLoading(false);', 'setLoading(false);'),
             ('    return () => { active = false; };\n', ''),
             (' || (!isDiamond && stock === null)', ''),
             ('stockError ? <p role="status">No se pudo verificar la disponibilidad. Intentá recargar.</p> : ', '')]:
    s = replace(s, a, b)
A2[p] = s.encode()
p = 'src/pages/reseller/CatalogoMayorista.tsx'
s = text(p)
for a, b in [('    let active = true;\n    setServices([]);\n', ''),
             ('      setError(null);\n', ''), ('        if (!active) return;\n', ''),
             ('            const stock = await getAvailableServiceStock(svc.id, tenantId);',
              "            let stock = 0;\n            try {\n              stock = await getAvailableServiceStock(svc.id);\n            } catch (e) {\n              console.error(`Stock error for ${svc.id}:`, e);\n            }"),
             ('if (active) setServices(servicesWithStock);', 'setServices(servicesWithStock);'),
             ("if (active) setError('Error al cargar el catálogo');", "setError('Error al cargar el catálogo');"),
             ('if (active) setLoading(false);', 'setLoading(false);'),
             ('    return () => { active = false; };\n', '')]:
    s = replace(s, a, b)
A2[p] = s.encode()

# Only diamond category hunk; inactivity policy is unrelated.
p = 'src/utils/constants.js'
A2[p] = text(p).split('// Cierre de sesión por inactividad')[0].rstrip().encode() + b'\n'

for p in ['tests/security-rules/package.json', 'tests/security-rules/package-lock.json',
          'tests/security-rules/loopback-only.cjs', 'tests/security-rules/availability.test.cjs',
          'tests/security-rules/runtime.test.cjs']:
    B[p] = original[p]
for p in ['src/services/marketplace.test.ts', 'src/test/DiamondAvailability.test.tsx',
          'src/test/StockAvailability.test.tsx', 'src/test/PurchaseCredentialRecovery.test.tsx',
          'src/test/setup.ts', 'tests/security-frontend/package.json',
          'tests/security-frontend/package-lock.json', 'tests/security-frontend/setup.ts',
          'tests/security-frontend/vitest.config.mjs']:
    C[p] = original[p]
for p in ['.github/workflows/security-compatibility.yml', 'firebase.security-rules.json',
          'tests/security-rules/accounts.test.mjs', 'tests/security-rules/baseline.mjs',
          'tests/security-rules/candidate.mjs', 'tests/security-rules/candidate.test.mjs',
          'tests/security-rules/contract-dry-run.mjs', 'tests/security-rules/expand-readiness.mjs',
          'tests/security-rules/run.mjs', 'tests/security-rules/manual-validation.mjs',
          'tests/security-tools/package.json', 'tests/security-tools/package-lock.json',
          'tests/security-tools/check-workflow.py']:
    D[p] = original[p]
fixture = 'tests/security-rules/fixtures/audited-original.rules'
D[fixture] = original['firestore.rules']
D['tests/security-rules/baseline.mjs'] = replace(text('tests/security-rules/baseline.mjs'),
    "new URL('../../firestore.rules', import.meta.url)", "new URL('./fixtures/audited-original.rules', import.meta.url)").replace(
    'Local audit baseline changed;', 'Historical audit fixture changed;').encode()
cfg = json.loads(text('firebase.security-rules.json'))
cfg['firestore']['rules'] = fixture
D['firebase.security-rules.json'] = (json.dumps(cfg, indent=2) + '\n').encode()
D['tests/security-rules/contract-dry-run.mjs'] = text('tests/security-rules/contract-dry-run.mjs').replace(
    '// Pins the active file to the audited original.', '// Pins the historical fixture, NOT active/remote production rules.').encode()
D['tests/security-rules/run.mjs'] = text('tests/security-rules/run.mjs').replace(
    'Local baseline SHA-256:', 'Historical fixture SHA-256:').encode()

from contracts import select
contract_provenance = select(head, original, A2, C, D, ROOT, OUT, replace, between)

assert TEMP.is_dir()
snapshot = Path(tempfile.mkdtemp(prefix='security-units-', dir=TEMP))
for p, data in head.items():
    dest = snapshot / p
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
state = dict(head)
manifest_units = []
for name, changes in units.items():
    diff = []
    files = []
    for p, data in sorted(changes.items()):
        assert safe(p) and b'\x00' not in data
        old = state.get(p)
        if old == data:
            continue
        lines = difflib.unified_diff((old or b'').decode().splitlines(keepends=True),
            data.decode().splitlines(keepends=True), fromfile=f'a/{p}' if old is not None else '/dev/null', tofile=f'b/{p}')
        delta = ''.join(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n' for line in lines)
        diff.append(f'diff --git a/{p} b/{p}\n' + ('new file mode 100644\n' if old is None else '') + delta)
        files.append({'path': p, 'before': sha(old) if old is not None else None,
                      'after': sha(data), 'bytes': len(data), 'hunks': re.findall(r'^@@.*$', delta, re.M)})
    patch = ''.join(diff).encode()
    dest = OUT / f'{name}.patch'
    dest.write_bytes(patch)
    subprocess.run(['git', 'apply', '--check', str(dest)], cwd=snapshot, check=True)
    subprocess.run(['git', 'apply', str(dest)], cwd=snapshot, check=True)
    state.update(changes)
    assert all((snapshot / p).read_bytes() == state[p] for p in changes)
    manifest_units.append({'unit': name, 'patch': dest.name, 'sha256': sha(patch),
                           'patchBytes': len(patch), 'fileCount': len(files), 'files': files})
assert state['firestore.rules'] == head['firestore.rules']
changed_paths = sorted({f['path'] for u in manifest_units for f in u['files']})
final = {p: sha(state[p]) for p in changed_paths}
omitted = [p for p in original if p not in changed_paths and original[p] != head.get(p)]
manifest = {'baseHead': BASE, 'snapshot': str(snapshot), 'status': 'GENERATED; tests pending',
    'selectionManifestSha256': sha((ROOT / 'tests/security-rules/SELECTION.json').read_bytes()),
    'dependencies': {'A1-runtime-base': [], 'A2-consumer-base': [], 'B-expand': ['A1-runtime-base'],
                     'C-consumers': ['A2-consumer-base', 'B-expand (HTTP contract at runtime)'],
                     'D-manual-gates': ['A1-runtime-base', 'A2-consumer-base', 'B-expand', 'C-consumers']},
    'units': manifest_units, 'changedFileCount': len(final), 'finalSources': final,
    'finalSourcesSha256': sha(json.dumps(final, separators=(',', ':')).encode()),
    'rules': {'productionPath': 'firestore.rules', 'snapshotSha256': sha(head['firestore.rules']),
              'untouchedWorkingTreeSha256': sha(original['firestore.rules']),
              'historicalFixturePath': fixture, 'historicalFixtureSha256': sha(D[fixture]),
              'candidateSha256': selection['candidateSha256'], 'productionActivated': False},
    'omittedSelectionChanges': omitted,
    'partiallySelected': ['src/pages/Home.jsx', 'src/utils/constants.js'],
    'trackedDiffSha256': sha(git('diff', '--no-ext-diff', '--no-textconv', 'HEAD')),
    'indexDiffSha256': sha(git('diff', '--cached')),
    'contractProvenance': contract_provenance,
    'contractTemplatesSha256': {p.name: sha(p.read_bytes()) for p in sorted((OUT / 'sources').iterdir()) if p.is_file()}}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'snapshot': str(snapshot), 'units': [{k: u[k] for k in ['unit', 'fileCount', 'patchBytes', 'sha256']} for u in manifest_units],
                  'changedFileCount': len(final), 'finalSourcesSha256': manifest['finalSourcesSha256']}, indent=2))
