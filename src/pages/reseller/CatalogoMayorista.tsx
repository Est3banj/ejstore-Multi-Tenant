import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useEffectiveTenantId } from '../../store';
import { getServices } from '../../services/firestore';
import { getResellerById, processBulkPurchase } from '../../services/marketplace';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import ResellerPurchaseSuccessModal from './ResellerPurchaseSuccessModal';
import { Wallet, Minus, Plus, ShoppingCart, AlertCircle } from 'lucide-react';

interface ServiceWithPrice {
  id: string;
  name: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  wholesalePrice?: number;
  stock: number;
  quantity: number;
}

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

            return {
              id: svc.id,
              name: svc.name,
              description: svc.description || '',
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

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando catálogo...</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const totalPrice = (service.wholesalePrice || 0) * service.quantity;
            const canAfford = balance >= totalPrice;
            const hasStock = service.stock >= service.quantity;

            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-white truncate">
                        {service.name}
                      </h3>
                      {service.description && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                          {service.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-2xl font-bold text-green-400">
                      ${service.wholesalePrice?.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500">
                      precio mayorista
                    </span>
                  </div>

                  {(service.promotionalPrice || service.price) && (
                    <p className="text-sm text-gray-500 line-through mb-4">
                      $
                      {(
                        service.promotionalPrice || service.price
                      ).toLocaleString()}{' '}
                      regular
                    </p>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`text-sm ${
                        hasStock ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      Stock: {service.stock}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => handleQuantityChange(service.id, -1)}
                      disabled={service.quantity <= 1}
                      className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-white font-bold text-lg w-8 text-center">
                      {service.quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(service.id, 1)}
                      disabled={service.quantity >= 50}
                      className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="mb-4">
                    <p className="text-gray-400 text-sm">Total:</p>
                    <p className="text-white font-bold text-xl">
                      ${totalPrice.toLocaleString()}
                    </p>
                  </div>

                  <button
                    onClick={() => handleBuy(service)}
                    disabled={
                      purchasing === service.id || !canAfford || !hasStock
                    }
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
                      canAfford && hasStock
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {purchasing === service.id ? (
                      'Procesando...'
                    ) : !hasStock ? (
                      'Sin stock suficiente'
                    ) : !canAfford ? (
                      'Saldo insuficiente'
                    ) : (
                      <>
                        <ShoppingCart size={18} />
                        Comprar por ${totalPrice.toLocaleString()}
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
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