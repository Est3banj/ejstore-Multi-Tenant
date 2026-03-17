import { Suspense, lazy, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import NoTenantPage from './components/NoTenantPage';

const Home = lazy(() => import('./pages/Home'));
const Product = lazy(() => import('./pages/Product'));
const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Services = lazy(() => import('./pages/admin/Services'));
const Banners = lazy(() => import('./pages/admin/Banners'));
const Terms = lazy(() => import('./pages/admin/Terms'));
const Settings = lazy(() => import('./pages/admin/Settings'));

const PublicRoutes = () => {
  const { loading: tenantLoading, hasTenant, error } = useTenant();
  const { loading: appLoading } = useApp();
  
  if (tenantLoading || appLoading) {
    return <Loader />;
  }

  // Si no hay tenant, mostrar página de error (excepto rutas admin)
  if (!hasTenant) {
    return <NoTenantPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="servicio/:id" element={<Product />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const AdminRoutes = () => {
  return (
    <Routes>
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="banners" element={<Banners />} />
        <Route path="terms" element={<Terms />} />
        <Route path="settings" element={<Settings />} />
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  
  // Las rutas de admin no requieren tenant
  const isAdminRoute = location.pathname.startsWith('/admin');
  
  if (isAdminRoute) {
    return <AdminRoutes />;
  }
  
  return <PublicRoutes />;
};

function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <AppProvider>
          <Suspense fallback={<Loader />}>
            <AppRoutes />
          </Suspense>
        </AppProvider>
      </TenantProvider>
    </BrowserRouter>
  );
}

export default App;