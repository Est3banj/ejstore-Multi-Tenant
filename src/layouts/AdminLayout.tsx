import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { logout } from '../services/auth';
import { Menu, X, LayoutDashboard, Package, Image, FileText, Settings, LogOut, LucideIcon, Gift } from 'lucide-react';

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const AdminLayout = (): JSX.Element => {
  const { user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
      navigate('/admin/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const menuItems: MenuItem[] = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/services', label: 'Servicios', icon: Package },
    { path: '/admin/banners', label: 'Banners', icon: Image },
    { path: '/admin/roulette', label: 'Ruleta', icon: Gift },
    { path: '/admin/terms', label: 'Términos', icon: FileText },
    { path: '/admin/settings', label: 'Configuración', icon: Settings }
  ];

  if (!user) {
    return <></>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-dark-100 to-black">
      {/* Mobile Header */}
      <div className="md:hidden glass-dark border-b border-white/10 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold gradient-text">Admin</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed md:static inset-y-0 left-0 z-30 glass-dark border-r border-white/10 w-64 transition-transform duration-300 md:translate-x-0`}
        >
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold gradient-text">Panel Admin</h2>
            <p className="text-white/50 text-sm mt-1">{user.email}</p>
          </div>

          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
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
        <main className="flex-1 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
