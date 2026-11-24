import { create } from 'zustand';
import { onAuthChange, onAdminAuthChange, checkUserRole, checkAdminRole, getCustomerData } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

type Role = 'admin' | 'superadmin' | 'reseller' | null;
interface AuthState {
  user: FirebaseUser | null;
  adminUser: FirebaseUser | null;
  userTenantId: string | null;
  customer: CustomerUser | null;
  isAdmin: boolean;
  role: Role;
  loading: boolean;
  initialized: boolean;
  initialize: () => (() => void) | undefined;
  setUserTenantId: (tenantId: string | null) => void;
  setCustomer: (customer: CustomerUser | null) => void;
  patchBalance: (balance: number) => void;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, adminUser: null, userTenantId: null, customer: null,
  isAdmin: false, role: null, loading: false, initialized: false,
  initialize: () => {
    let active = true;
    const versions = [0, 0];
    const ready = [false, false];
    const identities: Array<{ role: Role; tenantId: string | null } | null> = [null, null];
    const publish = () => {
      // Panel routing prefers the panel identity; customer belongs exclusively
      // to the default Firebase app, including simultaneous client/admin login.
      const identity = identities[1] || identities[0];
      set({ role: identity?.role || null, userTenantId: identity?.tenantId || null,
        isAdmin: identity?.role === 'admin' || identity?.role === 'superadmin',
        loading: !ready.every(Boolean), initialized: ready.every(Boolean) });
    };
    const listen = async (slot: number, user: FirebaseUser | null) => {
      const version = ++versions[slot];
      const current = () => active && versions[slot] === version;
      ready[slot] = false;
      identities[slot] = null;
      set(slot === 0 ? { user, customer: null } : { adminUser: user });
      publish();
      try {
        if (user) {
          const record = await (slot === 0 ? checkUserRole : checkAdminRole)(user.uid);
          let role = record?.role as string | undefined;
          let tenantId = record?.tenantId || null;
          if (!role) {
            const token = await user.getIdTokenResult();
            role = token.claims.role as string | undefined;
            tenantId = token.claims.tenantId as string || null;
          }
          if (!current()) return;
          if (role === 'admin' || role === 'superadmin' || role === 'reseller') {
            identities[slot] = { role, tenantId };
          } else if (slot === 0) {
            const customer = await getCustomerData(user.uid, user.email || '');
            if (!current()) return;
            set({ customer });
          }
        }
      } catch (error) {
        if (current()) console.error('Error resolving session:', error);
      } finally {
        if (current()) {
          ready[slot] = true;
          publish();
          const identity = identities[1] || identities[0];
          if (identity?.tenantId) {
            const { useTenantStore } = await import('./tenantStore');
            if (current() && identity === (identities[1] || identities[0])) {
              useTenantStore.getState().loadTenantFromAuth(identity.tenantId);
            }
          }
        }
      }
    };
    const stopClient = onAuthChange(user => { void listen(0, user); });
    const stopAdmin = onAdminAuthChange(user => { void listen(1, user); });
    return () => { active = false; stopClient(); stopAdmin(); };
  },
  setUserTenantId: userTenantId => set({ userTenantId }),
  setCustomer: customer => set({ customer }),
  // Absolute value, never an increment or another Firestore debit.
  patchBalance: balance => {
    const { user, customer } = get();
    if (!Number.isFinite(balance) || !customer || customer.uid !== user?.uid || customer.balance === balance) return;
    set({ customer: { ...customer, balance } });
  },
  refreshCustomer: async () => {
    const { user, customer } = get();
    if (!user || !customer) return;
    const next = await getCustomerData(user.uid);
    if (!next || get().user !== user || get().customer !== customer) return;
    set({ customer: next });
  },
  logout: async () => {
    const { logout, adminLogout } = await import('../services/auth');
    await Promise.all([logout(), adminLogout()]);
    localStorage.removeItem('ejstore_roulette_data');
    localStorage.removeItem('roulette_dont_ask');
    set({ user: null, adminUser: null, customer: null, userTenantId: null, isAdmin: false, role: null });
  },
}));
