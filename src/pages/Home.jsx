import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CATEGORIES } from '../utils/constants';
import ServiceCard from '../components/ServiceCard';
import BannerSlider from '../components/BannerSlider';
import Roulette from '../components/Roulette';
import { motion } from 'framer-motion';

const Home = () => {
  const { services } = useApp();
  const [selectedCategory, setSelectedCategory] = useState('all');

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
              <ServiceCard key={service.id} service={service} index={index} />
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
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${selectedCategory === 'all'
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/50'
                : 'glass text-white/80 hover:text-white hover:bg-white/5'
              }`}
          >
            Todos
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${selectedCategory === category.id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/50'
                  : 'glass text-white/80 hover:text-white hover:bg-white/5'
                }`}
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
              <ServiceCard key={service.id} service={service} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;

