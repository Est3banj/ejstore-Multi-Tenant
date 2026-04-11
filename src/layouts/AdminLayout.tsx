import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/auth';
import { Menu, X, LayoutDashboard, Package, Image, FileText, Settings, LogOut, LucideIcon, Gift, Wallet, Users, Store } from 'lucide-react';

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const AdminLayout = (): JSX.Element => {
  const { user } = useApp();
  const { role } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const menuItems: MenuItem[] = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/services', label: 'Servicios', icon: Package },
    { path: '/admin/banners', label: 'Banners', icon: Image },
    { path: '/admin/roulette', label: 'Ruleta', icon: Gift },
    { path: '/admin/recargas', label: 'Recargas', icon: Wallet },
    { path: '/admin/terms', label: 'Términos', icon: FileText },
    { path: '/admin/settings', label: 'Configuración', icon: Settings }
  ];

  const superadminMenuItems: MenuItem[] = [
    { path: '/admin/tenants', label: 'Tiendas', icon: Store },
    { path: '/admin/admins', label: 'Admins', icon: Users }
  ];

  const isSuperadmin = role === 'superadmin';

  if (!user) {
    return <></>;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-dark-100 to-black flex">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/10 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold gradient-text">Admin</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white p-2"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay para cerrar sidebar en mobile */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-30 pointer-events-auto"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          glass-dark border-r border-white/10 w-64
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col
        `}
      >
        <div className="p-6 border-b border-white/10 flex-shrink-0">
          <h2 className="text-2xl font-bold gradient-text">Panel Admin</h2>
          <p className="text-white/50 text-sm mt-1 truncate">{user.email}</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive(item.path)
                    ? 'bg-primary-600 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isSuperadmin && (
            <>
              <div className="pt-4 pb-2">
                <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider px-4">
                  Superadmin
                </span>
              </div>
              {superadminMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                      isActive(item.path)
                        ? 'bg-yellow-600 text-white'
                        : 'text-yellow-400 hover:text-yellow-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main 
        ref={mainRef}
        className="flex-1 min-h-screen overflow-y-auto pointer-events-auto"
        style={{ position: 'relative', zIndex: 0 }}
      >
        <div className="md:pt-0 pt-16">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;