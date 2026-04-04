import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import type { Service } from '../types';

interface ServiceCardProps {
  service: Service;
  index: number;
}

const ServiceCard = ({ service, index }: ServiceCardProps): JSX.Element => {
  const hasPromo = service.promotionalPrice && service.promotionalPrice < service.price;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="glass card-hover overflow-hidden"
    >
      <Link to={`/servicio/${service.id}`}>
        <div className="relative h-48 bg-gradient-to-br from-primary-500/10 to-red-600/5 flex items-center justify-center overflow-hidden">
          {service.image ? (
            <img
              src={service.image}
              alt={service.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-6xl opacity-50">📺</div>
          )}
          {hasPromo && (
            <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
              PROMO
            </div>
          )}
        </div>
        <div className="p-5">
          <h3 className="text-xl font-bold mb-2 text-white">{service.name}</h3>
          <p className="text-white/70 text-sm mb-4 line-clamp-2">
            {service.description || 'Servicio de streaming premium'}
          </p>
          <div className="flex items-center justify-between mb-4">
            <div>
              {hasPromo ? (
                <>
                  <p className="text-2xl font-bold text-white">
                    ${service.promotionalPrice?.toLocaleString()}
                  </p>
                  <p className="text-sm text-white/50 line-through">
                    ${service.price?.toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold text-white">
                  ${service.price?.toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <button className="w-full btn-primary flex items-center justify-center space-x-2">
            <ShoppingCart size={20} />
            <span>Comprar</span>
          </button>
        </div>
      </Link>
    </motion.div>
  );
};

export default ServiceCard;
