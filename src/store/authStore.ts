import { create } from 'zustand';
import { onAuthChange, onAdminAuthChange, checkUserRole, getCustomerData, adminLogout, logout as customerLogout } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

interface AuthState {
  user: FirebaseUser | null;
  userTenantId: string | null;
  customer: CustomerUser | null;
  isAdmin: boolean;
  role: 'admin' | 'superadmin' | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => (() => void) | undefined;
  setUserTenantId: (tenantId: string | null) => void;
  setCustomer: (customer: CustomerUser | null) => void;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

// Factory: crea un store de auth con la función onAuthChange específica
// Esto permite tener sesiones aisladas entre admin y cliente
const createAuthStore = (onAuthChangeFn: typeof onAuthChange, logoutFn: typeof customerLogout) => {
  return create<AuthState>((set, get) => ({
    user: null,
    userTenantId: null,
    customer: null,
    isAdmin: false,
    role: null,
    loading: false,
    initialized: false,

    initialize: () => {
      const unsubscribe = onAuthChangeFn(async (currentUser) => {
        set({ user: currentUser, loading: true });

        if (currentUser) {
          const userData = await checkUserRole(currentUser.uid);
          const isAdminUser = !!userData?.tenantId;

          if (isAdminUser) {
            const userRole = userData?.role || 'admin';
            set({
              userTenantId: userData.tenantId,
              isAdmin: true,
              role: userRole,
              customer: null
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
      await logoutFn();

      // Limpiar localStorage de ruleta
      localStorage.removeItem('ejstore_roulette_data');
      localStorage.removeItem('roulette_dont_ask');

      set({ user: null, userTenantId: null, customer: null, isAdmin: false, role: null });
    }
  }));
};

// Store para clientes (usa auth principal - localStorage - compartido entre tabs)
export const useAuthStore = createAuthStore(onAuthChange, customerLogout);

// Store para admin (usa adminAuth - sesión aislada del cliente)
export const useAdminAuthStore = createAuthStore(onAdminAuthChange, adminLogout);
