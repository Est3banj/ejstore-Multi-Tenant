import { login as loginService, register as registerService } from '../services/auth';
import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const { setCustomer, refreshCustomer } = useAuthStore();

  const login = async (email: string, password: string) => {
    const user = await loginService(email, password);
    // El store ya carga los datos del cliente en onAuthChange
    return user;
  };

  const register = async (
    email: string, 
    password: string,
    firstName: string,
    lastName: string,
    phone: string
  ) => {
    const user = await registerService(email, password, firstName, lastName, phone);
    // Recargar datos del cliente después del registro
    await refreshCustomer();
    return user;
  };

  return { login, register };
};