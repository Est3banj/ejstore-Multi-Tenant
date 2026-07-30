import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider, useAuthStore, useTenantStore } from './store';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import ResellerLayout from './layouts/ResellerLayout';
import ResellerProtectedRoute from './components/ResellerProtectedRoute';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import NoTenantPage from './components/NoTenantPage';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Home = lazy(() => import('./pages/Home'));
const Product = lazy(() => import('./pages/Product'));
const Login = lazy(() => import('./pages/admin/Login'));
const Clientes = lazy(() => import('./pages/admin/Clientes'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Services = lazy(() => import('./pages/admin/Services'));
const Banners = lazy(() => import('./pages/admin/Banners'));
const Terms = lazy(() => import('./pages/admin/Terms'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const RouletteSettings = lazy(() => import('./pages/admin/RouletteSettings'));
const Recharges = lazy(() => import('./pages/admin/Recharges'));
const PurchaseResult = lazy(() => import('./pages/customer/PurchaseResult'));
const MisServicios = lazy(() => import('./pages/customer/MisServicios'));
const Tenants = lazy(() => import('./pages/admin/Tenants'));
const Admins = lazy(() => import('./pages/admin/Admins'));
const AdminResellers = lazy(() => import('./pages/admin/AdminResellers'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets'));
const EmailConfig = lazy(() => import('./pages/admin/EmailConfig'));
const ResellerDashboard = lazy(() => import('./pages/reseller/ResellerDashboard'));
const CatalogoMayorista = lazy(() => import('./pages/reseller/CatalogoMayorista'));
const MisClientes = lazy(() => import('./pages/reseller/MisClientes'));
const ConsultarCodigo = lazy(() => import('./pages/reseller/ConsultarCodigo'));
const MisReportes = lazy(() => import('./pages/reseller/MisReportes'));
const Perfil = lazy(() => import('./pages/reseller/Perfil'));
const ResellerReportar = lazy(() => import('./pages/reseller/ResellerReportar'));
const HistorialRecargas = lazy(() => import('./pages/recargas/HistorialRecargas'));
const VerCuenta = lazy(() => import('./pages/public/VerCuenta'));

// Hook que combina loading states
const useAppLoading = () => {
  const tenantLoading = useTenantStore((state) => state.loading);
  const authLoading = useAuthStore((state) => state.loading);
  const initialized = useAuthStore((state) => state.initialized);
  
  return tenantLoading || authLoading || !initialized;
};

const PublicRoutes = () => {
  const { loading, tenant, error } = useTenantStore();
  const appLoading = useAppLoading();
  const { role } = useAuthStore();
  const hasTenant = !!tenant;
  
  if (loading || appLoading) {
    return <Loader />;
  }

  // Sin tenant en URL: mostrar Landing Page principal
  if (!hasTenant) {
    // Si hay error (tenant buscado pero no encontrado), mostrar NoTenantPage
    if (error) {
      return <NoTenantPage />;
    }
    // Dominio principal sin ?v= : mostrar landing
    return <LandingPage />;
  }

  return (
    <Routes>
      {/* Public token route — SIN auth, SIN layout, primera en orden */}
      <Route path="/r/:token" element={<VerCuenta />} />

      {role === 'reseller' ? (
        <>
          <Route path="/r" element={<ResellerProtectedRoute><ResellerLayout /></ResellerProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ResellerDashboard />} />
            <Route path="catalogo" element={<CatalogoMayorista />} />
            <Route path="mis-clientes" element={<MisClientes />} />
            <Route path="consultar-codigo" element={<ConsultarCodigo />} />
            <Route path="mis-reportes" element={<MisReportes />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="reportar" element={<ResellerReportar />} />
            <Route path="historial-recargas" element={<HistorialRecargas />} />
          </Route>
          <Route path="*" element={<Navigate to="/r/dashboard" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Home />} />
            <Route path="servicio/:id" element={<Product />} />
            <Route path="compra-exitosa/:purchaseId" element={<PurchaseResult />} />
            <Route path="mis-servicios" element={<MisServicios />} />
            <Route path="historial-recargas" element={<HistorialRecargas />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
};

const AdminRoutes = () => {
  return (
    <Routes>
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="services" element={<Services />} />
        <Route path="banners" element={<Banners />} />
        <Route path="terms" element={<Terms />} />
        <Route path="settings" element={<Settings />} />
        <Route path="roulette" element={<RouletteSettings />} />
        <Route path="recargas" element={<Recharges />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="admins" element={<Admins />} />
        <Route path="resellers" element={<AdminResellers />} />
        <Route path="tickets" element={<AdminTickets />} />
        <Route path="email-config" element={<EmailConfig />} />
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
      </Route>
    </Routes>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  const { role, initialized } = useAuthStore();
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Si viene ?token=xxx, mostrar VerCuenta directamente (sin layouts, sin auth)
  const params = new URLSearchParams(location.search);
  const tokenFromQuery = params.get('token');
  if (tokenFromQuery) {
    return <VerCuenta />;
  }
  
  // /login es la ruta única de login — accesible para TODOS sin importar el role
  if (location.pathname === '/login') {
    return <Login />;
  }
  
  // /admin/login redirige a /login
  if (location.pathname === '/admin/login') {
    return <Navigate to="/login" replace />;
  }
  
  // Reseller routes take priority over admin/public
  if (initialized && role === 'reseller') {
    return <PublicRoutes />;
  }
  
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
