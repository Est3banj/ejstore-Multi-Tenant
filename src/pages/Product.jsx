import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getServiceById } from '../services/firestore';
import { PAYMENT_METHODS, PLANS } from '../utils/constants';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import Modal from '../components/Modal';
import { motion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';

const Product = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { terms, settings, tenant } = useApp();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

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
        }
        if (PAYMENT_METHODS.length > 0) {
          setSelectedPayment(PAYMENT_METHODS[0]);
        }
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

  const handleBuy = () => {
    if (!acceptedTerms) {
      setShowTermsModal(true);
      return;
    }

    if (!selectedPayment) {
      alert('Por favor selecciona un método de pago');
      return;
    }

    const whatsappUrl = generateWhatsAppMessage(
      service,
      selectedPlan,
      selectedPayment,
      settings,
      `$${planPrice.toLocaleString()}`
    );

    window.open(whatsappUrl, '_blank');
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

            {/* Precio */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold mb-4 text-white">Precio</h3>
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

            {/* Métodos de pago */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold mb-4 text-white">Método de pago</h3>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method)}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${selectedPayment?.id === method.id
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-white/20 hover:border-white/40'
                      }`}
                  >
                    {method.logo ? (
                      <img src={method.icon} alt={method.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="text-2xl">{method.icon}</span>
                    )}
                    <span className="text-white font-semibold">{method.name}</span>
                  </button>
                ))}
              </div>
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

            {/* Botón comprar */}
            <button
              onClick={handleBuy}
              disabled={!acceptedTerms || !selectedPayment}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Comprar Ahora
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
    </div>
  );
};

export default Product;

