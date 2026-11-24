import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { CATEGORIES } from '../utils/constants';
import ServiceCard from '../components/ServiceCard';
import BannerSlider from '../components/BannerSlider';
import Roulette from '../components/Roulette';
import { getAvailableServiceStock } from '../services/marketplace';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

const Home = () => {
  const { services, settings, tenant } = useApp();
  const { customer } = useAuthStore();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockMap, setStockMap] = useState({});
  const primaryColor = settings?.primaryColor || '#E50914';

  // Cargar stock de servicios visibles (los diamantes no tienen inventario de cuentas: sin query)
  useEffect(() => {
    let active = true;
    setStockMap({});
    const loadStocks = async () => {
      const map = {};
      const subscriptionServices = services.filter((svc) => svc.serviceType !== 'diamond');
      const batch = subscriptionServices.map(async (svc) => {
        try {
          const stock = await getAvailableServiceStock(svc.id, tenant?.id);
          map[svc.id] = stock;
        } catch { map[svc.id] = undefined; }
      });
      await Promise.all(batch);
      if (active) setStockMap(map);
    };
    if (services.length > 0 && tenant?.id) loadStocks();
    return () => { active = false; };
  }, [services, tenant?.id]);

  // Filtrar servicios populares
  const popularServices = services.filter((service) => service.isPopular === true);

  const filteredServices =
    selectedCategory === 'all'
      ? services
      : services.filter((service) => service.category === selectedCategory);

  return (
    <div className="min-h-screen">
      {/* Ruleta flotante (botón discreto) */}
      <Roulette />

      {/* Banner Slider */}
      <section className="container mx-auto px-4 py-8">
        <BannerSlider />
      </section>

      {/* CTA Registro para comprar automático */}
      {!customer && (
        <section className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-8 md:p-12 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-5 left-5 text-6xl">📺</div>
              <div className="absolute top-10 right-10 text-5xl">🎬</div>
              <div className="absolute bottom-5 left-1/3 text-4xl">🎮</div>
            </div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
                Comprá servicios de forma automática
              </h2>
              <p className="text-white/80 text-lg mb-6 max-w-xl mx-auto">
                Registrate y comprá Netflix, Disney+, HBO y más al instante con tu saldo. Sin esperas, sin WhatsApp.
              </p>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'register' }))}
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 font-bold rounded-xl text-lg hover:bg-white/90 transition-all hover:scale-105 shadow-xl"
              >
                <Sparkles size={20} />
                Crear cuenta gratis
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        </section>
      )}

      {/* Servicios Populares */}
      {popularServices.length > 0 && (
        <section id="populares" className="container mx-auto px-4 py-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold text-center mb-8 gradient-text"
          >
            Servicios Populares
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {popularServices.map((service, index) => (
                  <ServiceCard key={service.id} service={service} index={index} stock={stockMap[service.id]} />
                ))}
          </div>
        </section>
      )}

      {/* Categorías */}
      <section id="categorias" className="container mx-auto px-4 py-12">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-center mb-8 gradient-text"
        >
          Categorías
        </motion.h2>
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <button
            onClick={() => setSelectedCategory('all')}
            className="px-6 py-3 rounded-lg font-semibold transition-all glass"
            style={{
              backgroundColor: selectedCategory === 'all' ? primaryColor : undefined,
              boxShadow: selectedCategory === 'all' ? `0 10px 25px -5px ${primaryColor}80` : undefined
            }}
          >
            Todos
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className="px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 glass"
              style={{
                backgroundColor: selectedCategory === category.id ? primaryColor : undefined,
                boxShadow: selectedCategory === category.id ? `0 10px 25px -5px ${primaryColor}80` : undefined
              }}
            >
              {category.icon && <category.icon className="w-5 h-5" />}
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="container mx-auto px-4 py-12">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold text-center mb-12 gradient-text"
        >
          Nuestros Servicios
        </motion.h2>

        {filteredServices.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/70 text-xl">No hay servicios disponibles en esta categoría.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredServices.map((service, index) => (
                <ServiceCard key={service.id} service={service} index={index} stock={stockMap[service.id]} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;

