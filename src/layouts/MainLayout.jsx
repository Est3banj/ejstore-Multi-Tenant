import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

const MainLayout = () => {
  const location = useLocation();
  const { settings, tenant, loading } = useApp();

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
      
      // Convertir hex a HSL para Tailwind
      const primaryHsl = hexToHsl(primary);
      const secondaryHsl = hexToHsl(secondary);
      
      // Injectar como variables CSS para Tailwind
      root.style.setProperty('--primary', `${primaryHsl.h} ${primaryHsl.s}% ${primaryHsl.l}%`);
      root.style.setProperty('--primary-foreground', '0 0% 100%');
      root.style.setProperty('--secondary', `${secondaryHsl.h} ${secondaryHsl.s}% ${secondaryHsl.l}%`);
      root.style.setProperty('--secondary-foreground', '0 0% 100%');
    }
  }, [settings]);

  // Dynamic favicon and title based on tenant
  useEffect(() => {
    if (tenant) {
      // Update favicon
      if (tenant.logoUrl) {
        let favicon = document.querySelector("link[rel~='icon']");
        if (!favicon) {
          favicon = document.createElement('link');
          favicon.rel = 'icon';
          document.head.appendChild(favicon);
        }
        favicon.href = tenant.logoUrl;
      }
      
      // Update title
      if (tenant.name) {
        document.title = `${tenant.name} - Servicios Digitales`;
      }
    }
  }, [tenant]);

  if (loading) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

const hexToHsl = (hex) => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

export default MainLayout;