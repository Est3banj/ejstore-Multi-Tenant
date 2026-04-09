import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { useAuth } from '../hooks/useAuth';
import { Menu, X, User, LogOut, Wallet } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Header = (): JSX.Element => {
  const { settings } = useApp();
  const { user, customer, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const isActive = (path: string): boolean => location.pathname === path;

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string | null): void => {
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
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  // Escuchar eventos para abrir modal de auth desde otros componentes
  useState(() => {
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
  });

  return (
    <>
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

            {/* Auth Section - Desktop */}
            <div className="hidden md:flex items-center gap-3">
              {user && customer ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg">
                    <Wallet size={16} className="text-yellow-400" />
                    <span className="text-white font-medium">${customer.balance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <User size={16} className="text-white/70" />
                    <span className="text-white/90 text-sm">{customer.firstName}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  >
                    <LogOut size={16} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                  className="btn-primary py-2 px-4 text-sm"
                >
                  Login
                </button>
              )}
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
              
              {/* Mobile Auth */}
              {user && customer ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg">
                    <Wallet size={16} className="text-yellow-400" />
                    <span className="text-white font-medium">${customer.balance.toLocaleString()}</span>
                  </div>
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
                  onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                  className="btn-primary w-full py-2 mt-2"
                >
                  Login
                </button>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal 
            mode={authMode} 
            onModeChange={setAuthMode} 
            onClose={() => setShowAuthModal(false)} 
          />
        )}
      </AnimatePresence>
    </>
  );
};

// Auth Modal Component
const AuthModal = ({ mode, onModeChange, onClose }: { 
  mode: 'login' | 'register'; 
  onModeChange: (mode: 'login' | 'register') => void;
  onClose: () => void;
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, firstName, lastName, phone);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9 }} 
        animate={{ scale: 1 }} 
        exit={{ scale: 0.9 }}
        className="glass w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-white/50 hover:text-white"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold gradient-text mb-6">
          {mode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm text-white/70 mb-1">Nombre</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Apellido</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="input-field"
                  placeholder="3101234567"
                  required
                />
              </div>
            </>
          )}
          
          <div>
            <label className="block text-sm text-white/70 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-white/70 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary w-full py-3"
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
            className="text-white/60 hover:text-white text-sm"
          >
            {mode === 'login' 
              ? '¿No tienes cuenta? Regístrate' 
              : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Header;
