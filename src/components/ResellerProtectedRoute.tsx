import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Loader from './Loader';
import type { ReactNode } from 'react';

interface ResellerProtectedRouteProps {
  children: ReactNode;
}

const ResellerProtectedRoute = ({ children }: ResellerProtectedRouteProps): JSX.Element => {
  const { adminUser, role, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return <Loader />;
  }

  if (!adminUser || role !== 'reseller') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ResellerProtectedRoute;
