import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../../services/auth';
import { useAuthStore, useTenantStore } from '../../store';
import { motion } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import MeshBackground from '../../components/MeshBackground';

const Login = () => {
  const navigate = useNavigate();
  const { tenant: settings } = useTenantStore();
  const storeRole = useAuthStore((s) => s.role);
  const storeInitialized = useAuthStore((s) => s.initialized);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginAttempted = useRef(false); // Solo redirigir si el usuario hizo login explícito

  // Aplicar colores dinámicos del tenant
  useEffect(() => {
    if (settings?.primaryColor) {
      const primary = settings.primaryColor || '#E50914';
      const primaryHex = primary;
      
      let styleElement = document.getElementById('login-tenant-colors');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'login-tenant-colors';
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = `
        .btn-primary {
          background: linear-gradient(135deg, ${primaryHex}, ${primaryHex}dd) !important;
          border-color: ${primaryHex} !important;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, ${primaryHex}cc, ${primaryHex}aa) !important;
        }
        .shadow-primary\\/50 {
          --tw-shadow-color: ${primaryHex}80 !important;
        }
      `;
    }
  }, [settings]);

  // Redirigir SOLO después de un intento de login explícito
  useEffect(() => {
    if (loginAttempted.current && !loading && storeInitialized && storeRole) {
      loginAttempted.current = false;
      if (storeRole === 'reseller') {
        navigate('/r/dashboard', { replace: true });
      } else if (storeRole === 'admin' || storeRole === 'superadmin') {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [storeRole, storeInitialized, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    loginAttempted.current = true;

    try {
      await adminLogin(email, password);
      // No navegamos acá — el useEffect de arriba lo hace
      // cuando el authStore termine de inicializar con el role
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo o contraseña incorrectos');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Intenta más tarde');
      } else if (err.code === 'auth/invalid-email') {
        setError('Correo electrónico inválido');
      } else {
        setError('Error al iniciar sesión. Verifica tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 relative overflow-hidden">
      <MeshBackground />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md px-4"
      >
        <div className="text-center mb-8">
          <img src="/ejstream.png" alt="EJ STREAM" className="h-12 w-auto mx-auto mb-4" />
          <h1 className="text-3xl font-bold gradient-text">Iniciar Sesión</h1>
        </div>

        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-white/60 text-sm mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all"
                  placeholder="juradoesteban001@gmail.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-white/60 text-sm mb-2">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all"
                  placeholder="••••••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-white text-gray-900 font-semibold rounded-xl hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  Iniciando sesión...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-white/30 hover:text-white/60 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al inicio
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;

