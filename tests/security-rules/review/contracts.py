"""Minimal prior contracts plus dual-session compatibility; no workspace source edits."""
def select(head, original, A2, C, D, root, out, replace, between):
    provenance = {}

    def working(path):
        data = (root / path).read_bytes()
        import hashlib
        provenance[path] = hashlib.sha256(data).hexdigest()
        return data.decode()

    p = 'src/services/auth.ts'
    s = head[p].decode()
    bonus = between(working(p), 'export const SIGNUP_BONUS', 'export interface AuthUser').strip()
    s = replace(s, 'export interface AuthUser', bonus + '\n\nexport interface AuthUser')
    s = replace(s, 'balance: 1000, // Saldo inicial para probar la ruleta', 'balance: SIGNUP_BONUS, // Same registration policy; not an additional credit')
    A2[p] = s.encode()

    p = 'src/services/firebase.ts'
    prior = working(p)
    s = head[p].decode()
    s = replace(s, "import { getFunctions } from 'firebase/functions';", "import { getFunctions } from 'firebase/functions';\n" + between(prior, 'import {\n  getAnalytics', '\n\nconst firebaseConfig'))
    s = replace(s, 'export default app;', between(prior, '// GA4:', 'export default app;') + 'export default app;')
    A2[p] = s.encode()

    p = 'src/services/firestore.ts'
    prior = working(p)
    s = head[p].decode()
    assert s.count('category: data.category,') == 3
    s = s.replace('category: data.category,', 'category: data.category,\n        serviceType: data.serviceType,')
    s = replace(s, '  plans?: Service[\'plans\'];', "  serviceType?: 'diamond' | 'subscription';\n  plans?: Service['plans'];")
    s = replace(s, 'export const createService', between(prior, 'export const getWholesaleServices', 'export const createService') + 'export const createService')
    A2[p] = s.encode()
    for p in ['src/types/index.ts', 'src/types/marketplace.ts']:
        A2[p] = working(p).encode()  # Diff inspected: discriminator and DiamondOrder contracts only.

    # Prior patchBalance semantics retained; initialization is an explicit HEAD
    # dual-listener adaptation with per-slot invalidation, not unified Auth.
    assert 'patchBalance: (balance)' in working('src/store/authStore.ts')
    A2['src/store/authStore.ts'] = (out / 'sources/authStore.ts').read_bytes()
    A2['src/services/apiClient.ts'] = (out / 'sources/apiClient.ts').read_bytes()
    A2['src/vite-env.d.ts'] = replace(head['src/vite-env.d.ts'].decode(),
        'interface ImportMetaEnv {', 'interface ImportMetaEnv {\n  readonly VITE_API_URL?: string;\n  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;').encode()
    # Preserve HEAD admin-session catalog rather than selecting unified Auth.
    p = 'src/pages/reseller/CatalogoMayorista.tsx'
    for unit in [A2, C]:
        s = unit[p].decode()
        s = replace(s, "import { getWholesaleServices }", "import { adminDb } from '../../services/firebase';\nimport { getWholesaleServices }")
        s = replace(s, 'const { user } = useAuthStore();\n  const uid = user?.uid', 'const { adminUser } = useAuthStore();\n  const uid = adminUser?.uid')
        s = replace(s, 'getResellerById(uid)', 'getResellerById(uid, adminDb)')
        s = replace(s, 'getWholesaleServices(tenantId)', 'getWholesaleServices(tenantId, adminDb)')
        unit[p] = s.encode()

    # Explicit admin wrapper uses the existing isolated adminAuth. No role-based
    # fallback to whichever Firebase user happens to be signed in.
    admin_calls = ['processDiamondOrder', 'createReseller', 'adminDeleteResellerByEmail',
                   'loadResellerBalance', 'processBulkPurchase', 'saveEmailConfig', 'getEmailConfig',
                   'checkEmailStatus', 'generateTelegramToken', 'checkTelegramStatus',
                   'updateTicketCredentials', 'adminUpdateTicket', 'testEmailConnection',
                   'saveSmtpConfig', 'getSmtpConfig', 'sendTestEmail', 'onTicketUpdated']
    import re
    p = 'src/services/marketplace.ts'
    for unit in [A2, C]:
        s = unit[p].decode()
        s = replace(s, "import { customCallable }", "import { customCallable, customAdminCallable }")
        for name in admin_calls:
            s, n = re.subn(r'customCallable(<[^\n]*?>)?\(\s*([\'\"])' + name + r'\2', r'customAdminCallable\1(\2' + name + r'\2', s)
            assert n == 1, name
        s = replace(s, 'export const getResellerById = async (resellerId: string)', 'export const getResellerById = async (resellerId: string, _db?: Firestore)')
        s = replace(s, "const docRef = doc(dbInstance, 'resellers', resellerId);", "const docRef = doc(_db || dbInstance, 'resellers', resellerId);")
        unit[p] = s.encode()
    # Add a separate suite without the legacy internal-contract mocks/setup.
    for name in ['contracts.test.tsx', 'sdk-boundary.ts', 'vitest.config.mjs', 'package.json', 'package-lock.json', 'check-contracts.mjs']:
        C['tests/security-frontend/' + name] = (out / 'sources' / name).read_bytes()
    C['src/test/StockAvailability.test.tsx'] = replace(C['src/test/StockAvailability.test.tsx'].decode(),
        "h.auth = { user: { uid: 'owner' },", "h.auth = { adminUser: { uid: 'reseller' }, user: { uid: 'owner' },").encode()
    C['tests/security-frontend/setup.ts'] = C['tests/security-frontend/setup.ts'].replace(b'db: {}, auth: {},', b'db: {}, adminDb: {}, auth: {},')
    D['tests/security-rules/manual-validation.mjs'] = D['tests/security-rules/manual-validation.mjs'].replace(b', 35)', b', 65)')
    D['tests/security-rules/manual-validation.mjs'] = replace(D['tests/security-rules/manual-validation.mjs'].decode(),
        "  const output = run('npm', gates[name]);", "  if (name === 'frontend') run(process.execPath, ['tests/security-frontend/check-contracts.mjs']);\n  const output = run('npm', gates[name]);").encode()
    return provenance
