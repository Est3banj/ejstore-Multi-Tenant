import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { customCallable, customAdminCallable } from '../services/apiClient';
import { auth, adminAuth, db, logAnalyticsEvent } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { isValidPhone } from '../utils/validation';
import { withTenantParam } from '../utils/tenantUrl';
import { X, QrCode, CreditCard, CheckCircle2 } from 'lucide-react';
import type { CheckRechargePaymentResponse } from '../types/marketplace';
import { WompiPaymentOption, hasRecentWompiPayment, type WompiAvailability } from './WompiPaymentOption';
import { WompiAmounts, formatWompiAmount, type WompiFeeQuote } from './WompiAmounts';
import { RechargeConditions } from './RechargeConditions';
import type { WompiFinalStatus } from './WompiPaymentResult';
import { RechargeResultContent } from './RechargeResultContent';

interface RechargeModalProps {
  onClose: () => void;
  panel?: boolean;
}

interface PendingRechargeInfo {
  feeQuote?: WompiFeeQuote;
  environment?: string | null;
  rechargeId: string;
  amount: number;
  createdAt: string | null;
  status: string;
}

// Clave idempotente generada al ABRIR el modal; estable entre reintentos del
// mismo intento lógico. Se regenera sólo cuando el flujo termina (result:
// aprobada/rechazada/timeout) — el siguiente create es una operación nueva.
const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const PENDING_OLD_MS = 24 * 60 * 60 * 1000;

const formatPendingDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Recientemente';
  try {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

export const RechargeModal = ({ onClose, panel = false }: RechargeModalProps) => {
  const { user, adminUser } = useAuthStore();
  const tenantId = useTenantStore(state => state.tenant?.id);
  return <RechargeModalContent key={`${panel}:${(panel ? adminUser : user)?.uid || ''}:${tenantId || ''}`} onClose={onClose} panel={panel} />;
};

const RechargeModalContent = ({ onClose, panel = false }: RechargeModalProps) => {
  const { user: clientUser, adminUser, customer: clientProfile, role } = useAuthStore();
  const user = panel ? adminUser : clientUser;
  const customer = !panel && clientProfile?.uid === clientUser?.uid ? clientProfile : null;
  const callable = panel ? customAdminCallable : customCallable;
  const firebaseSession = panel ? adminAuth : auth;
  const { settings } = useApp();
  const navigate = useNavigate();
  const tenantId = useTenantStore(state => state.tenant?.id);
  const phoneGateActive = !!customer && !(customer.phone || '').trim();
  const [step, setStep] = useState<'select' | 'transfer' | 'confirming' | 'result'>('select');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'wompi'>(() => hasRecentWompiPayment(user?.uid, role, tenantId, panel) ? 'wompi' : 'transfer');
  const [wompiAvailability, setWompiAvailability] = useState<WompiAvailability>('loading');
  useEffect(() => {
    if (wompiAvailability === 'disabled' || wompiAvailability === 'error') setPaymentMethod('transfer');
  }, [wompiAvailability]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [editingPhone, setEditingPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'error'|'success'} | null>(null);
  const [rechargeResult, setRechargeResult] = useState<{success: boolean; message: string; wompiStatus?: WompiFinalStatus} | null>(null);
  const resultCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step === 'result' && rechargeResult?.wompiStatus) resultCloseRef.current?.focus();
  }, [step, rechargeResult]);
  const [rechargeId, setRechargeId] = useState<string | null>(null);
  const [searchStep, setSearchStep] = useState(0);
  const [pendingRecharge, setPendingRecharge] = useState<PendingRechargeInfo | null>(null);
  const updateWompiStatus = useCallback((status: WompiFinalStatus) => {
    setPendingRecharge(previous => previous && previous.status !== status ? { ...previous, status } : previous);
  }, []);
  const resolveWompi = useCallback((status: WompiFinalStatus, baseAmount: number) => {
    setPendingRecharge(null);
    setRechargeResult({ success: status !== 'rejected', wompiStatus: status,
      message: status === 'sandbox_approved' ? 'Sin saldo real. Este pago fue una prueba.' : status === 'approved'
        ? `Se acreditaron ${formatWompiAmount(baseAmount)} de saldo.` : 'El pago no fue aprobado. Podés volver a intentarlo.' });
    setStep('result');
  }, []);
  const wompiFinal = !!pendingRecharge?.rechargeId.startsWith('wompi_') && pendingRecharge.status !== 'pending';
  const wompiStatusLabel = pendingRecharge?.status === 'approved' ? 'Pago aprobado' : pendingRecharge?.status === 'sandbox_approved' ? 'Prueba aprobada · Sin saldo real' : 'Pago rechazado';
  // Arranca en true cuando el form será visible: el check de pending (L3) corre
  // en el mount effect y el form no debe pisear un frame antes de resolverse.
  const [pendingLoading, setPendingLoading] = useState(!phoneGateActive && !!user?.uid);
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getBtnStyle = () => {
    const primary = settings?.primaryColor || '#E50914';
    return {
      background: `linear-gradient(135deg, ${primary}, ${primary}dd)`,
      boxShadow: `0 4px 15px -3px ${primary}80`
    };
  };

  const showToast = (msg: string, type: 'error'|'success' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  // The existing customer profile update API, scoped to the default Firebase
  // identity. No global auth migration or synthetic profile provider is needed.
  const saveProfilePhone = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = phone.trim();
    if (!customer || !user || panel || !isValidPhone(value)) {
      showToast('Ingresa un teléfono válido'); return;
    }
    setLoading(true);
    try {
      await auth.authStateReady();
      if (auth.currentUser !== user || customer.uid !== user.uid) throw new Error('La sesión cambió. Volvé a iniciar sesión.');
      await updateDoc(doc(db, 'customers', user.uid), { phone: value });
      const current = useAuthStore.getState();
      if (auth.currentUser !== user || current.user !== user || current.customer !== customer) return;
      current.setCustomer({ ...customer, phone: value });
      setEditingPhone(false);
    } catch {
      if (auth.currentUser === user) showToast('No se pudo guardar el teléfono. Intentá de nuevo.');
    } finally { if (auth.currentUser === user) setLoading(false); }
  };

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const BRE_B_KEY = settings?.brebKey || '0035443571';
  const bankInfo = settings?.brebBankName ? `BRE-B - ${settings.brebBankName}` : 'BRE-B - GIO TECH';

  const handleWhatsapp = () => {
    const message = encodeURIComponent('Hola, quiero recargar saldo en mi cuenta. ¿Me puedes ayudar?');
    const whatsappNumber = settings.whatsappNumber || '3101234567';
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  useEffect(() => {
    if (!phone && customer?.phone) setPhone(customer.phone);
  }, [phone, customer?.phone]);

  // L3 — check de pending al abrir: ANTES de mostrar el formulario, el modal
  // consulta el historial (mismo callable sin params que usa HistorialRecargas)
  // y filtra el pending PROPIO del usuario. Si existe → vista de pending
  // directa; el formulario no es alcanzable hasta que no haya pending.
  const checkPendingRecharge = async (showLoading: boolean) => {
    if (!user?.uid) {
      setPendingLoading(false);
      return;
    }
    if (showLoading) setPendingLoading(true);
    try {
      const capturedUser = firebaseSession.currentUser;
      const result = await callable<{
        recharges?: Array<{ id: string; userId?: string; tenantId?: string; status?: string; amount?: number; createdAt?: string | null; feeQuote?: WompiFeeQuote; environment?: string | null }>;
      }>('getRechargeHistory', {});
      if (firebaseSession.currentUser !== capturedUser) return;
      const recharges = result?.data?.recharges ?? [];
      // Resellers ven en su historial también los pending de sus clientes
      // (resellerId == uid); sólo el pending donde el caller ES el titular
      // (userId == uid) bloquea — mismo scope uid del server (L1).
      const mine = recharges.find((r) => r?.status === 'pending' && r?.userId === user.uid && r?.tenantId === tenantId);
      setPendingRecharge(mine
        ? { rechargeId: mine.id, amount: mine.amount || 0, createdAt: mine.createdAt ?? null, status: 'pending', feeQuote: mine.feeQuote, environment: mine.environment }
        : null);
    } catch {
      // Sin historial no se puede descartar un pending → fail-open al form
      // (el server sigue siendo la autoridad: el create devuelve alreadyPending).
      setPendingRecharge(null);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    if (phoneGateActive) return;
    checkPendingRecharge(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneGateActive, user, tenantId, callable]);

  // L3 — refetch del check al volver la pestaña a visible (retornó al sitio).
  // Sólo aplica en el paso inicial: no interrumpe el poll de confirming.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && step === 'select' && !phoneGateActive && paymentMethod !== 'wompi' && !pendingRecharge?.rechargeId.startsWith('wompi_')) {
        checkPendingRecharge(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phoneGateActive, paymentMethod, pendingRecharge]);

  const handleTransfer = () => {
    const raw = amount.trim();
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1000) {
      showToast('Por favor ingresa un monto válido (mínimo $1,000)');
      return;
    }
    setStep('transfer');
  };

  const handleConfirmPayment = async () => {
    const trimmedPhone = customer ? (customer.phone || '').trim() : phone.trim();
    if (!fullName || !amount) {
      showToast('Por favor completa todos los campos');
      return;
    }
    if (!trimmedPhone) {
      showToast('El teléfono es requerido');
      return;
    }
    if (!isValidPhone(trimmedPhone)) {
      showToast('Ingresa un teléfono válido');
      return;
    }

    setLoading(true);

    try {
      const result = await callable<{
        alreadyPending?: boolean;
        rechargeId?: string;
        amount?: number;
        createdAt?: string | null;
        status?: string;
      }>('createRechargeRequest', {
        customerName: fullName,
        customerPhone: trimmedPhone,
        amount: Number(amount),
        // Contexto de tienda del front: permite resolver el tenant aunque el
        // customer doc (creado post-cutover) no tenga tenantId.
        ...(tenantId ? { tenantId } : {}),
        // L2: clave estable por apertura de modal — el server deduplica
        // doble submit / replay con get-before-write sobre el doc derivado.
        idempotencyKey: idempotencyKeyRef.current,
      });

      const data = result?.data ?? {};
      if (data.alreadyPending && data.rechargeId) {
        // L2: respuesta alreadyPending → vista de pending (no es un error).
        setPendingRecharge({
          rechargeId: data.rechargeId,
          amount: data.amount ?? Number(amount),
          createdAt: data.createdAt ?? null,
          status: data.status ?? 'pending',
        });
        setStep('select');
        return;
      }

      const rechargeId = data.rechargeId;
      if (!rechargeId) throw new Error('No se pudo obtener el ID de la recarga');

      // GA4: sólo en request fresco (el branch alreadyPending de arriba es
      // un replay/dedupe — no es un begin_checkout nuevo).
      logAnalyticsEvent('begin_checkout', { currency: 'COP', value: Number(amount) });

      setRechargeId(rechargeId);
      setStep('confirming');
      pollCountRef.current = 0;
    } catch (error) {
      console.error('Error:', error);
      showToast(
        error instanceof Error && error.message
          ? error.message
          : 'Error al procesar la solicitud. Intenta de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 'confirming' || !rechargeId) return;

    const POLL_INTERVAL = 5000;
    const MAX_POLLS = 24;
    pollCountRef.current = 0;

    const doPoll = async () => {
      pollCountRef.current++;
      const currentPoll = pollCountRef.current;

      if (currentPoll <= 4) setSearchStep(0);
      else if (currentPoll <= 10) setSearchStep(1);
      else if (currentPoll <= 16) setSearchStep(2);
      else if (currentPoll <= 22) setSearchStep(3);
      else setSearchStep(4);

      if (currentPoll > MAX_POLLS) {
        if (pollRef.current) clearInterval(pollRef.current);
        idempotencyKeyRef.current = generateIdempotencyKey();
        setRechargeResult({ success: false, message: 'No se pudo confirmar el pago. Contactanos por WhatsApp.' });
        setStep('result');
        return;
      }

      try {
        const result = await callable('checkRechargePayment', { rechargeId, tenantId });
        const data = result.data as CheckRechargePaymentResponse;

        if (data.processed) {
          if (pollRef.current) clearInterval(pollRef.current);
          idempotencyKeyRef.current = generateIdempotencyKey();
          // El poll ya sabe el veredicto: si aprobó, el saldo mutó en el
          // server → propaga YA (el snapshot del doc lo confirma después).
          if (data.status === 'approved' && !panel) {
            void useAuthStore.getState().refreshCustomer();
          }
          setRechargeResult({
            success: data.status === 'approved',
            message: data.message || (data.status === 'approved'
              ? 'Pago confirmado. Saldo actualizado.'
              : 'La solicitud fue procesada pero no se encontró el pago.'),
          });
          setStep('result');
        }
      } catch { /* silent */ }
    };

    const initialPoll = setTimeout(doPoll, 2000);
    pollRef.current = setInterval(doPoll, POLL_INTERVAL);

    return () => { clearTimeout(initialPoll); if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, rechargeId, callable, tenantId, panel]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        role="dialog"
        aria-modal="true"
        aria-label="Cargar saldo"
        className="glass relative w-full max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar recarga"
          className="absolute top-2 right-2 flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl text-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 active:bg-white/10"
        >
          <X size={20} />
        </button>

        {phoneGateActive ? (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold gradient-text">Cargar Saldo</h2>
            </div>

            <div className="relative bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-2xl p-5 mb-6 border border-amber-400/20 overflow-hidden" data-testid="recharge-phone-gate">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-amber-400/10 rounded-full blur-xl" />
              <div className="flex items-start gap-3 relative z-10">
                <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <div>
                  <p className="text-amber-300 font-semibold text-sm">Configurá tu teléfono</p>
                  <p className="text-amber-300/60 text-sm mt-1">Configurá tu número en tu perfil para poder recargar.</p>
                </div>
              </div>
            </div>

            {editingPhone ? <form onSubmit={saveProfilePhone} className="space-y-3">
              <label htmlFor="profile-phone" className="block text-sm text-white/70">Teléfono</label>
              <input id="profile-phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-primary-500/50" />
              <button type="submit" disabled={loading} className="w-full py-3.5 text-white font-semibold rounded-xl disabled:opacity-50" style={getBtnStyle()}>
                {loading ? 'Guardando…' : 'Guardar y continuar'}
              </button>
            </form> : <button
              onClick={() => setEditingPhone(true)}
              className="w-full py-3.5 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
              style={getBtnStyle()}
            >
              Configurar mi teléfono
            </button>}
          </>
        ) : pendingLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="recharge-pending-loading">
            <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
            <p className="text-white/50 text-sm">Verificando tus recargas...</p>
          </div>
        ) : pendingRecharge ? (
          <div className="text-center py-6 space-y-5" data-testid="recharge-pending-view">
            <div className="w-16 h-16 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">{wompiFinal ? wompiStatusLabel : 'Recarga en proceso'}</h3>
              <p className="text-gray-400 text-sm mt-1">
                {wompiFinal ? 'Estado confirmado por el servidor.' : 'Ya tenés una recarga pendiente. No podés crear otra hasta que se resuelva.'}
              </p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-yellow-500/20 text-left">
              {pendingRecharge.rechargeId.startsWith('wompi_')
                ? <WompiAmounts amount={pendingRecharge.amount} feeQuote={pendingRecharge.feeQuote} environment={pendingRecharge.environment} status={pendingRecharge.status} />
                : <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Monto</span>
                  <span className="text-yellow-400 font-bold">${pendingRecharge.amount.toLocaleString()} COP</span>
                </div>}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Estado</span>
                <span className="text-yellow-400 font-medium">{wompiFinal ? wompiStatusLabel : 'Pendiente'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Creada</span>
                <span className="text-gray-300">{formatPendingDate(pendingRecharge.createdAt)}</span>
              </div>
            </div>

            {pendingRecharge.createdAt &&
              Date.now() - new Date(pendingRecharge.createdAt).getTime() > PENDING_OLD_MS && (
                <p className="text-amber-300/80 text-sm">
                  Si hace mucho que esperaste, contactá a soporte para verificar el estado.
                </p>
              )}

            <div className="flex flex-col gap-2 pt-1">
              {pendingRecharge.rechargeId.startsWith('wompi_') && <WompiPaymentOption
                key={tenantId} amount={String(pendingRecharge.amount)} tenantId={tenantId} rechargeId={pendingRecharge.rechargeId} panel={panel} hideAmounts onResolved={resolveWompi} onStatusChange={updateWompiStatus} onRetry={() => { setPendingRecharge(null); setPaymentMethod('wompi'); setStep('select'); }} />}
              <button
                onClick={() => {
                  const target = panel ? '/r/historial-recargas' : '/historial-recargas';
                  navigate(withTenantParam(target));
                  onClose();
                }}
                className="w-full py-3 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                style={getBtnStyle()}
              >
                Ver historial de recargas
              </button>
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
        {step === 'select' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold gradient-text">Cargar Saldo</h2>
            </div>

            <div className="relative bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 rounded-xl p-4 mb-5 border border-yellow-400/15 overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-yellow-400/10 rounded-full blur-xl" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-yellow-500/10 rounded-full blur-lg" />
              <p className="text-yellow-300/70 text-xs uppercase tracking-wider font-medium mb-1 relative z-10">Saldo disponible</p>
              <p className="text-xl font-bold text-yellow-400 relative z-10">${customer?.balance?.toLocaleString('es-CO') || 0} <span className="text-xs font-medium text-yellow-300/60">COP</span></p>
            </div>

            <fieldset className="mb-6">
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">1. Elegir método</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['transfer', ...(wompiAvailability === 'available' ? ['wompi'] : [])] as Array<'transfer' | 'wompi'>).map(method => {
                  const selected = paymentMethod === method;
                  const Icon = method === 'transfer' ? QrCode : CreditCard;
                  return <label key={method} className={`relative flex min-h-[64px] min-w-0 touch-manipulation cursor-pointer items-center gap-3 rounded-xl border p-3 active:bg-white/10 ${selected ? 'border-primary-400 bg-primary-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                    <input type="radio" name="recharge-method" value={method} checked={selected} onChange={() => setPaymentMethod(method)} className="peer sr-only" />
                    <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-400" />
                    <Icon size={20} aria-hidden="true" className={selected ? 'mt-0.5 shrink-0 text-primary-300' : 'mt-0.5 shrink-0 text-white/50'} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{method === 'transfer' ? 'QR / BRE-B' : 'Wompi'}</span>
                      {method === 'transfer' && <span className="mt-1 block text-xs text-emerald-300">Sin cargo</span>}
                    </span>
                    {selected && <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-primary-300" />}
                  </label>;
                })}
              </div>
              {wompiAvailability === 'loading' && <p role="status" className="mt-2 text-xs text-white/50">Consultando otros métodos de pago…</p>}
              {wompiAvailability === 'error' && <p role="status" className="mt-2 text-xs text-amber-300">No se pudo consultar Wompi. Podés seguir usando QR o transferencia.</p>}
            </fieldset>

            <div className="mb-5 flex flex-col">
              <label htmlFor="recharge-amount" className="block text-xs uppercase tracking-wider text-white/60 mb-3 font-semibold">2. Seleccioná el monto</label>
              <div className="relative order-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg font-medium">$</span>
                <input
                  type="number"
                  id="recharge-amount"
                  inputMode="numeric"
                  aria-describedby="recharge-minimum"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-8 pr-14 text-white text-lg font-semibold tabular-nums focus:outline-none focus:border-primary-400"
                  placeholder="10,000"
                  min={1000}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/40">COP</span>
              </div>

              <div className="order-1 mb-3 grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
                {[10000, 20000, 50000, 100000].map(pre => (
                  <button
                    key={pre}
                    onClick={() => setAmount(String(pre))}
                    type="button"
                    aria-pressed={Number(amount) === pre}
                    className={`min-h-[44px] min-w-0 flex-1 touch-manipulation select-none py-2 rounded-lg text-xs sm:text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 active:bg-white/15 ${
                      parseInt(amount) === pre
                        ? 'bg-primary-500/30 text-primary-300 border border-primary-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    ${pre.toLocaleString('es-CO')}
                  </button>
                ))}
              </div>
              <p id="recharge-minimum" className="order-3 text-white/40 text-xs mt-2">Monto mínimo: $1,000 COP</p>
            </div>

            <div className="space-y-3">
              <div hidden={paymentMethod !== 'wompi'}>
                <WompiPaymentOption key={tenantId} amount={amount} tenantId={tenantId} panel={panel} active={paymentMethod === 'wompi'} onResolved={resolveWompi} onAvailabilityChange={setWompiAvailability} />
              </div>
              {paymentMethod === 'transfer' && <>
                {/^\d+$/.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) >= 1000
                  ? <WompiAmounts amount={Number(amount)} label="Detalle de importes de la transferencia" />
                  : null}
                <RechargeConditions />

              <button
                onClick={handleTransfer}
                className="w-full touch-manipulation select-none bg-primary-600 text-white py-3 px-4 rounded-xl flex items-center gap-3 border border-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 active:bg-primary-700"
              >
                 <span className="w-full text-center font-semibold">Continuar con Transferencia BRE-B</span>
              </button>
              </>}

              <button
                onClick={handleWhatsapp}
                className="w-full group relative touch-manipulation select-none text-white/60 py-2 px-3 rounded-xl flex items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 active:bg-white/10"
              >
                <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.195.194 1.666.179.47-.015 1.725-.652 1.972-1.469.247-.817.347-1.732.372-1.817.025-.085.025-.16.05-.248.025-.098.05-.198.075-.298.049-.099.124-.199.199-.347.074-.149.124-.298.174-.447.05-.149.025-.298-.025-.447-.049-.149-.174-.298-.347-.447-.174-.149-.347-.223-.52-.298-.174-.074-.347-.149-.52-.223-.174-.074-.298-.124-.447-.174-.149-.05-.223-.124-.298-.174-.074-.05-.124-.074-.174-.099-.149-.025-.223-.074-.298-.124-.074-.049-.149-.099-.223-.149z"/>
                  </svg>
                </div>
                <div className="text-left relative z-10">
                  <div className="font-medium text-sm">Hablar con asesor</div>
                </div>
              </button>
            </div>
          </>
        )}

        {step === 'transfer' && (
          <>
            <button onClick={() => setStep('select')} className="text-white/50 hover:text-white mb-3 flex items-center gap-1.5 text-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>

            <h2 className="text-xl font-bold gradient-text mb-4">Datos para transferir</h2>

            <div className="bg-white/5 rounded-2xl p-5 space-y-4 mb-4 border border-white/10">

              {settings.qrImage && (
                <div className="text-center">
                  <div className="inline-block bg-white rounded-2xl p-3 shadow-lg mb-2">
                    <img src={settings.qrImage} alt="QR de pago" className="w-56 h-56 mx-auto" />
                  </div>
                  <p className="text-white/40 text-xs">Escaneá el QR desde tu app bancaria</p>
                </div>
              )}

              <div className="space-y-3 bg-white/[0.02] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-white/50 text-sm">Banco</span>
                  </div>
                  <span className="font-semibold text-white text-sm">{bankInfo}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="text-white/50 text-sm">CLAVE BRE-B</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary-400 text-base tracking-wider">{BRE_B_KEY}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(BRE_B_KEY);
                        showToast('Clave copiada', 'success');
                      }}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all"
                      title="Copiar clave"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/5 rounded-xl p-4 border border-yellow-400/20 text-center">
                <p className="text-yellow-300/70 text-xs uppercase tracking-wider font-medium mb-1">Monto a transferir</p>
                <p className="text-2xl font-bold text-yellow-400">${parseInt(amount || '0').toLocaleString()} COP</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/70 mb-1.5 font-medium">Tu nombre completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-primary-500/50 focus:bg-white/10 transition-all"
                  placeholder="Ej: Juan Perez"
                  required
                />
                <p className="text-white/30 text-xs mt-1">Escribí el nombre exacto con el que hiciste la transferencia</p>
              </div>
              {!customer && (
                <div>
                  <label htmlFor="recharge-phone" className="block text-sm text-white/70 mb-1.5 font-medium">Tu teléfono</label>
                  <input
                    id="recharge-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/30 focus:outline-none focus:border-primary-500/50 focus:bg-white/10 transition-all"
                    placeholder="Ej: +57 300 123 4567"
                    required
                  />
                  <p className="text-white/30 text-xs mt-1">Lo usamos para confirmar la recarga por WhatsApp</p>
                </div>
              )}
              <RechargeConditions />
              <button
                onClick={handleConfirmPayment}
                disabled={loading || !fullName || (!customer && !phone.trim())}
                className="w-full py-3.5 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                style={getBtnStyle()}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enviando...
                  </span>
                ) : 'Ya realicé la transferencia'}
              </button>
            </div>
          </>
        )}

        {step === 'confirming' && (
          <div className="text-center py-6 space-y-5" role="status" aria-label="Verificando pago">
            <div className="w-20 h-20 mx-auto relative">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full border-2 border-primary-400"
              />
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                className="absolute inset-0 rounded-full border-2 border-primary-400/60"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <svg className="w-9 h-9 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </motion.div>
              </div>
            </div>

              <div className="flex items-center justify-center gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: searchStep >= i ? [1, 1.3, 1] : 1,
                      opacity: searchStep >= i ? 1 : 0.2,
                    }}
                    transition={{ duration: 0.5 }}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                      searchStep > i ? 'bg-green-400' :
                      searchStep === i ? 'bg-primary-400' :
                      'bg-white/20'
                    }`}
                  />
                ))}
              </div>
          </div>
        )}

        {step === 'result' && (
          <RechargeResultContent success={!!rechargeResult?.success}
            title={rechargeResult?.wompiStatus === 'sandbox_approved' ? 'Prueba aprobada' : rechargeResult?.wompiStatus === 'rejected' ? 'Pago rechazado' : rechargeResult?.success ? 'Pago confirmado' : 'Pago no encontrado'}
            message={rechargeResult?.message}>
              {rechargeResult?.wompiStatus === 'rejected' && <button onClick={() => { setRechargeResult(null); setStep('select'); setPaymentMethod('wompi'); }} className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">Volver a intentar</button>}
              {!rechargeResult?.success && !rechargeResult?.wompiStatus && (
                <>
                  <button
                    onClick={() => {
                      const message = encodeURIComponent(
                        `Hola, realicé una transferencia pero no se refleja mi saldo.\n\nNombre: ${fullName}\nMonto: $${parseInt(amount || '0').toLocaleString()}\n\nNecesito ayuda con mi recarga.`
                      );
                      const whatsappNumber = settings.whatsappNumber || '3101234567';
                      window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.195.194 1.666.179.47-.015 1.725-.652 1.972-1.469.247-.817.347-1.732.372-1.817.025-.085.025-.16.05-.248.025-.098.05-.198.075-.298.049-.099.124-.199.199-.347.074-.149.124-.298.174-.447.05-.149.025-.298-.025-.447-.049-.149-.174-.298-.347-.447-.174-.149-.347-.223-.52-.298-.174-.074-.347-.149-.52-.223-.174-.074-.298-.124-.447-.174-.149-.05-.223-.124-.298-.174-.074-.05-.124-.074-.174-.099-.149-.025-.223-.074-.298-.124-.074-.049-.149-.099-.223-.149z"/>
                    </svg>
                    Contactar por WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      const target = panel ? '/r/historial-recargas' : '/historial-recargas';
                      navigate(withTenantParam(target));
                      onClose();
                    }}
                    className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Ver historial de recargas
                  </button>
                </>
              )}
              <button ref={resultCloseRef} onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors">
                Cerrar
              </button>
          </RechargeResultContent>
        )}
          </>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className={`fixed top-20 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl z-50 ${
                toast.type === 'error'
                  ? 'bg-red-500/90 text-white'
                  : 'bg-green-500/90 text-white'
              }`}
            >
              <p className="font-medium">{toast.msg}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};
