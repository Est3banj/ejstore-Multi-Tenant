import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { detectTenantFromUrl, getTenantById } from '../services/tenant';
import { TENANT_DEFAULTS } from '../types';

const TenantContext = createContext();

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
};

export const TenantProvider = ({ children }) => {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTenant = useCallback(async (tenantId) => {
    if (!tenantId) {
      setError('No tenant specified');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const tenantData = await getTenantById(tenantId);
    
    if (tenantData) {
      setTenant({ ...TENANT_DEFAULTS, ...tenantData });
    } else {
      setError('Tenant no encontrado');
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    const tenantId = detectTenantFromUrl();
    if (tenantId) {
      loadTenant(tenantId);
    } else {
      setError('No tenant especificado en la URL');
      setLoading(false);
    }
  }, [loadTenant]);

  const value = {
    tenant,
    loading,
    error,
    hasTenant: !!tenant,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};