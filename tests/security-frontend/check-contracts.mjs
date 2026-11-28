// No emit/bundle/build. TypeScript checks a focused production import closure.
import ts from 'typescript';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = resolve(root, 'tests/security-frontend/node_modules');
const roots = ['src/pages/reseller/MisClientes.tsx', 'src/pages/public/VerCuenta.tsx', 'src/pages/Product.jsx', 'src/pages/reseller/CatalogoMayorista.tsx',
  'src/pages/customer/PurchaseResult.tsx', 'src/components/ServiceCard.tsx',
  'src/types/marketplace.ts', 'src/vite-env.d.ts', 'src/components/WompiPaymentOption.tsx',
  'src/components/admin/WompiSettings.tsx', 'src/components/RechargeModal.tsx',
  'src/pages/admin/Settings.tsx', 'src/pages/admin/Recharges.tsx', 'src/pages/recargas/HistorialRecargas.tsx'];
const options = {
  noEmit: true, allowJs: true, checkJs: false, skipLibCheck: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true, allowSyntheticDefaultImports: true,
  typeRoots: [resolve(modules, '@types')], types: ['react', 'react-dom'],
  paths: {
    react: [resolve(modules, '@types/react/index.d.ts')],
    'react/*': [resolve(modules, '@types/react/*')],
    'react-dom': [resolve(modules, '@types/react-dom/index.d.ts')],
    'vite/client': [resolve(modules, 'vite/client.d.ts')],
    sweetalert2: [resolve(modules, 'sweetalert2/sweetalert2.d.ts')],
    'firebase/*': [resolve(root, 'tests/security-rules/node_modules/firebase/*')],
    ...Object.fromEntries(['zustand', '@tanstack/react-query', 'framer-motion', 'lucide-react', 'react-router-dom'].map(name => [name, [resolve(modules, name)]])),
  },
};
  const program = ts.createProgram([...roots.map(p => resolve(root, p)), resolve(modules, 'vite/client.d.ts')], options);
const checker = program.getTypeChecker();
const sources = program.getSourceFiles().filter(s => s.fileName.startsWith(root) && !s.fileName.includes('/node_modules/') && !s.isDeclarationFile);
let edges = 0;
// Also inspect JS named imports: checkJs:false deliberately excludes broad JS
// inference, but must NOT hide absent runtime exports in this graph.
for (const source of sources) {
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('.')) {
      const symbol = checker.getSymbolAtLocation(node.moduleSpecifier);
      assert.ok(symbol, `Unresolved local module: ${source.fileName}: ${node.moduleSpecifier.text}`);
      const names = new Set(checker.getExportsOfModule(symbol).map(s => s.name));
      if (ts.isImportDeclaration(node)) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
          assert.ok(names.has((element.propertyName || element.name).text), `Missing export ${element.getText(source)} in ${node.moduleSpecifier.text} from ${source.fileName}`);
          edges++;
        }
        if (node.importClause?.name) { assert.ok(names.has('default')); edges++; }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: p => p, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log(JSON.stringify({ mode: 'focused TypeScript noEmit + local named import closure', typescript: ts.version, roots, checkJs: false, sources: sources.map(s => relative(root, s.fileName)).sort(), localNamedImportsChecked: edges, diagnostics: 0 }));
