import { create } from 'zustand';
import { detectTenantFromUrl, getTenantById } from '../services/tenant';
import { TENANT_DEFAULTS, type Tenant } from '../types';

interface TenantState {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  initialize: () => void;
  loadTenant: (tenantId: string) => Promise<void>;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenant: null,
  loading: true,
  error: null,

  initialize: () => {
    const tenantId = detectTenantFromUrl();
    if (tenantId) {
      get().loadTenant(tenantId);
    } else {
      set({ error: 'No tenant especificado en la URL', loading: false });
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
