import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthChange } from '../services/auth';
import { getServices, getBanners, getSettings, getTerms } from '../services/firestore';
import { useTenant } from './TenantContext';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const { tenant, loading: tenantLoading, hasTenant } = useTenant();
  
  const [user, setUser] = useState(null);
  const [userTenantId, setUserTenantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [banners, setBanners] = useState([]);
  const [settings, setSettings] = useState({
    logo: '',
    whatsappNumber: '',
    contactEmail: '',
    siteName: 'EJStore',
    primaryColor: '#E50914',
    secondaryColor: '#1A1A1A'
  });
  const [terms, setTerms] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const { checkUserRole } = await import('../services/auth');
        const userData = await checkUserRole(currentUser.uid);
        if (userData?.tenantId) {
          setUserTenantId(userData.tenantId);
        }
      } else {
        setUserTenantId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadTenantData = useCallback(async (tenantId) => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      const [servicesData, bannersData, settingsData, termsData] = await Promise.all([
        getServices(tenantId),
        getBanners(tenantId),
        getSettings(tenantId),
        getTerms(tenantId)
      ]);
      
      setServices(servicesData || []);
      setBanners(bannersData || []);
      setSettings(settingsData || {
        logo: '',
        whatsappNumber: '',
        contactEmail: '',
        siteName: 'Mi Tienda',
        primaryColor: '#E50914',
        secondaryColor: '#1A1A1A'
      });
      setTerms(termsData || '');
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar datos cuando cambia userTenantId (para el admin)
  useEffect(() => {
    if (userTenantId && !tenant?.id) {
      loadTenantData(userTenantId);
    }
  }, [userTenantId, tenant?.id]);

  useEffect(() => {
    if (hasTenant && tenant?.id) {
      loadTenantData(tenant.id);
    } else if (!tenantLoading && !userTenantId) {
      setLoading(false);
    }
  }, [tenant, tenantLoading, hasTenant, userTenantId, loadTenantData]);

  const refreshServices = useCallback(async () => {
    const effectiveTenantId = tenant?.id || userTenantId;
    if (!effectiveTenantId) return;
    try {
      const servicesData = await getServices(effectiveTenantId);
      setServices(servicesData);
    } catch (error) {
      console.error('Error refreshing services:', error);
    }
  }, [tenant?.id, userTenantId]);

  const refreshBanners = useCallback(async () => {
    const effectiveTenantId = tenant?.id || userTenantId;
    if (!effectiveTenantId) return;
    try {
      const bannersData = await getBanners(effectiveTenantId);
      setBanners(bannersData);
    } catch (error) {
      console.error('Error refreshing banners:', error);
    }
  }, [tenant?.id, userTenantId]);

  const refreshSettings = useCallback(async () => {
    const effectiveTenantId = tenant?.id || userTenantId;
    if (!effectiveTenantId) return;
    try {
      const settingsData = await getSettings(effectiveTenantId);
      setSettings(settingsData);
    } catch (error) {
      console.error('Error refreshing settings:', error);
    }
  }, [tenant?.id, userTenantId]);

  const refreshTerms = useCallback(async () => {
    const effectiveTenantId = tenant?.id || userTenantId;
    if (!effectiveTenantId) return;
    try {
      const termsData = await getTerms(effectiveTenantId);
      setTerms(termsData);
    } catch (error) {
      console.error('Error refreshing terms:', error);
    }
  }, [tenant?.id, userTenantId]);

  const value = {
    user,
    userTenantId,
    loading: loading || tenantLoading,
    services,
    banners,
    settings,
    terms,
    tenant,
    refreshServices,
    refreshBanners,
    refreshSettings,
    refreshTerms
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};