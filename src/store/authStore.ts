import { create } from 'zustand';
import { onAuthChange, onAdminAuthChange, checkUserRole, checkAdminRole, getCustomerData } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

interface AuthState {
  user: FirebaseUser | null;
  adminUser: FirebaseUser | null;
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
  adminUser: null,
  userTenantId: null,
  customer: null,
  isAdmin: false,
  role: null,
  loading: false,
  initialized: false,

  initialize: () => {
    let authReady = false;
    let adminReady = false;

    const checkInitialized = () => {
      if (authReady && adminReady) {
        set({ loading: false, initialized: true });
      }
    };

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



        const isAdminUser = role === 'admin' || role === 'superadmin';

        if (isAdminUser) {
          set({
            userTenantId: tenantId,
            isAdmin: true,
            role: role as 'admin' | 'superadmin',
            customer: null
          });
          // Cargar tenant desde auth si no hay tenant en URL
          if (tenantId) {
            const { useTenantStore } = await import('./tenantStore');
            useTenantStore.getState().loadTenantFromAuth(tenantId);
          }
        } else if (role === 'reseller') {
          set({
            userTenantId: tenantId,
            isAdmin: false,
            role: 'reseller',
            customer: null,
          });
          // Cargar tenant desde auth si no hay tenant en URL
          if (tenantId) {
            const { useTenantStore } = await import('./tenantStore');
            useTenantStore.getState().loadTenantFromAuth(tenantId);
          }
        } else {
          set({ userTenantId: null, isAdmin: false, role: null });
          const customerData = await getCustomerData(currentUser.uid, currentUser.email || '');
          set({ customer: customerData });
        }
      } else {
        // Solo limpiar user/customer — si hay adminUser, preservar estado admin
        const state = get();
        set({ user: null, customer: null });
        if (!state.adminUser) {
          set({ userTenantId: null, isAdmin: false, role: null });
        }
      }

      set({ loading: false });
      authReady = true;
      checkInitialized();
    });

    const unsubscribeAdmin = onAdminAuthChange(async (currentUser) => {
      set({ adminUser: currentUser, loading: true });

      if (currentUser) {
        const userData = await checkAdminRole(currentUser.uid);

        let role = userData?.role as string | null;
        let tenantId = userData?.tenantId as string | null;

        if (!role) {
          try {
            const idTokenResult = await currentUser.getIdTokenResult();
            role = idTokenResult.claims.role as string || null;
            tenantId = idTokenResult.claims.tenantId as string || null;
          } catch (e) {
            console.warn('Error reading admin claims:', e);
          }
        }

        const isAdminUser = role === 'admin' || role === 'superadmin';

        if (isAdminUser) {
          set({
            userTenantId: tenantId,
            isAdmin: true,
            role: role as 'admin' | 'superadmin',
            customer: null
          });
          if (tenantId) {
            const { useTenantStore } = await import('./tenantStore');
            useTenantStore.getState().loadTenantFromAuth(tenantId);
          }
        } else if (role === 'reseller') {
          set({
            userTenantId: tenantId,
            isAdmin: false,
            role: 'reseller',
            customer: null,
          });
          if (tenantId) {
            const { useTenantStore } = await import('./tenantStore');
            useTenantStore.getState().loadTenantFromAuth(tenantId);
          }
        }
      } else {
        // Solo limpiar adminUser — si hay usuario regular, preservar su estado
        const state = get();
        set({ adminUser: null });
        if (!state.user) {
          set({ userTenantId: null, isAdmin: false, role: null });
        }
      }

      set({ loading: false });
      adminReady = true;
      checkInitialized();
    });

    return () => {
      unsubscribe();
      unsubscribeAdmin();
    };
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
    const { logout: authLogout, adminLogout } = await import('../services/auth');
    await Promise.all([authLogout(), adminLogout()]);

    localStorage.removeItem('ejstore_roulette_data');
    localStorage.removeItem('roulette_dont_ask');

    set({ user: null, adminUser: null, userTenantId: null, customer: null, isAdmin: false, role: null });
  }
}));
