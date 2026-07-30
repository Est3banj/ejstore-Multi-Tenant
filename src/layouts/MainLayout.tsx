import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import MeshBackground from '../components/MeshBackground';

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
      // Crear estilos dinámicos con la paleta blanca/gris de la landing page
      let styleElement = document.getElementById('tenant-colors');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'tenant-colors';
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = `
        /* Checkbox y form elements */
        input[type="checkbox"]:checked {
          background-color: white !important;
          border-color: white !important;
        }
        
        /* Botones primarios */
        .btn-primary {
          background: white !important;
          color: #111111 !important;
          border-color: #ffffff30 !important;
        }
        .btn-primary:hover {
          background: #f0f0f0 !important;
        }
        
        /* Textos destacados */
        .gradient-text {
          background: linear-gradient(135deg, #ffffff, #888888) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        
        /* Estados activo primary (sidebar, etc) */
        .bg-primary-600 {
          background-color: rgba(255,255,255,0.15) !important;
        }
        .active.bg-primary-600 {
          background-color: rgba(255,255,255,0.25) !important;
        }
        .hover\\:bg-primary-600:hover {
          background-color: rgba(255,255,255,0.15) !important;
        }
        
        /* Fondos con opacidad */
        .bg-primary-500\\/10, .bg-primary-500\\/20, .bg-primary-500\\/5 {
          background-color: rgba(255,255,255,0.1) !important;
        }
        
        /* Textos primarios */
        .text-primary-400, .text-primary-300 {
          color: rgba(255,255,255,0.7) !important;
        }
        .hover\\:text-primary-300:hover {
          color: rgba(255,255,255,0.9) !important;
        }
        
        /* Bordes primarios */
        .border-primary, .border-primary-500 {
          border-color: rgba(255,255,255,0.15) !important;
        }
        .hover\\:border-primary-500\\/50:hover {
          border-color: rgba(255,255,255,0.3) !important;
        }
      `;
      
      // Theme color para el navegador
      let themeMeta = document.querySelector('meta[name="theme-color"]');
      if (!themeMeta) {
        themeMeta = document.createElement('meta');
        themeMeta.setAttribute('name', 'theme-color');
        document.head.appendChild(themeMeta);
      }
      themeMeta.setAttribute('content', '#000000');
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
    <div className="min-h-screen flex flex-col bg-black relative">
      <MeshBackground />
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
