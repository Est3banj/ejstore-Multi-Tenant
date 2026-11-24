import { vi } from 'vitest';

// Isolate unrelated auth, telemetry and tenant bootstrap, without importing SDK
// initialization or the rest of the application dependency graph.
vi.mock('../../src/services/firebase', () => ({ db: {}, adminDb: {}, auth: {}, logAnalyticsEvent: vi.fn() }));
vi.mock('../../src/services/auth', () => ({ SIGNUP_BONUS: 1000 }));
vi.mock('../../src/utils/tenantUrl', () => ({ withTenantParam: (path: string) => path }));
vi.mock('../../src/components/RechargeModal', () => ({ RechargeModal: () => null }));
