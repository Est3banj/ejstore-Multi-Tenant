import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const Header = () => {
  const { settings } = useApp();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleNavigation = (e, targetId) => {
    // If we are on the home page, prevent default navigation and scroll
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
      setMobileMenuOpen(false);
    }
    // If not on home page, normal navigation happens (to /#id), 
    // and MainLayout (or a useEffect here) can handle the scroll after load.
    // However, for better UX, we'll let Link handle the routing, and 
    // we can rely on a global scroll handler or simple timeout if needed.
    // But for this implementation, let's keep it simple:

    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 glass-dark backdrop-blur-lg">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-3"
            onClick={(e) => handleNavigation(e, null)}
          >
            {settings.logo ? (
              <img src={settings.logo} alt="Logo" className="h-10 w-auto" />
            ) : (
              <h1 className="text-2xl font-bold gradient-text">
                {settings.siteName || 'EJStore'}
              </h1>
            )}
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-6">
            <Link
              to="/"
              onClick={(e) => handleNavigation(e, null)}
              className={`px-4 py-2 rounded-lg transition-all ${isActive('/') && !location.hash
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                : 'text-white/80 hover:text-white hover:bg-white/5'
                }`}
            >
              Inicio
            </Link>
            <Link
              to="/#categorias"
              onClick={(e) => handleNavigation(e, 'categorias')}
              className="px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-all"
            >
              Categorías
            </Link>
            <Link
              to="/#servicios"
              onClick={(e) => handleNavigation(e, 'servicios')}
              className="px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-all"
            >
              Servicios
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 space-y-2">
            <Link
              to="/"
              onClick={(e) => handleNavigation(e, null)}
              className={`block px-4 py-2 rounded-lg ${isActive('/') && !location.hash
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                : 'text-white/80 hover:text-white hover:bg-white/5'
                }`}
            >
              Inicio
            </Link>
            <Link
              to="/#categorias"
              onClick={(e) => handleNavigation(e, 'categorias')}
              className="block px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5"
            >
              Categorías
            </Link>
            <Link
              to="/#servicios"
              onClick={(e) => handleNavigation(e, 'servicios')}
              className="block px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5"
            >
              Servicios
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;

