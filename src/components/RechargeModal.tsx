import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { functions, adminFunctions } from '../services/firebase';
import { X } from 'lucide-react';
import type { CheckRechargePaymentResponse } from '../types/marketplace';

interface RechargeModalProps {
  onClose: () => void;
}

export const RechargeModal = ({ onClose }: RechargeModalProps) => {
  const { customer, role } = useAuthStore();
  const { settings } = useApp();
  const navigate = useNavigate();
  const tenantId = useTenantStore((state: any) => state.tenant?.id || state.userTenantId);
  const isAdminUser = role === 'admin' || role === 'superadmin' || role === 'reseller';
  const fnInstance = isAdminUser ? adminFunctions : functions;
  const [step, setStep] = useState<'select' | 'transfer' | 'confirming' | 'result'>('select');
  const [amount, setAmount] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'error'|'success'} | null>(null);
  const [rechargeResult, setRechargeResult] = useState<{success: boolean; message: string} | null>(null);
  const [rechargeId, setRechargeId] = useState<string | null>(null);
  const [searchStep, setSearchStep] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const getBtnStyle = () => {
    const primary = settings?.primaryColor || '#E50914';
    return {
      background: `linear-gradient(135deg, ${primary}, ${primary}dd)`,
      boxShadow: `0 4px 15px -3px ${primary}80`
    };
  };

  const showToast = (msg: string, type: 'error'|'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const BRE_B_KEY = settings?.brebKey || '0035443571';
  const bankInfo = settings?.brebBankName ? `BRE-B - ${settings.brebBankName}` : 'BRE-B - GIO TECH';

  const handleWhatsapp = () => {
    const message = encodeURIComponent('Hola, quiero recargar saldo en mi cuenta. ¿Me puedes ayudar?');
    const whatsappNumber = settings.whatsappNumber || '3101234567';
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const handleTransfer = () => {
    if (!amount || parseInt(amount) < 1000) {
      showToast('Por favor ingresa un monto válido (mínimo $1,000)');
      return;
    }
    setStep('transfer');
  };

  const handleConfirmPayment = async () => {
    if (!fullName || !amount) {
      showToast('Por favor completa todos los campos');
      return;
    }

    setLoading(true);

    try {
      const createRecharge = httpsCallable(fnInstance, 'createRechargeRequest');
      const result = await createRecharge({
        customerName: fullName,
        customerPhone: customer?.phone || '',
        amount: parseInt(amount),
      });

      const rechargeId = (result.data as any)?.rechargeId;
      if (!rechargeId) throw new Error('No se pudo obtener el ID de la recarga');

      setRechargeId(rechargeId);
      setStep('confirming');
      pollCountRef.current = 0;
    } catch (error) {
      console.error('Error:', error);
      showToast('Error al procesar la solicitud. Intenta de nuevo.');
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
      setSearchAttempt(currentPoll);

      if (currentPoll <= 4) setSearchStep(0);
      else if (currentPoll <= 10) setSearchStep(1);
      else if (currentPoll <= 16) setSearchStep(2);
      else if (currentPoll <= 22) setSearchStep(3);
      else setSearchStep(4);

      if (currentPoll > MAX_POLLS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setRechargeResult({ success: false, message: 'No se pudo confirmar el pago. Contactanos por WhatsApp.' });
        setStep('result');
        return;
      }

      try {
        const checkPayment = httpsCallable(fnInstance, 'checkRechargePayment');
        const result = await checkPayment({ rechargeId, tenantId });
        const data = result.data as CheckRechargePaymentResponse;

        if (data.processed) {
          if (pollRef.current) clearInterval(pollRef.current);
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

    setTimeout(doPoll, 2000);
    pollRef.current = setInterval(doPoll, POLL_INTERVAL);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, rechargeId]);

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
        className="glass w-full max-w-md p-6 max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white"
        >
          <X size={20} />
        </button>

        {step === 'select' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-bold gradient-text">Cargar Saldo</h2>
            </div>

            <div className="relative bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 rounded-2xl p-5 mb-6 border border-yellow-400/20 overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-yellow-400/10 rounded-full blur-xl" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-yellow-500/10 rounded-full blur-lg" />
              <p className="text-yellow-300/70 text-xs uppercase tracking-wider font-medium mb-1 relative z-10">Saldo disponible</p>
              <p className="text-3xl font-bold text-yellow-400 relative z-10">${customer?.balance?.toLocaleString() || 0}</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-white/70 mb-2 font-medium">Monto a cargar</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg font-medium">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-8 pr-4 text-white text-lg font-medium focus:outline-none focus:border-primary-500/50 focus:bg-white/10 transition-all"
                  placeholder="10,000"
                  min={1000}
                />
              </div>

              <div className="flex gap-2 mt-3">
                {[10000, 20000, 50000, 100000].map(pre => (
                  <button
                    key={pre}
                    onClick={() => setAmount(String(pre))}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      parseInt(amount) === pre
                        ? 'bg-primary-500/30 text-primary-300 border border-primary-400/40'
                        : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    ${(pre / 1000).toFixed(0)}k
                  </button>
                ))}
              </div>
              <p className="text-white/30 text-xs mt-1.5">Monto mínimo: $1,000 COP</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-white/40 uppercase tracking-wider font-medium mb-2">Elegí cómo pagar</p>

              <button
                onClick={handleTransfer}
                className="w-full group relative bg-gradient-to-r from-primary-600/30 to-primary-700/20 hover:from-primary-600/50 hover:to-primary-700/30 text-white py-4 px-4 rounded-xl flex items-center gap-4 transition-all border border-primary-500/20 hover:border-primary-500/40 overflow-hidden"
              >
                <div className="absolute inset-0 bg-primary-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="text-left relative z-10">
                  <div className="font-bold text-base">Transferencia BRE-B</div>
                  <div className="text-sm text-white/60">Desde cualquier banco • Sin costo</div>
                </div>
                <svg className="w-5 h-5 text-white/30 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={handleWhatsapp}
                className="w-full group relative bg-gradient-to-r from-green-600/30 to-green-700/20 hover:from-green-600/50 hover:to-green-700/30 text-white py-4 px-4 rounded-xl flex items-center gap-4 transition-all border border-green-500/20 hover:border-green-500/40 overflow-hidden"
              >
                <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.195.194 1.666.179.47-.015 1.725-.652 1.972-1.469.247-.817.347-1.732.372-1.817.025-.085.025-.16.05-.248.025-.098.05-.198.075-.298.049-.099.124-.199.199-.347.074-.149.124-.298.174-.447.05-.149.025-.298-.025-.447-.049-.149-.174-.298-.347-.447-.174-.149-.347-.223-.52-.298-.174-.074-.347-.149-.52-.223-.174-.074-.298-.124-.447-.174-.149-.05-.223-.124-.298-.174-.074-.05-.124-.074-.174-.099-.149-.025-.223-.074-.298-.124-.074-.049-.149-.099-.223-.149z"/>
                  </svg>
                </div>
                <div className="text-left relative z-10">
                  <div className="font-bold text-base">Hablar con asesor</div>
                  <div className="text-sm text-white/60">Te atendemos por WhatsApp</div>
                </div>
                <svg className="w-5 h-5 text-white/30 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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
                        setToast({ msg: 'Clave copiada', type: 'success' });
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
              <button
                onClick={handleConfirmPayment}
                disabled={loading || !fullName}
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
          <div className="text-center py-6 space-y-5">
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

            <div>
              <h3 className="text-white font-bold text-lg">Buscando tu pago</h3>
              <p className="text-gray-400 text-sm mt-1">Estamos verificando la transferencia en Bancolombia</p>
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
              <p className="text-gray-500 text-xs mt-2">
                {searchStep === 0 && 'Conectando con el banco...'}
                {searchStep === 1 && 'Buscando pagos recientes...'}
                {searchStep === 2 && 'Revisando notificaciones...'}
                {searchStep === 3 && 'Verificando datos...'}
                {searchStep === 4 && 'Finalizando...'}
              </p>

            <div className="w-full max-w-xs mx-auto space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Progreso</span>
                <span>Intento {searchAttempt}/24</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <motion.div
                  key={searchAttempt}
                  initial={{ width: `${((searchAttempt - 1) / 24) * 100}%` }}
                  animate={{ width: `${(searchAttempt / 24) * 100}%` }}
                  transition={{ duration: 5, ease: 'linear' }}
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-300 rounded-full"
                />
              </div>
              <p className="text-gray-500 text-xs">Esto toma hasta 2 minutos aproximadamente</p>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="text-center py-6 space-y-4">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              rechargeResult?.success ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              {rechargeResult?.success ? (
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h3 className={`text-white font-bold text-lg ${rechargeResult?.success ? 'text-green-400' : ''}`}>
                {rechargeResult?.success ? 'Pago confirmado' : 'Pago no encontrado'}
              </h3>
              <p className="text-gray-400 text-sm mt-1">{rechargeResult?.message}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              {!rechargeResult?.success && (
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
                      const target = role === 'reseller' ? '/r/historial-recargas' : '/historial-recargas';
                      navigate(target);
                      onClose();
                    }}
                    className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Ver historial de recargas
                  </button>
                </>
              )}
              <button onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors">
                Cerrar
              </button>
            </div>
          </div>
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
