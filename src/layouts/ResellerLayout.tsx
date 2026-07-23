import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logout } from '../services/auth';
import { getResellerById } from '../services/marketplace';
import {
  Menu,
  X,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Settings,
  LogOut,
  LucideIcon,
  Wallet,
  Flag,
  Search,
} from 'lucide-react';

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const ResellerLayout = (): JSX.Element => {
  const { user, role: _role } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resellerData, setResellerData] = useState<{
    name: string;
    balance: number;
  } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      getResellerById(user.uid)
        .then((data) => {
          if (data) {
            setResellerData({
              name: data.name || user.email || '',
              balance: data.balance || 0,
            });
          }
        })
        .catch(console.error);
    }
  }, [user]);

  const menuItems: MenuItem[] = [
    { path: '/r/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/r/catalogo', label: 'Catálogo', icon: Package },
    { path: '/r/clientes', label: 'Mis Clientes', icon: ShoppingBag },
    { path: '/r/consultar-codigo', label: 'Consultar Códigos', icon: Search },
    { path: '/r/reportar', label: 'Reportar', icon: Flag },
    { path: '/r/perfil', label: 'Perfil', icon: Settings },
  ];

  if (!user) {
    return <></>;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-dark-100 to-black flex">
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/10 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold gradient-text">Subdistribuidor</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white p-2"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30 pointer-events-auto"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
          <h2 className="text-2xl font-bold gradient-text">Subdistribuidor</h2>
          <p className="text-white/50 text-sm mt-1 truncate">
            {resellerData?.name || user.email}
          </p>
          {resellerData && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-yellow-500/10 rounded-lg">
              <Wallet size={16} className="text-yellow-400" />
              <span className="text-yellow-400 font-medium text-sm">
                ${resellerData.balance.toLocaleString()}
              </span>
            </div>
          )}
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

export default ResellerLayout;