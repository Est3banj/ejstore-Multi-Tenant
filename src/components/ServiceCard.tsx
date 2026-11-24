import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import type { Service } from '../types';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { withTenantParam } from '../utils/tenantUrl';

interface ServiceCardProps {
  service: Service;
  index: number;
  stock?: number;
}

const ServiceCard = ({ service, index, stock }: ServiceCardProps): JSX.Element => {
  const hasPromo = service.promotionalPrice && service.promotionalPrice < service.price;
  const { settings } = useApp();
  const { user } = useAuthStore();
  const isDiamond = service.serviceType === 'diamond';
  // Diamantes: sin inventario de cuentas → siempre "Disponible", nunca "Agotado".
  const showStock = isDiamond || (stock !== undefined && !!user); // Solo mostrar stock si el usuario está logueado
  const stockCount = stock ?? 0;
  // Sin cuentas cargadas se vende por WhatsApp: "por encargo", jamás rojo "Agotado".
  const isByOrder = !isDiamond && stock === 0;
  const isLowStock = !isDiamond && stockCount > 0 && stockCount <= 5;
  const isAmberTone = isByOrder || isLowStock;
  const availabilityLabel = isDiamond
    ? 'Disponible'
    : isByOrder
    ? 'Por encargo'
    : isLowStock
    ? `Solo ${stockCount}`
    : `${stockCount} disp.`;
  const primaryColor = settings?.primaryColor || '#E50914';
  
  // Generar color de sombra basado en el color primario del tenant
  const shadowStyle = {
    boxShadow: `0 25px 50px -12px ${primaryColor}40`
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="glass overflow-hidden"
      whileHover={shadowStyle}
    >
      <Link to={withTenantParam(`/servicio/${service.id}`)}>
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
          <div className="absolute top-2 right-2 flex items-center gap-2">
            {isDiamond && (
              <span
                className="bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold"
                data-testid="nuevo-badge"
              >
                NUEVO
              </span>
            )}
            {hasPromo && (
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                PROMO
              </span>
            )}
          </div>
          {service.hasCodeExtraction && (
            <div className="absolute top-2 left-2 bg-white/20 text-white px-3 py-1 rounded-full text-sm font-semibold">
              📡 Extracción de Código
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
            {showStock && (
              <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                isAmberTone
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              }`} data-testid="availability-badge">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isAmberTone ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                {availabilityLabel}
              </div>
            )}
          </div>
          <button 
              className="w-full flex items-center justify-center space-x-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                boxShadow: `0 4px 15px -3px ${primaryColor}80`
              }}
            >
              <ShoppingCart size={20} />
              <span>Comprar</span>
            </button>
        </div>
      </Link>
    </motion.div>
  );
};

export default ServiceCard;
