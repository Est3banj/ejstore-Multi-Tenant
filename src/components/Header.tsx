import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Menu, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import AuthModal from './AuthModal';
import { RechargeModal } from './RechargeModal';
import UserMenu from './UserMenu';
import DesktopNav from './DesktopNav';
import MobileNav from './MobileNav';

const Header = (): JSX.Element => {
  const { settings } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  useEffect(() => {
    const handleOpenAuth = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === 'register') {
        setAuthMode('register');
      } else {
        setAuthMode('login');
      }
      setShowAuthModal(true);
    };
    window.addEventListener('openAuthModal', handleOpenAuth);
    return () => window.removeEventListener('openAuthModal', handleOpenAuth);
  }, []);

  useEffect(() => {
    const handleOpenRecharge = () => {
      setShowRechargeModal(true);
    };
    window.addEventListener('openRechargeModal', handleOpenRecharge);

    const params = new URLSearchParams(window.location.search);
    if (params.get('recarga') === '1') {
      setShowRechargeModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => window.removeEventListener('openRechargeModal', handleOpenRecharge);
  }, []);

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (window.location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 glass-dark backdrop-blur-lg">
        <nav className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center space-x-3"
              onClick={handleLogoClick}
            >
              {settings.logo ? (
                <img src={settings.logo} alt="Logo" className="h-10 w-auto" />
              ) : (
                <h1 className="text-2xl font-bold gradient-text">
                  {settings.siteName || 'EJStore'}
                </h1>
              )}
            </Link>

            <DesktopNav />

            <UserMenu variant="desktop" onRecharge={() => setShowRechargeModal(true)} />

            <button
              className="md:hidden text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          <MobileNav
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            onRecharge={() => setShowRechargeModal(true)}
          />
        </nav>
      </header>

      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            mode={authMode}
            onModeChange={setAuthMode}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRechargeModal && (
          <RechargeModal onClose={() => setShowRechargeModal(false)} />
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
