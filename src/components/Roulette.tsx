import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_PRIZES, DEFAULT_PAYMENT_INFO } from '../utils/roulette';
import { getUserSpinData, useSpin, spinWheel, getSpinPrice, getSpinsForFreeSpin, getPaymentInfo } from '../hooks/useRoulette';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import { updateBalance } from '../services/auth';
import type { RoulettePrize, UserSpinData } from '../types';
import { Gift, X, Zap } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import RechargeModal from './RechargeModal';

// Función para notificar premio ganado via Cloud Function
async function notifyWinner(userName: string, phone: string, prize: string, prizeId: string) {
  try {
    const notifyPrizeWon = httpsCallable(functions, 'notifyPrizeWon');
    await notifyPrizeWon({ userName, phone, prize, prizeId });
    console.log('Notificación de premio enviada');
  } catch (error) {
    console.error('Error notifyPrizeWon:', error);
  }
}

const COLORES: Record<string, string> = {
  nothing: '#2D3748',
  crunchyroll: '#F97316',
  hbo: '#9333EA',
  prime: '#3B82F6',
  disney: '#1E3A8A',
  netflix: '#E50914',
};

// Componente ruleta original
const RouletteWheel = ({ 
  isSpinning, 
  prizeNumber,
  mustSpin,
  prizes,
  onSpinEnd
}: { 
  isSpinning: boolean; 
  prizeNumber: number;
  mustSpin: boolean;
  prizes: RoulettePrize[];
  onSpinEnd: () => void;
}) => {
  const [rotation, setRotation] = useState(0);
  const isAnimatingRef = useRef(false);
  
  // Cuando debe girar, calcular y aplicar rotación
  useEffect(() => {
    if (mustSpin && !isAnimatingRef.current) {
      isAnimatingRef.current = true;
      
      // Resetear a 0 primero (sin transición)
      setRotation(0);
      
      // Luego aplicar la rotación target (con transición)
      requestAnimationFrame(() => {
        const inverted = (prizeNumber + 3) % 6;
        const sectorCenter = (inverted * 60) + 30;
        let needed = 90 - sectorCenter;
        if (needed < 0) needed += 360;
        const target = (360 * 5) + needed + 90;
        setRotation(target);
        isAnimatingRef.current = false;
      });
    }
  }, [mustSpin, prizeNumber]);

  const gradientParts = prizes.map((prize, i) => {
    const color = COLORES[prize.id] || '#666';
    const start = i * 60;
    const end = (i + 1) * 60;
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');

  return (
    <div className="relative" style={{ width: 240, height: 240 }}>
      {/* Flecha fija arriba */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20"
        style={{ 
          width: 0, height: 0, 
          borderLeft: '16px solid transparent', 
          borderRight: '16px solid transparent', 
          borderTop: '24px solid #F59E0B',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))'
        }} />

      {/* Ruleta */}
      <div className="w-full h-full rounded-full overflow-hidden"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 1)' : 'none',
          background: `conic-gradient(${gradientParts})`,
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3), 0 4px 15px rgba(0,0,0,0.4)',
          border: '4px solid #1a1a1a'
        }}
        onTransitionEnd={() => isSpinning && onSpinEnd()}>
        
        {prizes.map((prize, i) => {
          const angle = i * 60 + 30;
          return (
            <div key={i} className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-white font-bold text-[10px] uppercase tracking-wide"
                style={{
                  position: 'absolute',
                  transform: `rotate(${angle}deg) translateY(-75px)`,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                  whiteSpace: 'nowrap'
                }}>
                {prize.id === 'nothing' ? '❌' : prize.name.split(' ')[0]}
              </div>
            </div>
          );
        })}
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-800 to-black border-4 border-gray-600 z-10 shadow-lg" />
        </div>
      </div>
    </div>
  );
};

