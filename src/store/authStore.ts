import { create } from 'zustand';
import { onAuthChange, checkUserRole, getCustomerData } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

interface AuthState {
  user: FirebaseUser | null;
  userTenantId: string | null;
  customer: CustomerUser | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
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
  loading: false,
  initialized: false,

  initialize: () => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      set({ user: currentUser, loading: true });
      
      if (currentUser) {
        const userData = await checkUserRole(currentUser.uid);
        if (userData?.tenantId) {
          set({ userTenantId: userData.tenantId });
        } else {
          set({ userTenantId: null });
        }
        
        // Cargar datos del cliente
        const customerData = await getCustomerData(currentUser.uid);
        set({ customer: customerData });
      } else {
        set({ userTenantId: null, customer: null });
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
    set({ user: null, userTenantId: null, customer: null });
  }
}));
