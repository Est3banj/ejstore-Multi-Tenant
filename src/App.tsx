import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider, useAuthStore, useTenantStore } from './store';
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
const RouletteSettings = lazy(() => import('./pages/admin/RouletteSettings'));
const Recharges = lazy(() => import('./pages/admin/Recharges'));

// Hook que combina loading states
const useAppLoading = () => {
  const tenantLoading = useTenantStore((state) => state.loading);
  const authLoading = useAuthStore((state) => state.loading);
  const initialized = useAuthStore((state) => state.initialized);
  
  return tenantLoading || authLoading || !initialized;
};

const PublicRoutes = () => {
  const { loading, tenant } = useTenantStore();
  const appLoading = useAppLoading();
  const hasTenant = !!tenant;
  
  if (loading || appLoading) {
    return <Loader />;
  }

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
        <Route path="roulette" element={<RouletteSettings />} />
          <Route path="recargas" element={<Recharges />} />
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  
  if (isAdminRoute) {
    return <AdminRoutes />;
  }
  
  return <PublicRoutes />;
};

function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Suspense fallback={<Loader />}>
          <AppRoutes />
        </Suspense>
      </StoreProvider>
    </BrowserRouter>
  );
}

export default App;
