import { login as loginService, register as registerService } from '../services/auth';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import { detectTenantFromUrl } from '../services/tenant';

export const useAuth = () => {
  const { refreshCustomer } = useAuthStore();
  // Obtener el tenant actual desde el store
  const tenant = useTenantStore((state) => state.tenant);

  const login = async (email: string, password: string) => {
    const user = await loginService(email, password);
    return user;
  };

  const register = async (
    email: string, 
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    // Obtener el tenantId desde el store O desde la URL como fallback
    // La URL es más confiable porque se determina antes de que el store esté listo
    const currentTenantId = tenant?.id || detectTenantFromUrl() || undefined;
    const user = await registerService(email, password, firstName, lastName, phone, currentTenantId);
    await refreshCustomer();
    return user;
  };

  return { login, register };
};