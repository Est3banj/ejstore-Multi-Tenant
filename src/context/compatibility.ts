// Compatibility layer - re-export old Context hooks from new stores
import { useAuthStore, useTenantStore, useEffectiveTenantId } from '../store';
import { useServices, useBanners, useSettings, useTerms, useAllServices, useAllBanners } from '../hooks/useQueries';

// Create a hook that mimics old useApp
export const useApp = () => {
  const tenant = useTenantStore((state: any) => state.tenant);
  const loading = useTenantStore((state: any) => state.loading);
  const user = useAuthStore((state: any) => state.user);
  const userTenantId = useAuthStore((state: any) => state.userTenantId);
  
  // Get data from React Query
  const servicesQuery = useServices();
  const bannersQuery = useBanners();
  const settingsQuery = useSettings();
  const termsQuery = useTerms();
  
  return {
    // Auth
    user,
    userTenantId,
    
    // Tenant
    tenant,
    hasTenant: !!tenant,
    loading: loading || servicesQuery.isLoading,
    
    // Data
    services: servicesQuery.data || [],
    banners: bannersQuery.data || [],
    settings: settingsQuery.data || {
      logo: '',
      whatsappNumber: '',
      contactEmail: '',
      siteName: 'Mi Tienda',
      primaryColor: '#E50914',
      secondaryColor: '#1A1A1A'
    },
    terms: termsQuery.data || '',
    
    // For admin: get all (including inactive)
    allServices: useAllServices().data || [],
    allBanners: useAllBanners().data || [],
  };
};

// Re-export useTenant for compatibility
export const useTenant = useTenantStore;

// Also export the stores directly
export { useAuthStore };
