import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = fileURLToPath(new URL('./node_modules/', import.meta.url));
const packages = ['react', 'react-dom', 'react-router-dom', 'framer-motion', 'lucide-react', '@tanstack/react-query', '@testing-library/react', '@testing-library/jest-dom', 'vitest', 'zustand'];
export default defineConfig({
  root,
  server: { fs: { allow: [root] } },
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    ...packages.map(name => ({ find: new RegExp(`^${name}(/.*)?$`), replacement: `${modules}${name}$1` })),
    { find: /^firebase(\/.*)?$/, replacement: `${root}tests/security-rules/node_modules/firebase$1` },
  ] },
  test: {
    maxWorkers: 1, fileParallelism: false,
    projects: [
      { extends: true, test: { name: 'legacy', globals: true, environment: 'jsdom',
        setupFiles: [`${root}src/test/setup.ts`, `${root}tests/security-frontend/setup.ts`],
        include: ['src/services/marketplace.test.ts', 'src/test/DiamondAvailability.test.tsx', 'src/test/StockAvailability.test.tsx', 'src/test/PurchaseCredentialRecovery.test.tsx'] } },
      { extends: true, test: { name: 'contracts', globals: true, environment: 'jsdom',
        setupFiles: [`${root}tests/security-frontend/sdk-boundary.ts`],
        include: ['tests/security-frontend/contracts.test.tsx'],
        env: { VITE_FIREBASE_MEASUREMENT_ID: 'synthetic-measurement' } } },
    ],
  },
});
