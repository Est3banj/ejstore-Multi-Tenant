import { type ReactNode } from 'react';
import { useAuthStore } from './authStore';
import { useTenantStore } from './tenantStore';
import { useEffect, type ReactElement } from 'react';

// Combined tenant ID (from URL or logged-in user)
export const useEffectiveTenantId = () => {
  const tenant = useTenantStore((state) => state.tenant);
  const userTenantId = useAuthStore((state) => state.userTenantId);
  
  return tenant?.id || userTenantId;
};

// Store provider component that initializes everything
interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider = ({ children }: StoreProviderProps): ReactElement => {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeTenant = useTenantStore((state) => state.initialize);

  useEffect(() => {
    const unsubscribeAuth = initializeAuth();
    initializeTenant();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [initializeAuth, initializeTenant]);

  return children as ReactElement;
};

// Re-export hooks for convenience
export { useAuthStore, useTenantStore };
export { useMarketplaceStore } from './marketplaceStore';
