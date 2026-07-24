import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useEffectiveTenantId } from '../../store';
import { getServices } from '../../services/firestore';
import { getAvailableServiceStock, getResellerById, processBulkPurchase } from '../../services/marketplace';
import ResellerPurchaseSuccessModal from './ResellerPurchaseSuccessModal';
import ResellerPurchaseConfirmModal from './ResellerPurchaseConfirmModal';
import { CATEGORIES } from '../../utils/constants';
import {
  Wallet,
  Minus,
  Plus,
  ShoppingCart,
  AlertCircle,
  ArrowLeft,
  Package,
  Search,
  X,
} from 'lucide-react';

interface ServiceWithPrice {
  id: string;
  name: string;
  description: string;
  category: string;
  image?: string;
  price: number;
  promotionalPrice?: number;
  wholesalePrice?: number;
  terms?: string;
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
    purchaseId: string;
    credentials: any[];
    profiles?: any[];
    linkTokens?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmService, setConfirmService] = useState<ServiceWithPrice | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
              stock = await getAvailableServiceStock(svc.id);
            } catch (e) {
              console.error(`Stock error for ${svc.id}:`, e);
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
              terms: (svc as any).terms,
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

  const handleBuyClick = (service: ServiceWithPrice) => {
    setConfirmService(service);
    setError(null);
  };

  const handleConfirmPurchase = async (customerName: string) => {
    if (!tenantId || !confirmService) return;
    setPurchasing(confirmService.id);
    setError(null);
    try {
      const result = await processBulkPurchase({
        serviceId: confirmService.id,
        tenantId,
        quantity: confirmService.quantity,
        customerName,
      });

      setBalance(result.newBalance);
      setConfirmService(null);
      setModalData({
        purchaseId: result.purchaseId,
        serviceName: result.serviceName || confirmService.name,
        quantity: result.quantity,
        credentials: result.credentials || [],
        profiles: result.profiles || [],
        linkTokens: result.linkTokens || undefined,
      });
      setModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la compra');
    } finally {
      setPurchasing(null);
    }
  };

  const handleCancelPurchase = () => {
    setConfirmService(null);
  };

  // ─── Categorías con servicios disponibles ──────────────────────────────
  const availableCategories = useMemo(() => {
    return CATEGORIES.filter((cat) =>
      services.some((s) => s.category === cat.id)
    );
  }, [services]);

  // Servicios sin categoría conocida
  const hasOtherServices = services.some(
    (s) => !CATEGORIES.some((c) => c.id === s.category)
  );

  // Servicios de la categoría seleccionada
  const categoryServices = useMemo(() => {
    if (!selectedCategory) return [];
    if (selectedCategory === '__otros__') {
      return services.filter(
        (s) => !CATEGORIES.some((c) => c.id === s.category)
      );
    }
    return services.filter((s) => s.category === selectedCategory);
  }, [services, selectedCategory]);

  // ─── Búsqueda inteligente ─────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase().trim();
    const categoryNames = CATEGORIES.reduce(
      (acc, c) => ({ ...acc, [c.id]: c.name.toLowerCase() }),
      {} as Record<string, string>
    );
    return services.filter((s) => {
      const catName = categoryNames[s.category] || s.category;
      return (
        s.name.toLowerCase().includes(q) ||
        catName.includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [services, search]);

  // ─── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando catálogo...</div>
    );
  }

  // ─── Service card ───────────────────────────────────────────────────────
  const renderServiceCard = (service: ServiceWithPrice) => {
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
            <span className="text-[10px] text-gray-500">c/u</span>
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
            onClick={() => handleBuyClick(service)}
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
  };

  // ─── Services grid (categoría seleccionada) ────────────────────────────
  const renderServicesGrid = () => {
    const catDef = CATEGORIES.find((c) => c.id === selectedCategory);
    const CatIcon = catDef?.icon || Package;
    const categoryName = catDef?.name || 'Otros';

    return (
      <div className="space-y-6">
        {/* Back button + category header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Volver
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
              <CatIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">{categoryName}</h2>
            <span className="text-sm text-gray-500">
              ({categoryServices.length} servicio{categoryServices.length !== 1 ? 's' : ''})
            </span>
          </div>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {categoryServices.map(renderServiceCard)}
        </div>
      </div>
    );
  };

  // ─── Category grid (landing) ──────────────────────────────────────────
  const renderCategoryGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {availableCategories.map((cat, index) => {
        const Icon = cat.icon;
        const count = services.filter((s) => s.category === cat.id).length;
        return (
          <motion.button
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => setSelectedCategory(cat.id)}
            className="group bg-gray-800 rounded-xl border border-gray-700 p-6 hover:border-primary-500/50 hover:bg-gray-750 transition-all text-center"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary-600/20 to-primary-800/20 group-hover:from-primary-600/30 group-hover:to-primary-800/30 transition-all mb-3">
              <Icon className="w-7 h-7 text-primary-400 group-hover:text-primary-300 transition-colors" />
            </div>
            <h3 className="text-white font-semibold text-sm">{cat.name}</h3>
            <p className="text-gray-500 text-xs mt-1">
              {count} servicio{count !== 1 ? 's' : ''}
            </p>
          </motion.button>
        );
      })}

      {hasOtherServices && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setSelectedCategory('__otros__')}
          className="group bg-gray-800 rounded-xl border border-gray-700 p-6 hover:border-primary-500/50 hover:bg-gray-750 transition-all text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-gray-600/20 to-gray-800/20 group-hover:from-gray-600/30 group-hover:to-gray-800/30 transition-all mb-3">
            <Package className="w-7 h-7 text-gray-400 group-hover:text-gray-300 transition-colors" />
          </div>
          <h3 className="text-white font-semibold text-sm">Otros</h3>
          <p className="text-gray-500 text-xs mt-1">
            {services.filter((s) => !CATEGORIES.some((c) => c.id === s.category)).length} servicio
            {services.filter((s) => !CATEGORIES.some((c) => c.id === s.category)).length !== 1 ? 's' : ''}
          </p>
        </motion.button>
      )}
    </div>
  );

  // ─── Main render ──────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo Mayorista</h1>
          <p className="text-gray-400 text-sm mt-1">
            {selectedCategory
              ? 'Seleccioná un servicio para comprar al por mayor'
              : 'Elegí una categoría para ver los servicios disponibles'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
          <Wallet size={18} className="text-yellow-400" />
          <span className="text-yellow-400 font-bold text-lg">
            ${balance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Buscador inteligente */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar servicio por nombre, categoría..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Empty state */}
      {services.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          No hay servicios disponibles en este momento.
        </div>
      ) : searchResults ? (
        /* Resultados de búsqueda */
        searchResults.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No hay servicios que coincidan con "<span className="text-gray-300">{search}</span>"
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Search size={14} />
              <span>
                {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para "<span className="text-gray-300">{search}</span>"
              </span>
              <button
                onClick={() => setSearch('')}
                className="text-primary-400 hover:text-primary-300 underline ml-2 text-xs"
              >
                Limpiar
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {searchResults.map(renderServiceCard)}
            </div>
          </div>
        )
      ) : selectedCategory ? (
        renderServicesGrid()
      ) : (
        renderCategoryGrid()
      )}

      {/* Confirm modal */}
      {confirmService && (
        <ResellerPurchaseConfirmModal
          open={confirmService !== null}
          onConfirm={handleConfirmPurchase}
          onCancel={handleCancelPurchase}
          serviceName={confirmService.name}
          category={confirmService.category}
          description={confirmService.description}
          terms={confirmService.terms}
          stock={confirmService.stock}
          quantity={confirmService.quantity}
          unitPrice={confirmService.wholesalePrice || 0}
          totalPrice={(confirmService.wholesalePrice || 0) * confirmService.quantity}
          purchasing={purchasing === confirmService.id}
        />
      )}

      {/* Success modal */}
      {modalData && (
        <ResellerPurchaseSuccessModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalData(null);
          }}
          serviceName={modalData.serviceName}
          quantity={modalData.quantity}
          purchaseId={modalData.purchaseId}
          credentials={modalData.credentials}
          profiles={modalData.profiles}
          linkTokens={modalData.linkTokens}
        />
      )}
    </div>
  );
};

export default CatalogoMayorista;
