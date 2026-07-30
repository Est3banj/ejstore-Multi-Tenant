import { create } from 'zustand';
import { detectTenantFromUrl, getTenantById } from '../services/tenant';
import { TENANT_DEFAULTS, type Tenant } from '../types';
import { useAuthStore } from './authStore';

interface TenantState {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  initialize: () => void;
  loadTenant: (tenantId: string) => Promise<void>;
  loadTenantFromAuth: (tenantId: string) => void;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenant: null,
  loading: true,
  error: null,

  initialize: () => {
    const tryLoad = () => {
      // 1. Intentar desde la URL (?v= o ?tenant= o subdominio)
      const urlTenant = detectTenantFromUrl();
      if (urlTenant) {
        get().loadTenant(urlTenant);
        return true;
      }

      // 2. Intentar desde sesión (admin/reseller logueado)
      const state = useAuthStore.getState();
      if (state.adminUser && state.userTenantId) {
        get().loadTenant(state.userTenantId);
        return true;
      }

      return false;
    };

    // Intentar cargar ahora
    if (tryLoad()) return;

    // Si falló, esperar a que auth se inicialice y reintentar
    const unsub = useAuthStore.subscribe((s) => {
      if (s.initialized) {
        unsub();
        if (!tryLoad()) {
          set({ error: 'No tenant especificado en la URL', loading: false });
        }
      }
    });
  },

  // Cargar tenant desde auth (admin/reseller autenticados)
  loadTenantFromAuth: (tenantId: string) => {
    if (tenantId && !detectTenantFromUrl()) {
      get().loadTenant(tenantId);
    } else {
      // Sin tenant en URL: estado válido para mostrar landing page (sin error)
      set({ tenant: null, error: null, loading: false });
    }
  },

  loadTenant: async (tenantId) => {
    if (!tenantId) {
      set({ error: 'No tenant specified', loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      const tenantData = await getTenantById(tenantId);
      
      if (tenantData) {
        sessionStorage.setItem('ejstore_tenant_id', tenantId);
        set({ tenant: { ...TENANT_DEFAULTS, ...tenantData }, loading: false });
      } else {
        set({ error: 'Tenant no encontrado', loading: false });
      }
    } catch (error) {
      set({ error: 'Error cargando tenant', loading: false });
    }
  },

  clearTenant: () => {
    set({ tenant: null, error: null, loading: false });
  }
}));
