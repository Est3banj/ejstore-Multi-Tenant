import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const DesktopNav = () => {
  const { role } = useAuthStore();
  const location = useLocation();

  const isActive = (path: string): boolean => location.pathname === path;

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string | null): void => {
    if (location.pathname === '/') {
      e.preventDefault();
      if (targetId) {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="hidden md:flex items-center space-x-6">
      <Link
        to="/"
        onClick={(e) => handleNavClick(e, null)}
        className={`px-4 py-2 rounded-lg transition-all ${
          isActive('/') && !location.hash
            ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
            : 'text-white/80 hover:text-white hover:bg-white/5'
        }`}
      >
        Inicio
      </Link>
      <Link
        to="/#categorias"
        onClick={(e) => handleNavClick(e, 'categorias')}
        className="px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-all"
      >
        Categorías
      </Link>
      <Link
        to="/#servicios"
        onClick={(e) => handleNavClick(e, 'servicios')}
        className="px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-all"
      >
        Servicios
      </Link>
      {role === 'reseller' && (
        <Link
          to="/r/dashboard"
          className={`px-4 py-2 rounded-lg transition-all ${
            location.pathname.startsWith('/r/')
              ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
              : 'text-white/80 hover:text-white hover:bg-white/5'
          }`}
        >
          Panel Subdistribuidor
        </Link>
      )}
    </div>
  );
};

export default DesktopNav;
