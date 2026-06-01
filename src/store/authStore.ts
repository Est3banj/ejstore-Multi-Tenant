import { create } from 'zustand';
import { onAuthChange, checkUserRole, getCustomerData } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { CustomerUser } from '../services/auth';

interface AuthState {
  user: FirebaseUser | null;
  userTenantId: string | null;
  customer: CustomerUser | null;
  isAdmin: boolean; // true si el usuario es admin
  role: 'admin' | 'superadmin' | null; // rol específico
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
  isAdmin: false,
  role: null,
  loading: false,
  initialized: false,

  initialize: () => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      set({ user: currentUser, loading: true });
      
      if (currentUser) {
        // Verificar si es admin (tiene documento en users collection)
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
          // Solo cargar datos de cliente si NO es admin
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
    
    // Limpiar localStorage de ruleta
    localStorage.removeItem('ejstore_roulette_data');
    localStorage.removeItem('roulette_dont_ask');
    
    set({ user: null, userTenantId: null, customer: null, isAdmin: false, role: null });
  }
}));
