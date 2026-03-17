import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

const BannerSlider = () => {
  const { banners } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <div className="relative h-64 md:h-96 overflow-hidden rounded-2xl mb-12">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <img
            src={banners[currentIndex].image}
            alt={banners[currentIndex].title || 'Banner'}
            className="w-full h-full object-cover"
          />
          {(banners[currentIndex].title || banners[currentIndex].description) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end">
              <div className="container mx-auto px-4 pb-8">
                {banners[currentIndex].title && (
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    {banners[currentIndex].title}
                  </h2>
                )}
                {banners[currentIndex].description && (
                  <p className="text-white/90 text-lg">
                    {banners[currentIndex].description}
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {banners.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 glass p-2 rounded-full hover:bg-primary-500/20 transition-colors"
          >
            <ChevronLeft size={24} className="text-white" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 glass p-2 rounded-full hover:bg-primary-500/20 transition-colors"
          >
            <ChevronRight size={24} className="text-white" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
            {banners.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`h-2 rounded-full transition-all ${index === currentIndex
                    ? 'w-8 bg-primary-500'
                    : 'w-2 bg-white/50'
                  }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerSlider;

