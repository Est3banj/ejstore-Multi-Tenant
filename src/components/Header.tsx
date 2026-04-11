import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import { Menu, X, User, LogOut, Wallet, Plus, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createRechargeRequest } from '../services/firestore';

// Configuración de Telegram (hardcodeada para evitar Cloud Functions)
const TELEGRAM_BOT_TOKEN = '8597739575:AAFuw__aMizR6sSPfUx6bU9da_r4PlNjnuI';
const ADMIN_CHAT_ID = '1666952441';

// Función para enviar mensaje a Telegram
async function sendTelegramMessage(text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('Error sending to Telegram:', error);
  }
}

const Header = (): JSX.Element => {
  const { settings } = useApp();
  const { user, customer, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [toast, setToast] = useState<{message: string; type: 'error' | 'success'} | null>(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const showRechargeToast = (msg: string, type: 'error'|'success') => showToast(msg, type);

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

  // Toast helper
  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Escuchar eventos para abrir modal de auth desde otros componentes
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

  // Escuchar eventos para abrir modal de recarga desde otros componentes (ej: ruleta)
  useEffect(() => {
    const handleOpenRecharge = () => {
      setShowRechargeModal(true);
    };
    window.addEventListener('openRechargeModal', handleOpenRecharge);
    return () => window.removeEventListener('openRechargeModal', handleOpenRecharge);
  }, []);

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
                  <button
                    onClick={() => setShowRechargeModal(true)}
                    className="flex items-center gap-1 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-all"
                  >
                    <Plus size={16} />
                    <span className="text-sm font-medium">Cargar</span>
                  </button>
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
                    onClick={() => { setShowRechargeModal(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-yellow-400 hover:bg-yellow-500/10 rounded-lg"
                  >
                    <Plus size={16} />
                    Recargar saldo
                  </button>
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

      {/* Recharge Modal */}
      <AnimatePresence>
        {showRechargeModal && (
          <RechargeModal onClose={() => setShowRechargeModal(false)} />
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
  const [showPassword, setShowPassword] = useState(false);
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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

// Modal para recargar saldo
const RechargeModal = ({ onClose }: { onClose: () => void }) => {
  const { customer, refreshCustomer } = useAuthStore();
  const { settings } = useApp();
  const tenantId = useTenantStore((state: any) => state.tenant?.id || state.userTenantId);
  const [step, setStep] = useState<'select' | 'transfer' | 'confirm'>('select');
  const [amount, setAmount] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'error'|'success'} | null>(null);

  // Toast helper
  const showToast = (msg: string, type: 'error'|'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Configuración de BRE-B
  const BRE_B_KEY = '0035443571';
  const bankInfo = 'BRE-B - GIO TECH'; // BRE-B soporta transferencias de cualquier banco

  const handleWhatsapp = () => {
    const message = encodeURIComponent('Hola, quiero recargar saldo en mi cuenta. ¿Me puedes ayudar?');
    const whatsappNumber = settings.whatsappNumber || '3101234567';
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const handleTransfer = () => {
    if (!amount || parseInt(amount) < 1000) {
      showToast('Por favor ingresa un monto válido (mínimo $1,000)');
      return;
    }
    setStep('transfer');
  };

  const handleConfirmPayment = async () => {
    if (!fullName || !amount) {
      showToast('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    
    const now = new Date();
    const fechaHora = now.toLocaleString('es-CO', { 
      timeZone: 'America/Bogota',
      dateStyle: 'full',
      timeStyle: 'short'
    });
    
    const message = `
💰 *NUEVA SOLICITUD DE RECARGA*
━━━━━━━━━━━━
👤 *Nombre:* ${fullName}
📱 *WhatsApp:* ${customer?.phone || 'No registrado'}
💵 *Monto:* $${parseInt(amount).toLocaleString()} COP
🕐 *Fecha:* ${fechaHora}
━━━━━━━━━━━━
*Para APROBAR:* responder con: ✅ +monto
*Para RECHAZAR:* responder con: ❌ +motivo
`;

    try {
      // Guardar en Firestore
      await createRechargeRequest({
        tenantId: tenantId || '',
        customerId: customer?.uid || '',
        customerName: fullName,
        customerPhone: customer?.phone || '',
        amount: parseInt(amount)
      });
      
      // Notificar a Telegram
      await sendTelegramMessage(message);
      
      // Mostrar toast y cerrar automáticamente después de 2 segundos
      showToast('✅ Tu recarga ha sido registrada. Será validada y cargada en minutos.', 'success');
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      showToast('Error al procesar la solicitud. Intenta de nuevo.');
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

        {step === 'select' && (
          <>
            <h2 className="text-2xl font-bold gradient-text mb-2">Cargar Saldo</h2>
            <p className="text-white/60 text-sm mb-4">Tu saldo actual: <span className="text-yellow-400 font-bold">${customer?.balance?.toLocaleString() || 0}</span></p>

            <div className="mb-4">
              <label className="block text-sm text-white/70 mb-1">Monto a cargar (COP)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input-field"
                placeholder="Ej: 10000"
                min={1000}
              />
              <p className="text-white/40 text-xs mt-1">Monto mínimo: $1,000 COP</p>
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleWhatsapp}
                className="w-full bg-green-500 hover:bg-green-600 text-white py-4 px-4 rounded-xl flex items-center gap-3 transition-all"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.195.194 1.666.179.47-.015 1.725-.652 1.972-1.469.247-.817.347-1.732.372-1.817.025-.085.025-.16.05-.248.025-.098.05-.198.075-.298.049-.099.124-.199.199-.347.074-.149.124-.298.174-.447.05-.149.025-.298-.025-.447-.049-.149-.174-.298-.347-.447-.174-.149-.347-.223-.52-.298-.174-.074-.347-.149-.52-.223-.174-.074-.298-.124-.447-.174-.149-.05-.223-.124-.298-.174-.074-.05-.124-.074-.174-.099-.149-.025-.223-.074-.298-.124-.074-.049-.149-.099-.223-.149z"/>
                </svg>
                <div className="text-left">
                  <div className="font-bold">Hablar con asesor</div>
                  <div className="text-xs text-white/80">Te atendemos por WhatsApp</div>
                </div>
              </button>

              <button 
                onClick={handleTransfer}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-4 rounded-xl flex items-center gap-3 transition-all"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <div className="text-left">
                  <div className="font-bold">Transferencia BRE-B</div>
                  <div className="text-xs text-white/80">Desde cualquier banco</div>
                </div>
              </button>
            </div>
          </>
        )}

        {step === 'transfer' && (
          <>
            <button onClick={() => setStep('select')} className="text-white/50 hover:text-white mb-2 flex items-center gap-1 text-sm">
              ← Volver
            </button>
            <h2 className="text-xl font-bold gradient-text mb-4">Datos para transferir</h2>
            
            <div className="bg-white/5 rounded-xl p-4 space-y-3 mb-4">
              {/* QR Image si está configurado */}
              {settings.qrImage && (
                <div className="text-center">
                  <img src={settings.qrImage} alt="QR" className="w-40 h-40 mx-auto rounded-lg" />
                  <p className="text-white/50 text-xs mt-1">Escanea para pagar</p>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-white/60">Banco:</span>
                <span className="font-bold text-white">{bankInfo}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">CLAVE BRE-B:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary-400 text-lg">{BRE_B_KEY}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(BRE_B_KEY)}
                    className="text-white/40 hover:text-white"
                    title="Copiar"
                  >
                    📋
                  </button>
                </div>
              </div>
              <div className="border-t border-white/10 pt-2 mt-2">
                <p className="text-yellow-400 text-sm text-center">Monto a transferir: <span className="font-bold text-lg">${parseInt(amount || '0').toLocaleString()} COP</span></p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/70 mb-1">Nombre completo (como aparece en la transferencia)</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="input-field"
                  placeholder="Juan Perez"
                  required
                />
              </div>
              <button 
                onClick={handleConfirmPayment}
                disabled={loading || !fullName}
                className="btn-primary w-full py-3"
              >
                {loading ? 'Enviando...' : 'Ya realicé la transferencia'}
              </button>
            </div>
          </>
        )}

        <div className="mt-4 p-3 bg-white/5 rounded-lg">
          <p className="text-white/50 text-xs text-center">
            💡 Tu recarga será verificada y confirmada manualmente
          </p>
        </div>

        {/* Toast notification - centered at top */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className={`fixed top-20 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl z-50 ${
                toast.type === 'error' 
                  ? 'bg-red-500/90 text-white' 
                  : 'bg-green-500/90 text-white'
              }`}
            >
              <p className="font-medium">{toast.msg}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default Header;
