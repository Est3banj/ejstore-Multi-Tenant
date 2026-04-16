import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift } from 'lucide-react';

interface HSL {
  h: number;
  s: number;
  l: number;
}

const hexToHsl = (hex: string): HSL => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number, s: number, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
      default: h = 0;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

const MainLayout = (): JSX.Element => {
  const location = useLocation();
  const { settings, tenant, loading } = useApp();
  const { user } = useAuthStore();
  const [showMarketingBanner, setShowMarketingBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    // Mostrar banner solo si no está logueado y no se ha cerrado antes
    if (!user && !bannerDismissed) {
      // Pequeño delay para que no aparecezca inmediatamente
      const timer = setTimeout(() => {
        setShowMarketingBanner(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [user, bannerDismissed]);

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.substring(1));
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } else if (location.pathname === '/') {
      window.scrollTo(0, 0);
    }
  }, [location]);

  useEffect(() => {
    if (settings?.primaryColor) {
      const root = document.documentElement;
      const primary = settings.primaryColor || '#E50914';
      const secondary = settings.secondaryColor || '#1A1A1A';
      
      const primaryHsl = hexToHsl(primary);
      const secondaryHsl = hexToHsl(secondary);
      
      // Aplicar variables CSS para Tailwind
      root.style.setProperty('--primary', `${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%`);
      root.style.setProperty('--primary-foreground', '0 0% 100%');
      root.style.setProperty('--secondary', `${secondaryHsl.h} ${secondaryHsl.s}% ${secondaryHsl.l}%`);
      root.style.setProperty('--secondary-foreground', '0 0% 100%');
      root.style.setProperty('--ring', `${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%`);
      
      // Crear estilos dinámicos para elementos Tailwind hardcodeados
      let styleElement = document.getElementById('tenant-colors');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'tenant-colors';
        document.head.appendChild(styleElement);
      }
      
      // Generar clases dinámicas basadas en los colores del tenant
      // Colores base del tenant
      const primaryHex = primary;
      const secondaryHex = secondary;
      
      // Para el rojo que está hardcodeado, usamos el color primario
      styleElement.textContent = `
        /* Reemplazar rojo con el color primario del tenant */
        .text-red-400, .text-red-500, .text-red-600 { color: ${primaryHex} !important; }
        .bg-red-500, .bg-red-600, .bg-red-500\\/20 { background-color: ${primaryHex} !important; }
        .border-red-500 { border-color: ${primaryHex} !important; }
        .hover\\:text-red-400:hover { color: ${primaryHex} !important; }
        .hover\\:bg-red-500\\/10:hover { background-color: ${primaryHex}20 !important; }
        .hover\\:bg-red-500\\/30:hover { background-color: ${primaryHex}40 !important; }
        
/* Sombras con rojo - más específico */
        .shadow-red-500\/30, .shadow-primary-500\/30 { 
          --tw-shadow-color: ${primaryHex}50 !important; 
        }
        .shadow-lg.shadow-primary-500\/30 {
          --tw-shadow-color: ${primaryHex}30 !important;
        }
        
        /* Sobreescribir todas las sombras principales con el color del tenant */
        .shadow-sm { --tw-shadow-color: ${primaryHex}30 !important; }
        .shadow { --tw-shadow-color: ${primaryHex}40 !important; }
        .shadow-md { --tw-shadow-color: ${primaryHex}40 !important; }
        .shadow-lg { --tw-shadow-color: ${primaryHex}40 !important; }
        .shadow-xl { --tw-shadow-color: ${primaryHex}50 !important; }
        .shadow-2xl { --tw-shadow-color: ${primaryHex}50 !important; }
        
        /* Sombras con opacity */
        .shadow-lg\/40 { --tw-shadow-color: ${primaryHex}40 !important; }
        .shadow-xl\/50 { --tw-shadow-color: ${primaryHex}50 !important; }
        .shadow-2xl\/50 { --tw-shadow-color: ${primaryHex}50 !important; }
        .shadow-lg.shadow-primary-500\\/30 {
          --tw-shadow-color: ${primaryHex}30 !important;
        }
        .shadow-xl, .shadow-2xl {
          --tw-shadow-color: ${primaryHex}40 !important;
        }
        
        /* Checkbox y form elements */
        input[type="checkbox"]:checked {
          background-color: ${primaryHex} !important;
          border-color: ${primaryHex} !important;
        }
        
        /* Links de términos y condiciones */
        .text-primary-400, .text-primary-300 {
          color: ${primaryHex} !important;
        }
        .hover\\:text-primary-300:hover {
          color: ${primaryHex}cc !important;
        }
        
        /* Buttons primarios */
        .btn-primary {
          background: linear-gradient(135deg, ${primaryHex}, ${primaryHex}dd) !important;
          border-color: ${primaryHex} !important;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, ${primaryHex}cc, ${primaryHex}aa) !important;
        }
        
        /* Botones rojos forzados */
        .\\!bg-red-500, .bg-red-500\\/90 {
          background-color: ${primaryHex} !important;
        }
        .hover\\:\\!bg-red-600:hover {
          background-color: ${primaryHex}cc !important;
        }
        
        /* Textos destacados */
        .gradient-text {
          background: linear-gradient(135deg, ${primaryHex}, ${primaryHex}dd) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        
        /* Bordes primarios */
        .border-primary, .border-primary-500 {
          border-color: ${primaryHex} !important;
        }
        
        /*Fondos con opacidad del color primario */
        .bg-primary-500\\/10, .bg-primary-500\\/20, .bg-primary-500\\/5 {
          background-color: ${primaryHex}20 !important;
        }
        
        /* Fondos con gradiente hacia rojo */
        .from-primary-500.to-red-600, .from-primary-500.to-red-600\\/5 {
          --tw-gradient-from: ${primaryHex} !important;
          --tw-gradient-to: ${primaryHex}dd !important;
        }
        .from-primary-500\\/10.to-red-600\\/5 {
          --tw-gradient-from: ${primaryHex}20 !important;
          --tw-gradient-to: ${primaryHex}10 !important;
        }
        .from-red-500.to-red-600 {
          --tw-gradient-from: ${primaryHex} !important;
          --tw-gradient-to: ${primaryHex}cc !important;
        }
        .from-yellow-400.via-orange-500.to-red-500 {
          --tw-gradient-stops: var(--tw-gradient-from), #FFD700, var(--tw-gradient-via), ${primaryHex}, var(--tw-gradient-to) !important;
        }
        
        /* Efectos hover primarios */
        .hover\\:border-primary-500\\/50:hover {
          border-color: ${primaryHex}80 !important;
        }
        
        /* Estados activo primary */
        .bg-primary-600 {
          background-color: ${primaryHex} !important;
        }
        .active.bg-primary-600 {
          background-color: ${primaryHex}cc !important;
        }
        
        /* Hover states con bg-primary */
        .hover\\:bg-primary-600:hover {
          background-color: ${primaryHex} !important;
        }
        
        /* Errores/warnings - mantener en rojo para no perder funcionalidad */
        .text-red-400.font-medium, .text-red-500.font-bold, p.text-red-400.text-sm {
          /* Mantener rojo para mensajes de error */
        }
      `;
    }
  }, [settings]);

  useEffect(() => {
    if (tenant) {
      if (tenant.logoUrl) {
        let favicon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (!favicon) {
          favicon = document.createElement('link');
          favicon.rel = 'icon';
          document.head.appendChild(favicon);
        }
        favicon.href = tenant.logoUrl;
      }
      
      if (tenant.name) {
        document.title = `${tenant.name} - Servicios Digitales`;
      }
    }
  }, [tenant]);

  if (loading) {
    return <></>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark">
      {/* Anuncio tipo toast para primera vez - CORNER NOTIFICATION */}
      <AnimatePresence>
        {showMarketingBanner && !user && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            className="fixed top-20 left-4 z-40 max-w-xs"
          >
            <div className="bg-gray-800/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl p-4">
              <button
                onClick={() => {
                  setShowMarketingBanner(false);
                  setBannerDismissed(true);
                }}
                className="absolute top-2 right-2 text-white/40 hover:text-white"
              >
                <X size={14} />
              </button>
              <div className="flex items-start gap-3">
                <div className="text-2xl">🎁</div>
                <div>
                  <p className="text-white font-medium text-sm">
                    ¿Sabías que podés ganar premios gratis?
                  </p>
                  <p className="text-white/60 text-xs mt-1">
                    Mira la ruleta abajo 👇 sorteamos Netflix, HBO y más
                  </p>
                  <button
                    onClick={() => {
                      setShowMarketingBanner(false);
                      window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'register' }));
                    }}
                    className="mt-2 text-xs text-yellow-400 hover:text-yellow-300 font-medium"
                  >
                    ¡Quiero participar! →
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
