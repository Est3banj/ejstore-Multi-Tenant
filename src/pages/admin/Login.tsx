import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useAuthStore, useTenantStore } from '../../store';
import { motion } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const { settings } = useTenantStore();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    loginAttempted.current = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-dark-100 to-black px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-dark p-8 rounded-2xl w-full max-w-md"
      >
        <h1 className="text-3xl font-bold text-center mb-8 gradient-text">
          Iniciar Sesión
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-white/70 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="admin@ejstore.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10 pr-10"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary disabled:opacity-50"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;

