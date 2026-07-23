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
        // 1. Intentar con Firestore (users/{uid})
        const userData = await checkUserRole(currentUser.uid);

        // 2. Fallback: leer custom claims del token (más confiable)
        let role = userData?.role as string | null;
        let tenantId = userData?.tenantId as string | null;

        if (!role) {
          try {
            const idTokenResult = await currentUser.getIdTokenResult();
            role = idTokenResult.claims.role as string || null;
            tenantId = idTokenResult.claims.tenantId as string || null;
          } catch (e) {
            console.warn('Error reading custom claims:', e);
          }
        }

        console.log('🔍 AuthStore: uid=', currentUser.uid, 'email=', currentUser.email, 'firestoreRole=', userData?.role, 'customRole=', role);

        const isAdminUser = role === 'admin' || role === 'superadmin';

        if (isAdminUser) {
          set({
            userTenantId: tenantId,
            isAdmin: true,
            role: role as 'admin' | 'superadmin',
            customer: null
          });
        } else if (role === 'reseller') {
          set({
            userTenantId: tenantId,
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
