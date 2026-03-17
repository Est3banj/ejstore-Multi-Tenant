import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Loader from './Loader';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useApp();

  if (loading) {
    return <Loader />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

export default ProtectedRoute;

