import { create } from 'zustand';
import { onAuthChange, checkUserRole } from '../services/auth';
import type { User as FirebaseUser } from 'firebase/auth';

interface AuthState {
  user: FirebaseUser | null;
  userTenantId: string | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  initialize: () => (() => void) | undefined;
  setUserTenantId: (tenantId: string | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userTenantId: null,
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
      } else {
        set({ userTenantId: null });
      }
      
      set({ loading: false, initialized: true });
    });

    return unsubscribe;
  },

  setUserTenantId: (tenantId) => {
    set({ userTenantId: tenantId });
  },

  logout: async () => {
    const { logout: authLogout } = await import('../services/auth');
    await authLogout();
    set({ user: null, userTenantId: null });
  }
}));
