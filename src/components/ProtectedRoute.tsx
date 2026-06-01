import { Navigate } from 'react-router-dom';
import { useAdminAuthStore } from '../store/authStore';
import Loader from './Loader';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps): JSX.Element => {
  const { user, isAdmin, loading, initialized } = useAdminAuthStore();

  if (!initialized || loading) {
    return <Loader />;
  }

  // Solo permitir acceso si es admin (tiene tenantId en la colección users)
  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