const Roulette = () => {
  const { user, customer, refreshCustomer } = useAuthStore();
  const tenant = useTenantStore((state) => state.tenant);
  const tenantId = tenant?.id || '';
  const [userData, setUserData] = useState<UserSpinData>({ spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' });
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RoulettePrize | null>(null);
  const [showPayment, setShowPayment] = useState(false); // Modal viejo de Nequi (ya no se usa para recargas)
  const [showRechargeModal, setShowRechargeModal] = useState(false); // Modal nuevo de recargas
  const [showRoulette, setShowRoulette] = useState(false);
  const [phone, setPhone] = useState('');
  const [useFreeSpin, setUseFreeSpin] = useState(false);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showConfirmSpin, setShowConfirmSpin] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // Obtener info de pago desde la config del tenant
  const paymentInfo = tenantId ? getPaymentInfo(tenantId) : { nequi: DEFAULT_PAYMENT_INFO.nequi, daviplata: DEFAULT_PAYMENT_INFO.daviplata, breb: '' };
  
  const price = getSpinPrice();

  // Cargar preferencia de no preguntar
  useEffect(() => {
    const saved = localStorage.getItem('roulette_dont_ask');
    if (saved === 'true') {
      setDontAskAgain(true);
    }
  }, []);

  // Guardar preferencia
  const handleDontAskChange = (checked: boolean) => {
    setDontAskAgain(checked);
    localStorage.setItem('roulette_dont_ask', String(checked));
  };
  const spinsForFree = getSpinsForFreeSpin();
  const prizes = DEFAULT_PRIZES;

  useEffect(() => { 
    if (customer) {
      setUserData(getUserSpinData()); 
    }
  }, [customer]);

  const handleOpenRoulette = () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    // Resetear estados de animación cuando se abre el modal
    setIsSpinning(false);
    setMustSpin(false);
    setPrizeNumber(0);
    setShowResult(false);
    setResult(null);
    setShowRoulette(true);
  };

  const handleSpinStart = useCallback(async () => {
    if (isSpinning || mustSpin) return;
    
    const data = getUserSpinData();
    const wantsFree = useFreeSpin && data.spinsFree > 0;
    
    // Si no está logueado o no tiene saldo, mostrar modal de recarga real (BRE-B)
    if (!customer || (customer.balance < price && !wantsFree)) {
      setShowRechargeModal(true);
      return;
    }
    
    // Si no tiene spins gratis y no ha pedido no preguntar, mostrar confirmación
    if (!wantsFree && !dontAskAgain && !useFreeSpin) {
      setShowConfirmSpin(true);
      return;
    }

    // Ejecutar el giro
    await executeSpin(wantsFree);
  }, [isSpinning, mustSpin, useFreeSpin, customer, price, prizes, refreshCustomer, dontAskAgain]);

  // Función que ejecuta el giro (separada para reuse)
  const executeSpin = useCallback(async (wantsFree: boolean) => {
    if (customer && !wantsFree) {
      try {
        await updateBalance(customer.uid, -price);
        await refreshCustomer();
      } catch (error) {
        console.error('Error deduciendo saldo:', error);
        return;
      }
    }

    // 1. Resetear TODOS los estados ANOES de setear el nuevo giro
    setIsSpinning(false);
    setMustSpin(false);
    setPrizeNumber(999); // Valor inválido para forzar detección de cambio
    
    // Generar premio
    const prize = spinWheel();
    if (!prize) {
      console.error('spinWheel devolvió null!');
      return;
    }
    
    const prizeIndex = prizes.findIndex(p => p.id === prize.id);
    
    setResult(prize);
    setShowResult(false);
    
    // 2. Pequeño delay para que todo resetee
    setTimeout(() => {
      setPrizeNumber(prizeIndex);
      // 3. Otro delay para que prizeNumber se procese
      setTimeout(() => {
        setIsSpinning(true);
        setMustSpin(true);
      }, 50);
    }, 50);
  }, [customer, price, prizes, refreshCustomer]);

  // Confirmación aceptada
  const handleConfirmSpinAccepted = () => {
    setShowConfirmSpin(false);
    executeSpin(false);
  };

  const handleSpinEnd = useCallback(() => {
    const data = getUserSpinData();
    const useFree = useFreeSpin && data.spinsFree > 0;
    const newData = useSpin(useFree, data);
    setUserData(newData);
    setIsSpinning(false);
    setMustSpin(false);
    setShowResult(true);

    if (result && result.id !== 'nothing' && customer) {
      // Notificar via Cloud Function (usa Telegram configurado en Firebase)
      notifyWinner(
        customer.firstName || customer.email || 'Usuario',
        customer.phone || '',
        result.name,
        result.id
      );
    }
  }, [result, useFreeSpin, customer]);

  const handlePaymentConfirm = useCallback(() => {
    if (!phone) return;
    const prize = spinWheel();
    const prizeIndex = prizes.findIndex(p => p.id === prize.id);
    setResult(prize);
    setPrizeNumber(prizeIndex);
    setShowPayment(false);
    setIsSpinning(true);
    setShowResult(false);
    setMustSpin(true);
  }, [phone, prizes]);

  return (
    <>
      {/* Botón flotante */}
      <motion.button 
        initial={{ scale: 0 }} 
        animate={{ scale: 1 }} 
        className="fixed bottom-6 right-6 z-40 group"
        onClick={handleOpenRoulette}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-full blur-lg opacity-75 group-hover:opacity-100"></div>
          <div className="relative bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 p-4 rounded-full shadow-2xl hover:scale-110">
            <Gift size={28} className="text-white" />
          </div>
          {customer && userData.spinsFree > 0 && (
            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              {userData.spinsFree}
            </div>
          )}
          {/* Tooltip "Prueba tu suerte" - visible on mobile, hover on desktop */}
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none md:pointer-events-auto">
            <span className="animate-pulse">🎰</span> Prueba tu suerte
            <div className="absolute left-full top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45 hidden md:block"></div>
          </div>
        </div>
      </motion.button>

      {/* Modal registro */}
      <AnimatePresence>
        {showAuthPrompt && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 pb-24"
            onClick={() => setShowAuthPrompt(false)}
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-gray-800 border border-yellow-500/50 rounded-xl px-4 py-3 max-w-xs mx-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">🎰</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">¡Regístrate para jugar!</p>
                  <p className="text-white/60 text-xs">Es gratis y rápido</p>
                </div>
                <button 
                  onClick={() => {
                    setShowAuthPrompt(false);
                    window.dispatchEvent(new CustomEvent('openAuthModal', { detail: 'register' }));
                  }}
                  className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1.5 rounded-lg"
                >
                  Registrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal ruleta */}
      <AnimatePresence>
        {showRoulette && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRoulette(false)}>
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              className="glass w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowRoulette(false)} className="absolute top-2 right-2 text-white/50 z-20"><X size={18} /></button>
              <div className="flex flex-col items-center gap-3">
                <h2 className="text-xl font-bold gradient-text">🎰 Ruleta</h2>
                <div className="flex gap-3">
                  <div className="bg-white/5 px-3 py-1.5 rounded flex items-center gap-2">
                    <Zap size={12} className="text-yellow-400" /><span className="text-white/70 text-sm">Gratis:</span>
                    <span className="text-yellow-400 font-bold">{userData.spinsFree}</span>
                  </div>
                  <div className="bg-white/5 px-3 py-1.5 rounded">
                    <span className="text-white/70 text-sm">Pagados:</span>
                    <span className="text-primary-400 font-bold ml-1">{userData.spinsPaid}</span>
                  </div>
                </div>
                <RouletteWheel key={userData.spinsPaid + userData.spinsFree} isSpinning={isSpinning} prizeNumber={prizeNumber} mustSpin={mustSpin} prizes={prizes} onSpinEnd={handleSpinEnd} />
                {userData.spinsFree > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={useFreeSpin} onChange={e => setUseFreeSpin(e.target.checked)} className="w-4 h-4 rounded accent-yellow-400" />
                    <span className="text-white/70 text-sm">Usar gratis</span>
                  </label>
                )}
                <button onClick={handleSpinStart} disabled={isSpinning} className={`w-full btn-primary text-lg py-3 ${isSpinning ? 'opacity-50' : ''}`}>
                  {isSpinning ? 'Girando...' : (useFreeSpin && userData.spinsFree > 0 ? 'Girar gratis' : `Girar $${price.toLocaleString()}`)}
                </button>
                <p className="text-white/40 text-sm">{userData.spinsFree > 0 ? `${userData.spinsFree} gratis` : `${spinsForFree} para gratis`}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal resultado */}
      <AnimatePresence>
        {showResult && result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowResult(false)}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="glass p-6 text-center" onClick={e => e.stopPropagation()}>
              {result.id === 'nothing' ? (
                <><div className="text-5xl mb-3">😢</div><h3 className="text-xl font-bold">¡Casi!</h3><p className="text-white/70">No fue esta vez.</p></>
              ) : (
                <><div className="text-5xl mb-3">🎉</div><h3 className="text-xl font-bold">¡Felicidades!</h3><p className="text-white/70">Ganaste:</p><p className="text-2xl font-bold gradient-text mb-2">{result.name}</p><p className="text-white/60 text-xs bg-white/5 rounded-lg p-2">🎁 Tu premio será entregado en minutos al WhatsApp registrado</p></>
              )}
              <button className="btn-primary w-full mt-4" onClick={() => setShowResult(false)}>Continuar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal confirmación de giro */}
      <AnimatePresence>
        {showConfirmSpin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmSpin(false)}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="glass p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🎰</div>
                <h3 className="text-lg font-bold">¿Confirmar giro?</h3>
              </div>
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm font-medium text-center">
                  ⚠️ Se descontarán <span className="font-bold text-lg">${price.toLocaleString()}</span> de tu cuenta
                </p>
                <p className="text-white/60 text-xs text-center mt-1">
                  ¿Estás seguro de tu destino?
                </p>
              </div>
              <label className="flex items-start gap-3 mb-4 cursor-pointer bg-white/5 p-3 rounded-lg">
                <input 
                  type="checkbox" 
                  checked={dontAskAgain} 
                  onChange={e => handleDontAskChange(e.target.checked)} 
                  className="w-5 h-5 mt-0.5 rounded accent-yellow-400" 
                />
                <div>
                  <p className="text-white text-sm">No volver a preguntar</p>
                  <p className="text-white/50 text-xs">Recordaré tu preferencia</p>
                </div>
              </label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowConfirmSpin(false)} 
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmSpinAccepted} 
                  className="btn-primary flex-1 !bg-red-500 hover:!bg-red-600"
                >
                  Girar y probar suerte
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal pago (deprecated - ya no se usa para recargas) */}
      <AnimatePresence>
        {showPayment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowPayment(false)}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="glass p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-center mb-3">💳 Pago</h3>
              <div className="space-y-2 mb-3">
                {paymentInfo.nequi && <div className="bg-white/5 p-2 rounded"><div className="flex gap-2"><span>💚</span><span className="font-bold">Nequi</span></div><p className="text-xs text-white/50">Envía ${price} a:</p><p className="font-bold text-primary-400">{paymentInfo.nequi}</p></div>}
                {paymentInfo.daviplata && <div className="bg-white/5 p-2 rounded"><div className="flex gap-2"><span>💙</span><span className="font-bold">Daviplata</span></div><p className="text-xs text-white/50">Envía ${price} a:</p><p className="font-bold text-primary-400">{paymentInfo.daviplata}</p></div>}
              </div>
              <div className="mb-3"><label className="block text-sm mb-1">Tu número:</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="3101234567" className="input-field" /></div>
              <div className="flex gap-2">
                <button onClick={() => setShowPayment(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handlePaymentConfirm} disabled={!phone} className="btn-primary flex-1">Ya pagué</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de recarga (cuando no tiene saldo) */}
      {showRechargeModal && (
        <RechargeModal onClose={() => setShowRechargeModal(false)} />
      )}
    </>
  );
};

export default Roulette;