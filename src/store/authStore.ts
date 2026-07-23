import { create } from 'zustand';
import { onAuthChange, checkUserRole, getCustomerData } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

interface AuthState {
  user: FirebaseUser | null;
  userTenantId: string | null;
  customer: CustomerUser | null;
  isAdmin: boolean;
  role: 'admin' | 'superadmin' | 'reseller' | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => (() => void) | undefined;
  setUserTenantId: (tenantId: string | null) => void;
  setCustomer: (customer: CustomerUser | null) => void;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userTenantId: null,
  customer: null,
  isAdmin: false,
  role: null,
  loading: false,
  initialized: false,

  initialize: () => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      set({ user: currentUser, loading: true });

      if (currentUser) {
        const userData = await checkUserRole(currentUser.uid);
        const isAdminUser = userData?.role === 'admin' || userData?.role === 'superadmin';

        if (isAdminUser) {
          const userRole = userData?.role || 'admin';
          set({
            userTenantId: userData.tenantId,
            isAdmin: true,
            role: userRole,
            customer: null
          });
        } else if (userData?.role === 'reseller') {
          set({
            userTenantId: userData.tenantId,
            isAdmin: false,
            role: 'reseller',
            customer: null,
          });
        } else {
          set({ userTenantId: null, isAdmin: false, role: null });
          const customerData = await getCustomerData(currentUser.uid, currentUser.email || '');
          set({ customer: customerData });
        }
      } else {
        set({ userTenantId: null, customer: null, isAdmin: false, role: null });
      }

      set({ loading: false, initialized: true });
    });

    return unsubscribe;
  },

  setUserTenantId: (tenantId) => {
    set({ userTenantId: tenantId });
  },

  setCustomer: (customer) => {
    set({ customer });
  },

  refreshCustomer: async () => {
    const { user } = get();
    if (user) {
      const customerData = await getCustomerData(user.uid);
      set({ customer: customerData });
    }
  },

  logout: async () => {
    const { logout: authLogout } = await import('../services/auth');
    await authLogout();

    localStorage.removeItem('ejstore_roulette_data');
    localStorage.removeItem('roulette_dont_ask');

    set({ user: null, userTenantId: null, customer: null, isAdmin: false, role: null });
  }
}));
