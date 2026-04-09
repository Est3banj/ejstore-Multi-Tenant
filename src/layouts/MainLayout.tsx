import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, UserPlus } from 'lucide-react';

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
      
      root.style.setProperty('--primary', `${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%`);
      root.style.setProperty('--primary-foreground', '0 0% 100%');
      root.style.setProperty('--secondary', `${secondaryHsl.h} ${secondaryHsl.s}% ${secondaryHsl.l}%`);
      root.style.setProperty('--secondary-foreground', '0 0% 100%');
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
      {/* Marketing Banner para primera vez */}
      <AnimatePresence>
        {showMarketingBanner && !user && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary-600 via-primary-500 to-red-500 shadow-lg"
          >
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <Gift className="text-white" size={20} />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">
                    🎰 ¡Regístrate y obtené beneficios exclusivos!
                  </p>
                  <p className="text-white/80 text-xs">
                    Jugá a la ruleta, ganá premios y más...
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'register' }))}
                  className="flex items-center gap-1 bg-white text-primary-600 px-3 py-1.5 rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
                >
                  <UserPlus size={14} />
                  Registrarme
                </button>
                <button
                  onClick={() => {
                    setShowMarketingBanner(false);
                    setBannerDismissed(true);
                  }}
                  className="text-white/70 hover:text-white ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Header />
      <main className={`flex-1 ${showMarketingBanner && !user ? 'pt-16' : ''}`}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
