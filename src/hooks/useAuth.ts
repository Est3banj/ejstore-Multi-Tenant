import { login as loginService, register as registerService } from '../services/auth';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';

export const useAuth = () => {
  const { setCustomer, refreshCustomer } = useAuthStore();
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
    // Obtener el tenantId actual para asociar el cliente con la tienda correcta
    const currentTenantId = tenant?.id || undefined;
    const user = await registerService(email, password, firstName, lastName, phone, currentTenantId);
    await refreshCustomer();
    return user;
  };

  return { login, register };
};