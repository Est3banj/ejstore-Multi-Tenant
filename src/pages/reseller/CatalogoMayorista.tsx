import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useEffectiveTenantId } from '../../store';
import { getServices } from '../../services/firestore';
import { getResellerById, processBulkPurchase } from '../../services/marketplace';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import ResellerPurchaseSuccessModal from './ResellerPurchaseSuccessModal';
import { CATEGORIES } from '../../utils/constants';
import { Wallet, Minus, Plus, ShoppingCart, AlertCircle, Monitor, User, Music, Tv, Gift, Package } from 'lucide-react';

interface ServiceWithPrice {
  id: string;
  name: string;
  description: string;
  category: string;
  image?: string;
  price: number;
  promotionalPrice?: number;
  wholesalePrice?: number;
  stock: number;
  quantity: number;
}

const CATEGORY_ICONS: Record<string, typeof Monitor> = {
  pantallas: Monitor,
  cuentas: User,
  'musica-video': Music,
  'tv-deportes': Tv,
  combos: Gift,
};

const CatalogoMayorista = (): JSX.Element => {
  const { user } = useAuthStore();
  const uid = user?.uid || '';
  const tenantId = useEffectiveTenantId();
  const [services, setServices] = useState<ServiceWithPrice[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    serviceName: string;
    quantity: number;
    credentials: any[];
    linkTokens?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!uid || !tenantId) return;
      setLoading(true);
      try {
        const [resellerData, svcs] = await Promise.all([
          getResellerById(uid),
          getServices(tenantId),
        ]);

        if (resellerData) {
          setBalance(resellerData.balance || 0);
        }

        const comm = resellerData?.commissionPercent || 0;

        const servicesWithStock: ServiceWithPrice[] = await Promise.all(
          svcs.map(async (svc) => {
            let stock = 0;
            try {
              const q = query(
                collection(db, 'services', svc.id, 'accounts'),
                where('status', '==', 'available')
              );
              const snapshot = await getDocs(q);
              stock = snapshot.size;
            } catch {
              // index may not exist yet
            }

            let wholesalePrice: number;
            if ((svc as any).wholesalePrice) {
              wholesalePrice = (svc as any).wholesalePrice;
            } else {
              const basePrice = svc.promotionalPrice || svc.price;
              wholesalePrice = Math.round(basePrice * (1 - comm / 100));
            }

            const img = (svc as any).images?.[0] || (svc as any).image || '';

            return {
              id: svc.id,
              name: svc.name,
              description: svc.description || '',
              category: (svc as any).category || 'cuentas',
              image: img,
              price: svc.price,
              promotionalPrice: svc.promotionalPrice,
              wholesalePrice,
              stock,
              quantity: 1,
            };
          })
        );

        setServices(servicesWithStock);
      } catch (err) {
        console.error('Error loading catalog:', err);
        setError('Error al cargar el catálogo');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid, tenantId]);

  const handleQuantityChange = (serviceId: string, delta: number) => {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== serviceId) return s;
        const newQty = Math.max(1, Math.min(50, s.quantity + delta));
        return { ...s, quantity: newQty };
      })
    );
  };

  const handleBuy = async (service: ServiceWithPrice) => {
    if (!tenantId) return;
    setPurchasing(service.id);
    setError(null);
    try {
      const result = await processBulkPurchase({
        serviceId: service.id,
        tenantId,
        quantity: service.quantity,
      });

      setBalance(result.newBalance);
      setModalData({
        serviceName: result.serviceName || service.name,
        quantity: result.quantity,
        credentials: result.credentials || [],
        linkTokens: result.linkTokens || undefined,
      });
      setModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la compra');
    } finally {
      setPurchasing(null);
    }
  };

  // Group services by category
  const groupedServices = useMemo(() => {
    const groups: { category: string; services: ServiceWithPrice[] }[] = [];

    for (const cat of CATEGORIES) {
      const catServices = services.filter((s) => s.category === cat.id);
      if (catServices.length > 0) {
        groups.push({ category: cat.id, services: catServices });
      }
    }

    // Uncategorized services
    const other = services.filter(
      (s) => !CATEGORIES.some((c) => c.id === s.category)
    );
    if (other.length > 0) {
      groups.push({ category: 'otros', services: other });
    }

    return groups;
  }, [services]);

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando catálogo...</div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo Mayorista</h1>
          <p className="text-gray-400 text-sm mt-1">
            Compra cuentas al por mayor con tu descuento de subdistribuidor
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <Wallet size={18} className="text-yellow-400" />
          <span className="text-yellow-400 font-bold text-lg">
            ${balance.toLocaleString()}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {services.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No hay servicios disponibles en este momento.
        </div>
      ) : (
        <div className="space-y-8">
          {groupedServices.map((group) => {
            const catDef = CATEGORIES.find((c) => c.id === group.category);
            const CatIcon = group.category === 'otros'
              ? Package
              : CATEGORY_ICONS[group.category] || Package;
            const categoryName = catDef?.name || 'Otros';

            return (
              <div key={group.category}>
                {/* Category header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
                    <CatIcon className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{categoryName}</h2>
                  <span className="text-sm text-gray-500">
                    ({group.services.length} servicio{group.services.length !== 1 ? 's' : ''})
                  </span>
                </div>

                {/* Services grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {group.services.map((service) => {
                    const totalPrice = (service.wholesalePrice || 0) * service.quantity;
                    const canAfford = balance >= totalPrice;
                    const hasStock = service.stock >= service.quantity;

                    return (
                      <motion.div
                        key={service.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
                      >
                        {/* Service image */}
                        {service.image && (
                          <div className="h-20 bg-gray-900/50 flex items-center justify-center overflow-hidden">
                            <img
                              src={service.image}
                              alt={service.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-3">
                          <h3 className="text-sm font-bold text-white truncate">
                            {service.name}
                          </h3>

                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-lg font-bold text-green-400">
                              ${service.wholesalePrice?.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              c/u
                            </span>
                          </div>

                          {(service.promotionalPrice || service.price) && (
                            <p className="text-[10px] text-gray-500 line-through">
                              ${(service.promotionalPrice || service.price).toLocaleString()} regular
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <span className={`text-xs ${hasStock ? 'text-green-400' : 'text-red-400'}`}>
                              Stock: {service.stock}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleQuantityChange(service.id, -1)}
                                disabled={service.quantity <= 1}
                                className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-white font-bold text-xs w-5 text-center">
                                {service.quantity}
                              </span>
                              <button
                                onClick={() => handleQuantityChange(service.id, 1)}
                                disabled={service.quantity >= 50}
                                className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2">
                            <p className="text-[10px] text-gray-500">Total:</p>
                            <p className="text-white font-bold text-sm">
                              ${totalPrice.toLocaleString()}
                            </p>
                          </div>

                          <button
                            onClick={() => handleBuy(service)}
                            disabled={purchasing === service.id || !canAfford || !hasStock}
                            className={`w-full mt-2 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              canAfford && hasStock
                                ? 'bg-green-600 hover:bg-green-500 text-white'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {purchasing === service.id ? (
                              'Procesando...'
                            ) : !hasStock ? (
                              'Sin stock'
                            ) : !canAfford ? (
                              'Saldo insuf.'
                            ) : (
                              <>
                                <ShoppingCart size={12} />
                                ${totalPrice.toLocaleString()}
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalData && (
        <ResellerPurchaseSuccessModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalData(null);
          }}
          serviceName={modalData.serviceName}
          quantity={modalData.quantity}
          credentials={modalData.credentials}
          linkTokens={modalData.linkTokens}
        />
      )}
    </div>
  );
};

export default CatalogoMayorista;