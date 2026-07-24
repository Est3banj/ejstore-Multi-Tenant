import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { getServiceById } from '../services/firestore';
import { getAvailableServiceStock, processPurchase } from '../services/marketplace';
import { PLANS } from '../utils/constants';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import Modal from '../components/Modal';
import PurchaseConfirmModal from '../components/PurchaseConfirmModal';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Wallet, MessageCircle } from 'lucide-react';

const Product = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { terms, settings, tenant } = useApp();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const customer = useAuthStore((state) => state.customer);

  useEffect(() => {
    const loadService = async () => {
      if (!tenant?.id) {
        console.error('No tenant ID available');
        setLoading(false);
        return;
      }
      try {
        const serviceData = await getServiceById(id, tenant.id);
        setService(serviceData);
        if (serviceData) {
          const availablePlans = serviceData.pricing && serviceData.pricing.length > 0
            ? serviceData.pricing.map(p => ({
              id: p.months.toString(),
              name: `${p.months} ${p.months === 1 ? 'Mes' : 'Meses'}`,
              months: p.months,
              customPrice: p.price
            }))
            : PLANS;

        if (availablePlans.length > 0) {
          setSelectedPlan(availablePlans[0]);
        }
        // Cargar stock
        try {
          const stockCount = await getAvailableServiceStock(id);
          setStock(stockCount);
        } catch {
          setStock(0);
        }
        } // ← cierra if(serviceData)
      } catch (error) {
        console.error('Error loading service:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id && tenant?.id) {
      loadService();
    }
  }, [id, tenant?.id]);

  // Aplicar colores dinámicos del tenant a los botones
  useEffect(() => {
    if (settings?.primaryColor) {
      const primary = settings.primaryColor || '#E50914';
      const primaryHex = primary;
      
      let styleElement = document.getElementById('product-tenant-colors');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'product-tenant-colors';
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = `
        .btn-primary {
          background: linear-gradient(135deg, ${primaryHex}, ${primaryHex}dd) !important;
          border-color: ${primaryHex} !important;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, ${primaryHex}cc, ${primaryHex}aa) !important;
        }
        .shadow-primary\\/50 {
          --tw-shadow-color: ${primaryHex}80 !important;
        }
      `;
    }
  }, [settings]);

  const handleBuyWhatsApp = () => {
    if (!acceptedTerms) {
      setShowTermsModal(true);
      return;
    }

    const whatsappUrl = generateWhatsAppMessage(
      service,
      selectedPlan,
      null,
      settings,
      `$${planPrice.toLocaleString()}`
    );

    window.open(whatsappUrl, '_blank');
  };

  const handleDirectPurchase = async () => {
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const result = await processPurchase({
        serviceId: id,
        tenantId: tenant.id
      });

      navigate('/compra-exitosa/' + result.purchaseId, {
        state: {
          credential: result.account.credential,
          serviceName: result.account.serviceName,
          newBalance: result.newBalance,
          linkToken: result.linkToken || null,
          hasCodeExtraction: result.hasCodeExtraction || false,
        }
      });
    } catch (error) {
      setPurchaseError(error.message || 'Error al procesar la compra');
    } finally {
      setPurchaseLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader"></div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/70 text-xl mb-4">Servicio no encontrado</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const hasPromo = service.promotionalPrice && service.promotionalPrice < service.price;
  const finalPrice = hasPromo ? service.promotionalPrice : service.price;
  // Use custom price if available in the selected plan, otherwise calculate
  const planPrice = selectedPlan?.customPrice ?? (selectedPlan ? finalPrice * selectedPlan.months : finalPrice);

  const availablePlans = service.pricing && service.pricing.length > 0
    ? service.pricing.map(p => ({
      id: p.months.toString(),
      name: `${p.months} ${p.months === 1 ? 'Mes' : 'Meses'}`,
      months: p.months,
      customPrice: p.price
    }))
    : PLANS;

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center space-x-2 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Volver</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Imagen */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass rounded-2xl overflow-hidden"
          >
            {service.image ? (
              <img
                src={service.image}
                alt={service.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="h-96 bg-gradient-to-br from-primary-500/10 to-black flex items-center justify-center">
                <div className="text-9xl opacity-50">📺</div>
              </div>
            )}
          </motion.div>

          {/* Información */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <h1 className="text-4xl font-bold mb-4 text-white">{service.name}</h1>
              <p className="text-white/70 text-lg">{service.description || 'Servicio de streaming premium'}</p>
            </div>

            {/* Precio + Stock */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Precio</h3>
                {stock !== null && (
                  <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                    stock === 0
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : stock <= 5
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      stock === 0 ? 'bg-red-400' : stock <= 5 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    {stock === 0 ? 'Agotado' : stock <= 5 ? `Solo ${stock}` : `${stock} disponible${stock !== 1 ? 's' : ''}`}
                  </div>
                )}
              </div>
              {hasPromo ? (
                <div>
                  <p className="text-4xl font-bold text-white mb-2">
                    ${service.promotionalPrice?.toLocaleString()}
                  </p>
                  <p className="text-xl text-white/50 line-through">
                    ${service.price?.toLocaleString()}
                  </p>
                </div>
              ) : (
                <p className="text-4xl font-bold text-white">
                  ${service.price?.toLocaleString()}
                </p>
              )}
            </div>

            {/* Planes */}
            {availablePlans.length > 0 && (
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold mb-4 text-white">Selecciona un plan</h3>
                <div className="grid grid-cols-2 gap-3">
                  {availablePlans.map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`p-4 rounded-lg border-2 transition-all ${selectedPlan?.id === plan.id
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-white/20 hover:border-white/40'
                        }`}
                    >
                      <p className="font-semibold text-white">{plan.name}</p>
                      <p className="text-sm text-white/70">
                        ${(plan.customPrice ?? (finalPrice * plan.months)).toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
                {selectedPlan && (
                  <p className="mt-4 text-white/70">
                    Total: <span className="font-bold text-white">${planPrice.toLocaleString()}</span>
                  </p>
                )}
              </div>
            )}

            {/* Contacto por WhatsApp */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                <MessageCircle size={20} className="text-green-400" />
                ¿Necesitas ayuda?
              </h3>
              <p className="text-white/70 text-sm">
                Si tenés dudas o querés coordinar otro método de pago, contactanos por WhatsApp.
              </p>
            </div>

            {/* Beneficios */}
            {service.benefits && service.benefits.length > 0 && (
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold mb-4 text-white">Beneficios</h3>
                <ul className="space-y-2">
                  {service.benefits.map((benefit, index) => (
                    <li key={index} className="flex items-center space-x-2 text-white/80">
                      <Check size={20} className="text-green-400" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Términos y condiciones */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="terms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <label htmlFor="terms" className="text-white/70">
                Acepto los{' '}
                <button
                  onClick={() => setShowTermsModal(true)}
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  términos y condiciones
                </button>
              </label>
            </div>

            {customer && (
              <button
                onClick={() => setShowPurchaseModal(true)}
                disabled={!acceptedTerms}
                className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: settings?.primaryColor 
                    ? `linear-gradient(135deg, ${settings.primaryColor}, ${settings.primaryColor}dd)`
                    : 'linear-gradient(135deg, #E50914, #E50914dd)',
                  boxShadow: settings?.primaryColor
                    ? `0 4px 15px -3px ${settings.primaryColor}80`
                    : '0 4px 15px -3px rgba(229, 9, 20, 0.5)'
                }}
              >
                <Wallet size={20} />
                Comprar con saldo {customer?.balance ? `($${customer.balance.toLocaleString()})` : ''}
              </button>
            )}

            <button
              onClick={handleBuyWhatsApp}
              disabled={!acceptedTerms}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed border-2 border-white/20 hover:border-white/40"
            >
              <MessageCircle size={20} className="text-green-400" />
              Comprar por WhatsApp
            </button>
          </motion.div>
        </div>
      </div>

      {/* Modal de términos */}
      <Modal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Términos y Condiciones"
        size="lg"
      >
        <div className="prose prose-invert max-w-none">
          <div className="text-white/80 whitespace-pre-wrap">
            {terms || 'No hay términos y condiciones disponibles.'}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => {
              setAcceptedTerms(true);
              setShowTermsModal(false);
            }}
            className="btn-primary"
          >
            Aceptar y continuar
          </button>
        </div>
      </Modal>

      <PurchaseConfirmModal
        isOpen={showPurchaseModal}
        onClose={() => {
          setShowPurchaseModal(false);
          setPurchaseError(null);
        }}
        onConfirm={handleDirectPurchase}
        serviceName={service?.name || ''}
        price={planPrice}
        currentBalance={customer?.balance || 0}
        loading={purchaseLoading}
        error={purchaseError}
        terms={service?.terms}
      />
    </div>
  );
};

export default Product;

