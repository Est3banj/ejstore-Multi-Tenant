import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Loader from './Loader';
import type { ReactNode } from 'react';

interface ResellerProtectedRouteProps {
  children: ReactNode;
}

const ResellerProtectedRoute = ({ children }: ResellerProtectedRouteProps): JSX.Element => {
  const { user, role, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return <Loader />;
  }

  if (!user || role !== 'reseller') {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

export default ResellerProtectedRoute;
