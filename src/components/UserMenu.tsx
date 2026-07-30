import { useLocation, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { Plus, Wallet, ShoppingBag, History, LogOut } from 'lucide-react';

interface UserMenuProps {
  variant: 'desktop' | 'mobile';
  onRecharge: () => void;
  onCloseMobile?: () => void;
}

const UserMenu = ({ variant, onRecharge, onCloseMobile }: UserMenuProps) => {
  const { user, customer, logout } = useAuthStore();
  const { settings } = useApp();
  const location = useLocation();

  const isActive = (path: string): boolean => location.pathname === path;

  const getBtnStyle = () => {
    const primary = settings?.primaryColor || '#E50914';
    return {
      background: `linear-gradient(135deg, ${primary}, ${primary}dd)`,
      boxShadow: `0 4px 15px -3px ${primary}80`
    };
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleLogin = () => {
    window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'login' }));
  };

  if (variant === 'desktop') {
    return (
      <div className="hidden md:flex items-center gap-3">
        {user && customer ? (
          <>
            <button
              onClick={onRecharge}
              className="flex items-center gap-1 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-all"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">Cargar</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg">
              <Wallet size={16} className="text-yellow-400" />
              <span className="text-white font-medium">${customer.balance.toLocaleString()}</span>
            </div>
            <Link
              to="/mis-servicios"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                isActive('/mis-servicios')
                  ? 'bg-primary-600 text-white'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <ShoppingBag size={16} />
              <span className="text-sm font-medium">Mis Servicios</span>
            </Link>
            <Link
              to="/historial-recargas"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                isActive('/historial-recargas')
                  ? 'bg-primary-600 text-white'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <History size={16} />
              <span className="text-sm font-medium">Recargas</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            >
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogin}
            className="py-2 px-4 text-sm text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105"
            style={getBtnStyle()}
          >
            Login
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {user && customer ? (
        <>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg">
            <Wallet size={16} className="text-yellow-400" />
            <span className="text-white font-medium">${customer.balance.toLocaleString()}</span>
          </div>
          <button
            onClick={() => { onRecharge(); onCloseMobile?.(); }}
            className="flex items-center gap-2 w-full px-4 py-2 text-yellow-400 hover:bg-yellow-500/10 rounded-lg"
          >
            <Plus size={16} />
            Recargar saldo
          </button>
          <Link
            to="/mis-servicios"
            onClick={onCloseMobile}
            className={`flex items-center gap-2 w-full px-4 py-2 rounded-lg ${
              isActive('/mis-servicios')
                ? 'bg-primary-600 text-white'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShoppingBag size={16} />
            Mis Servicios
          </Link>
          <Link
            to="/historial-recargas"
            onClick={onCloseMobile}
            className={`flex items-center gap-2 w-full px-4 py-2 rounded-lg ${
              isActive('/historial-recargas')
                ? 'bg-primary-600 text-white'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <History size={16} />
            Recargas
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-4 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </>
      ) : (
        <button
          onClick={handleLogin}
          className="w-full py-2 mt-2 text-white font-semibold rounded-lg transition-all duration-300 transform hover:scale-105"
          style={getBtnStyle()}
        >
          Login
        </button>
      )}
    </>
  );
};

export default UserMenu;
