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
