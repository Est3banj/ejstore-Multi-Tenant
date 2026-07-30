import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import UserMenu from './UserMenu';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  onRecharge: () => void;
}

const MobileNav = ({ isOpen, onClose, onRecharge }: MobileNavProps) => {
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="md:hidden mt-4 space-y-2">
      <Link
        to="/"
        onClick={(e) => handleNavClick(e, null)}
        className={`block px-4 py-2 rounded-lg ${
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
        className="block px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5"
      >
        Categorías
      </Link>
      <Link
        to="/#servicios"
        onClick={(e) => handleNavClick(e, 'servicios')}
        className="block px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5"
      >
        Servicios
      </Link>
      {role === 'reseller' && (
        <Link
          to="/r/dashboard"
          onClick={onClose}
          className={`block px-4 py-2 rounded-lg ${
            location.pathname.startsWith('/r/')
              ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
              : 'text-white/80 hover:text-white hover:bg-white/5'
          }`}
        >
          Panel Subdistribuidor
        </Link>
      )}

      <UserMenu variant="mobile" onRecharge={onRecharge} onCloseMobile={onClose} />
    </div>
  );
};

export default MobileNav;
