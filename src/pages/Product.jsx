import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { getServiceById } from '../services/firestore';
import { getAvailableServiceStock, processPurchase, createDiamondOrder } from '../services/marketplace';
import { customCallable } from '../services/apiClient';
import { isValidFFId } from '../utils/freefire';
import { PLANS } from '../utils/constants';
import { SIGNUP_BONUS } from '../services/auth';
import { logAnalyticsEvent } from '../services/firebase';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import { withTenantParam } from '../utils/tenantUrl';
import Modal from '../components/Modal';
import PurchaseConfirmModal from '../components/PurchaseConfirmModal';
import { RechargeModal } from '../components/RechargeModal';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Wallet, MessageCircle, Gem, UserPlus } from 'lucide-react';

// Clave idempotente generada al ABRIR el modal de compra; estable entre
// reintentos del mismo intento lógico. Se regenera al cerrar o tras éxito.
const generateIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const FF_VERIFY_IDLE = { status: 'idle', nickname: '', level: null };

const Product = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, tenant } = useApp();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState(null);
  const [stockError, setStockError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [freeFireId, setFreeFireId] = useState('');
  const [ffVerify, setFfVerify] = useState(FF_VERIFY_IDLE);
  const [diamondResult, setDiamondResult] = useState(null);
  const idempotencyKeyRef = useRef(generateIdempotencyKey());
  // Espejo async del input + último ID verificado: las respuestas de un blur
  // anterior se descartan si el usuario ya editó el campo.
  const freeFireIdRef = useRef('');
  const lastVerifyRef = useRef('');
  const verifyInflightRef = useRef('');
  const customer = useAuthStore((state) => state.customer);
  const hasTerms = typeof service?.terms === 'string' && service.terms.trim().length > 0;

  useEffect(() => {
    let active = true;
    setStock(null);
    setStockError(false);
    setService(null);
    setLoading(true);
    const loadService = async () => {
      if (!tenant?.id) {
        console.error('No tenant ID available');
        setLoading(false);
        return;
      }
      try {
        const serviceData = await getServiceById(id, tenant.id);
        if (!active) return;
        setService(serviceData);
        if (serviceData) {
          if (serviceData.serviceType === 'diamond') {
            // Los diamantes son bienes digitales puntuales: sin planes ni stock.
            return;
          }
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
          const stockCount = await getAvailableServiceStock(id, tenant.id);
          if (active) setStock(stockCount);
        } catch {
          if (active) setStockError(true);
        }
        } // ← cierra if(serviceData)
      } catch (error) {
        console.error('Error loading service:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (id && tenant?.id) {
      loadService();
    }
    return () => { active = false; };
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
    if (hasTerms && !acceptedTerms) {
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

      // Saldo mutado por la compra: patch inmediato (el snapshot lo confirma
      // después; acá el Header/UserMenu no esperan latencia de red).
      if (typeof result.newBalance === 'number') {
        useAuthStore.getState().patchBalance(result.newBalance);
      }

      // GA4: el valor = lo que el server cobró de verdad
      // (purchaseService.js: `promotionalPrice || price`); la response no
      // trae price, así que se replica la misma fórmula del server.
      logAnalyticsEvent('purchase', {
        currency: 'COP',
        value: service.promotionalPrice || service.price,
        item_name: service.name
      });

      navigate(withTenantParam('/compra-exitosa/' + result.purchaseId), {
        state: {
          credential: result.account.credential,
          serviceName: result.account.serviceName,
          newBalance: result.newBalance,
          profileName: result.account.profileName,
          profilePin: result.account.profilePin,
          linkToken: result.linkToken || null,
          hasCodeExtraction: result.hasCodeExtraction || false,
          purchaseId: result.purchaseId,
          durationDays: result.durationDays || 30,
        }
      });
    } catch (error) {
      setPurchaseError(error.message || 'Error al procesar la compra');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const isDiamond = service?.serviceType === 'diamond';
  // Suscripción sin cuentas cargadas → se vende por WhatsApp ("por encargo").
  // El server rechaza la compra por saldo con stock 0, así que ese CTA queda
  // deshabilitado y WhatsApp pasa a ser el CTA primario.
  const isByOrder = !isDiamond && stock === 0;

  const openPurchaseModal = () => {
    idempotencyKeyRef.current = generateIdempotencyKey();
    setFreeFireId('');
    freeFireIdRef.current = '';
    lastVerifyRef.current = '';
    verifyInflightRef.current = '';
    setFfVerify(FF_VERIFY_IDLE);
    setPurchaseError(null);
    setShowPurchaseModal(true);
  };

  const closePurchaseModal = () => {
    idempotencyKeyRef.current = generateIdempotencyKey();
    setShowPurchaseModal(false);
    setPurchaseError(null);
  };

  // La verificación corre SÓLO en blur (la cuota upstream es 500 total):
  // cada tecla limpia el estado y habilita re-verificar en el próximo blur.
  const handleFreeFireIdChange = (value) => {
    freeFireIdRef.current = value;
    setFreeFireId(value);
    lastVerifyRef.current = '';
    setFfVerify(FF_VERIFY_IDLE);
  };

  const handleFreeFireIdBlur = async () => {
    const value = freeFireIdRef.current.trim();
    if (!isValidFFId(value)) return;
    if (lastVerifyRef.current === value) return;
    if (verifyInflightRef.current === value) return;

    lastVerifyRef.current = value;
    verifyInflightRef.current = value;
    setFfVerify({ status: 'verifying', nickname: '', level: null });

    try {
      const res = await customCallable('verifyFreeFireId', { freeFireId: value });
      if (lastVerifyRef.current !== value) return;
      const payload = res?.data;
      if (payload && payload.ok === true) {
        setFfVerify({ status: 'valid', nickname: payload.nickname, level: payload.level ?? null });
      } else if (payload && payload.reason === 'NOT_FOUND') {
        setFfVerify({ status: 'not_found', nickname: '', level: null });
      } else {
        setFfVerify({ status: 'unavailable', nickname: '', level: null });
      }
    } catch {
      if (lastVerifyRef.current !== value) return;
      setFfVerify({ status: 'unavailable', nickname: '', level: null });
    } finally {
      if (verifyInflightRef.current === value) verifyInflightRef.current = '';
    }
  };

  const handleDiamondPurchase = async () => {
    if (!isValidFFId(freeFireId.trim())) return;
    if (ffVerify.status === 'not_found') return;
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const result = await createDiamondOrder({
        serviceId: id,
        tenantId: tenant.id,
        freeFireId: freeFireId.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = generateIdempotencyKey();
      // El pedido debitó saldo (newBalance del callable) → reflejo inmediato.
      if (typeof result.newBalance === 'number') {
        useAuthStore.getState().patchBalance(result.newBalance);
      }
      // GA4: price viene del server (createDiamondOrder lo calcula y lo
      // devuelve en la response) — no se replica el cálculo en el cliente.
      logAnalyticsEvent('purchase', {
        currency: 'COP',
        value: result.price,
        item_name: service.name,
        item_category: 'diamonds'
      });
      setDiamondResult(result);
      setShowPurchaseModal(false);
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
          <button onClick={() => navigate(withTenantParam('/'))} className="btn-primary">
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
  const purchasePrice = isDiamond ? service.price : planPrice;

  const availablePlans = isDiamond ? [] : (service.pricing && service.pricing.length > 0
    ? service.pricing.map(p => ({
      id: p.months.toString(),
      name: `${p.months} ${p.months === 1 ? 'Mes' : 'Meses'}`,
      months: p.months,
      customPrice: p.price
    }))
    : PLANS);

  const primaryBtnStyle = {
    background: settings?.primaryColor
      ? `linear-gradient(135deg, ${settings.primaryColor}, ${settings.primaryColor}dd)`
      : 'linear-gradient(135deg, #E50914, #E50914dd)',
    boxShadow: settings?.primaryColor
      ? `0 4px 15px -3px ${settings.primaryColor}80`
      : '0 4px 15px -3px rgba(229, 9, 20, 0.5)'
  };

  // Con stock 0 el server rechaza la compra por saldo → CTA deshabilitado con
  // aviso, y WhatsApp (el canal real de venta) se vuelve el CTA primario verde.
  const saldoCta = (
    <button
      onClick={openPurchaseModal}
      disabled={(hasTerms && !acceptedTerms) || isByOrder || (!isDiamond && stock === null)}
      title={isByOrder ? 'Sin stock — pedí por WhatsApp' : undefined}
      data-testid="saldo-cta"
      className={`w-full text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
        isByOrder ? 'flex flex-col items-center justify-center gap-1' : 'flex items-center justify-center gap-2'
      }`}
      style={primaryBtnStyle}
    >
      <span className="flex items-center justify-center gap-2">
        <Wallet size={20} />
        Comprar con saldo {customer?.balance ? `($${customer.balance.toLocaleString()})` : ''}
      </span>
      {isByOrder && (
        <span className="text-xs font-normal opacity-80">Sin stock — pedí por WhatsApp</span>
      )}
    </button>
  );

  // Deslogueado: en vez de comprar con saldo, incentivo de registro con el
  // regalo de bienvenida (fuente única: SIGNUP_BONUS de services/auth).
  const registerCta = (
    <div className="space-y-2" data-testid="register-incentive">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'register' }))}
        className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
        style={primaryBtnStyle}
        data-testid="register-cta"
      >
        <UserPlus size={20} />
        Registrate y comprá al instante
      </button>
      <p className="text-center text-sm font-semibold text-amber-300" data-testid="signup-bonus-copy">
        ${SIGNUP_BONUS.toLocaleString('es-AR')} de regalo al registrarte
      </p>
    </div>
  );

  const whatsappCta = (
    <button
      onClick={handleBuyWhatsApp}
      disabled={hasTerms && !acceptedTerms}
      data-testid="whatsapp-cta"
      className={`w-full flex items-center justify-center gap-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
        isByOrder
          ? 'border-2 border-green-400/50 shadow-lg shadow-green-500/20'
          : 'border-2 border-white/20 hover:border-white/40'
      }`}
      style={isByOrder
        ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 15px -3px rgba(34, 197, 94, 0.5)' }
        : undefined}
    >
      <MessageCircle size={20} className={isByOrder ? 'text-white' : 'text-green-400'} />
      Comprar por WhatsApp
    </button>
  );

  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 min-h-10 flex items-center space-x-2 text-white/70 hover:text-white transition-colors"
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
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h1 className="text-4xl font-bold text-white">{service.name}</h1>
                {isDiamond && (
                  <span
                    className="bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold"
                    data-testid="nuevo-badge"
                  >
                    NUEVO
                  </span>
                )}
              </div>
              <p className="text-white/70 text-lg">{service.description || 'Servicio de streaming premium'}</p>
            </div>

            {/* Precio + Stock */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Precio</h3>
                {isDiamond ? (
                  // Diamantes: sin inventario de cuentas (recarga manual del admin) → siempre disponible.
                  <div className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 bg-emerald-500/15 border-emerald-500/30 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Disponible
                  </div>
                ) : stockError ? <p role="status">No se pudo verificar la disponibilidad. Intentá recargar.</p> : stock !== null && (
                  <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                    stock === 0
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : stock <= 5
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`} data-testid="availability-badge">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      stock === 0 || stock <= 5 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    {stock === 0 ? 'Disponible por encargo' : stock <= 5 ? `Solo ${stock}` : `${stock} disponible${stock !== 1 ? 's' : ''}`}
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

            {/* Términos y condiciones (solo si el servicio define los suyos) */}
            {hasTerms && (
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
                    className="min-h-10 py-2 text-primary-400 hover:text-primary-300 underline"
                  >
                    términos y condiciones
                  </button>
                </label>
              </div>
            )}

            {/* Con stock 0: WhatsApp (verde) primero como CTA primario.
                Con stock > 0: orden original (saldo primero, WhatsApp debajo).
                Deslogueado: incentivo de registro en el slot de compra con saldo. */}
            {isByOrder && whatsappCta}

            {customer ? saldoCta : registerCta}

            {!isByOrder && whatsappCta}
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
            {service?.terms}
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
        onClose={closePurchaseModal}
        onConfirm={isDiamond ? handleDiamondPurchase : handleDirectPurchase}
        onRecharge={() => {
          setShowPurchaseModal(false);
          setShowRechargeModal(true);
        }}
        serviceName={service?.name || ''}
        price={purchasePrice}
        currentBalance={customer?.balance || 0}
        loading={purchaseLoading}
        error={purchaseError}
        terms={service?.terms}
        serviceType={service?.serviceType}
        freeFireId={freeFireId}
        onFreeFireIdChange={handleFreeFireIdChange}
        onFreeFireIdBlur={handleFreeFireIdBlur}
        ffVerification={ffVerify}
      />

      {/* Vista de éxito de compra de diamantes (pedido pendiente de confirmación) */}
      <AnimatePresence>
        {diamondResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="glass w-full max-w-md p-6 rounded-2xl text-center space-y-5"
              data-testid="diamond-purchase-success"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <Gem size={32} className="text-green-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">Compra exitosa</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Tu pedido de diamantes fue recibido y está en estado{' '}
                  <span className="text-yellow-400 font-semibold">Pendiente</span>. Vas a recibir
                  los diamantes en tu cuenta de Free Fire una vez sea procesado.
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/10 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Servicio</span>
                  <span className="text-white font-medium">{service?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">ID de jugador</span>
                  <span className="text-white font-mono">{diamondResult.freeFireId || freeFireId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Precio</span>
                  <span className="text-white font-medium">${(diamondResult.price ?? purchasePrice).toLocaleString()}</span>
                </div>
                {typeof diamondResult.newBalance === 'number' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Saldo restante</span>
                    <span className="text-white font-medium">${diamondResult.newBalance.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    setDiamondResult(null);
                    navigate(withTenantParam('/mis-servicios'));
                  }}
                  className="w-full py-3 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: settings?.primaryColor
                      ? `linear-gradient(135deg, ${settings.primaryColor}, ${settings.primaryColor}dd)`
                      : 'linear-gradient(135deg, #E50914, #E50914dd)',
                  }}
                >
                  Ver mis pedidos
                </button>
                <button
                  onClick={() => setDiamondResult(null)}
                  className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors"
                >
                  Seguir comprando
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showRechargeModal && (
        <RechargeModal onClose={() => setShowRechargeModal(false)} />
      )}
    </div>
  );
};

export default Product;
