import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_PRIZES, DEFAULT_PAYMENT_INFO } from '../utils/roulette';
import { getUserSpinData, useSpin, spinWheel, getSpinPrice, getSpinsForFreeSpin } from '../hooks/useRoulette';
import { useAuthStore } from '../store/authStore';
import { updateBalance } from '../services/auth';
import type { RoulettePrize, UserSpinData } from '../types';
import { Gift, X, Zap, Lock } from 'lucide-react';

interface RouletteProps {}

// Colores matching con DEFAULT_PRIZES
const COLORES = {
  nothing: '#2D3748',   // gris oscuro
  crunchyroll: '#F97316', // naranja
  hbo: '#9333EA',        // púrpura
  prime: '#3B82F6',      // azul
  disney: '#1E3A8A',     // azul oscuro
  netflix: '#E50914',    // rojo
};

// Componente ruleta - CONIC-GRADIENT CORRECTO
const RouletteWheel = ({ 
  isSpinning, 
  prizeNumber,
  mustSpin,
  prizes,
  onSpinEnd,
  resetKey // para resetear el estado entre giros
}: { 
  isSpinning: boolean; 
  prizeNumber: number;
  mustSpin: boolean;
  prizes: RoulettePrize[];
  onSpinEnd: () => void;
  resetKey?: number;
}) => {
  const [rotation, setRotation] = useState(0);

  // Reset rotation cuando cambia resetKey (nuevo giro)
  useEffect(() => {
    if (resetKey !== undefined) {
      setRotation(0);
    }
  }, [resetKey]);

  useEffect(() => {
    if (mustSpin) {
      // FIX: el resultado estaba invertido (mostraba el opuesto 180°)
      // Solución: restar 180° (3 sectores) del prizeNumber
      const invertedPrizeNumber = (prizeNumber + 3) % 6;
      
      const sectorSize = 60;
      const sectorCenter = (invertedPrizeNumber * sectorSize) + (sectorSize / 2);
      const targetAngle = 90; // flecha arriba
      
      let neededRotation = targetAngle - sectorCenter;
      if (neededRotation < 0) {
        neededRotation += 360;
      }
      
      const baseRotation = 360 * 5;
      const newRotation = baseRotation + neededRotation + 90;
      
      console.log('═══ DEBUG GIRO ═══');
      console.log('Prize original:', prizeNumber, '-> invertido:', invertedPrizeNumber);
      console.log('Premio:', prizes[prizeNumber]?.name);
      console.log('Centro sector:', sectorCenter, '°');
      console.log('Rotación:', newRotation, '°');
      
      setRotation(newRotation);
    }
  }, [mustSpin, prizeNumber]);

  // Build conic-gradient with all 6 sectors
  const gradientParts = prizes.map((prize, i) => {
    const color = COLORES[prize.id as keyof typeof COLORES] || '#666';
    const start = i * 60;
    const end = (i + 1) * 60;
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');

  return (
    <div className="relative" style={{ width: 240, height: 240 }}>
      {/* Flecha - FIJA arriba */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20"
        style={{ 
          width: 0, 
          height: 0, 
          borderLeft: '16px solid transparent', 
          borderRight: '16px solid transparent', 
          borderTop: '24px solid #F59E0B',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))'
        }} />

      {/* Ruleta rotada */}
      <div className="w-full h-full rounded-full overflow-hidden"
        style={{ 
          transform: `rotate(${rotation}deg)`, 
          transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 1)' : 'none',
          background: `conic-gradient(${gradientParts})`,
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3), 0 4px 15px rgba(0,0,0,0.4)',
          border: '4px solid #1a1a1a'
        }}
        onTransitionEnd={() => isSpinning && onSpinEnd()}>
        
        {/* Labels de premios en el centro de cada sector */}
        {prizes.map((prize, i) => {
          const angle = i * 60 + 30;
          return (
            <div key={i} className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-white font-bold text-[10px] uppercase tracking-wide"
                style={{
                  position: 'absolute',
                  transform: `rotate(${angle}deg) translateY(-75px)`,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)',
                  whiteSpace: 'nowrap'
                }}>
                {prize.id === 'nothing' ? '❌' : prize.name.split(' ')[0]}
              </div>
            </div>
          );
        })}
        
        {/* Centro - tapa el área central */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-800 to-black border-4 border-gray-600 z-10 shadow-lg" />
        </div>
      </div>
    </div>
  );
};

const Roulette = () => {
  const { user, customer, refreshCustomer } = useAuthStore();
  const [userData, setUserData] = useState<UserSpinData>({ spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' });
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RoulettePrize | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const [phone, setPhone] = useState('');
  const [useFreeSpin, setUseFreeSpin] = useState(false);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const price = getSpinPrice();
  const spinsForFree = getSpinsForFreeSpin();
  const prizes = DEFAULT_PRIZES;

  useEffect(() => { 
    // Cargar datos del usuario desde Firestore si está logueado
    if (customer) {
      // Por ahora usamos localStorage para spins (se migrará después)
      setUserData(getUserSpinData()); 
    }
  }, [customer]);

  // Función para abrir la ruleta (verifica auth)
  const handleOpenRoulette = () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    setShowRoulette(true);
  };

  const handleSpinStart = async () => {
    if (isSpinning || mustSpin) return;
    
    // Verificar saldo suficiente
    if (customer && customer.balance < price) {
      alert('Saldo insuficiente. Recarga para seguir jugando.');
      return;
    }
    
    const data = getUserSpinData();
    const usingFree = useFreeSpin || data.spinsFree > 0;
    
    // Si no tiene spins gratuitos ni saldo, mostrar pago
    if (!usingFree && !customer) { 
      setShowPayment(true); 
      return; 
    }

    // Deducir del saldo si es pago
    if (customer && !usingFree) {
      try {
        await updateBalance(customer.uid, -price);
        await refreshCustomer();
      } catch (error) {
        console.error('Error deduciendo saldo:', error);
        return;
      }
    }

    const useFree = data.spinsFree > 0 && (useFreeSpin || data.spinsPaid === 0);
    const prize = spinWheel();
    const prizeIndex = prizes.findIndex(p => p.id === prize.id);
    
    console.log('→ Premio generado:', prize.name, '(idx:', prizeIndex, ')');
    
    setResult(prize);
    setPrizeNumber(prizeIndex);
    setIsSpinning(true);
    setShowResult(false);
    setMustSpin(true);
    // Incrementar key para resetear el estado interno de la ruleta
    setWheelKey(k => k + 1);
  };

  const handleSpinEnd = () => {
    console.log('→ Mostrando resultado:', result?.name);
    const data = getUserSpinData();
    const useFree = data.spinsFree > 0 && (useFreeSpin || data.spinsPaid === 0);
    const newData = useSpin(useFree, data);
    setUserData(newData);
    setIsSpinning(false);
    setMustSpin(false);
    setShowResult(true);
  };

  const handlePaymentConfirm = () => {
    if (!phone) return;
    const prize = spinWheel();
    const prizeIndex = prizes.findIndex(p => p.id === prize.id);
    setResult(prize);
    setPrizeNumber(prizeIndex);
    setShowPayment(false);
    setIsSpinning(true);
    setShowResult(false);
    setMustSpin(true);
    // Incrementar key para resetear el estado interno de la ruleta
    setWheelKey(k => k + 1);
  };

  const [wheelKey, setWheelKey] = useState(0);

  return (
    <>
      {/* Botón flotante de la ruleta */}
      <motion.button 
        initial={{ scale: 0 }} 
        animate={{ scale: 1 }} 
        className="fixed bottom-6 right-6 z-40"
        onClick={handleOpenRoulette}
      >
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-full blur-lg opacity-75 group-hover:opacity-100"></div>
          <div className="relative bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 p-4 rounded-full shadow-2xl hover:scale-110">
            <Gift size={28} className="text-white" />
          </div>
          {customer && userData.spinsFree > 0 && (
            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              {userData.spinsFree}
            </div>
          )}
        </div>
      </motion.button>

      {/* Modal pequeño para pedir registro - RECUADRO DISCRETO */}
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
                <RouletteWheel key={wheelKey} isSpinning={isSpinning} prizeNumber={prizeNumber} mustSpin={mustSpin} prizes={prizes} onSpinEnd={handleSpinEnd} />
                {userData.spinsFree > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={useFreeSpin} onChange={e => setUseFreeSpin(e.target.checked)} className="w-4 h-4 rounded accent-yellow-400" />
                    <span className="text-white/70 text-sm">Usar gratis</span>
                  </label>
                )}
                <button onClick={handleSpinStart} disabled={isSpinning} className={`w-full btn-primary text-lg py-3 ${isSpinning ? 'opacity-50' : ''}`}>
                  {isSpinning ? 'Girando...' : `Girar $${price.toLocaleString()}`}
                </button>
                <p className="text-white/40 text-sm">{userData.spinsFree > 0 ? `${userData.spinsFree} gratis` : `${spinsForFree} para gratis`}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResult && result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowResult(false)}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="glass p-6 text-center" onClick={e => e.stopPropagation()}>
              {result.id === 'nothing' ? (
                <><div className="text-5xl mb-3">😢</div><h3 className="text-xl font-bold">¡Casi!</h3><p className="text-white/70">No fue esta vez.</p></>
              ) : (
                <><div className="text-5xl mb-3">🎉</div><h3 className="text-xl font-bold">¡Felicidades!</h3><p className="text-white/70">Ganaste:</p><p className="text-2xl font-bold gradient-text">{result.name}</p></>
              )}
              <button className="btn-primary w-full mt-4" onClick={() => setShowResult(false)}>Continuar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPayment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowPayment(false)}>
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="glass p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-center mb-3">💳 Pago</h3>
              <div className="space-y-2 mb-3">
                <div className="bg-white/5 p-2 rounded"><div className="flex gap-2"><span>💚</span><span className="font-bold">Nequi</span></div><p className="text-xs text-white/50">Envía ${price} a:</p><p className="font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.nequi}</p></div>
                <div className="bg-white/5 p-2 rounded"><div className="flex gap-2"><span>💙</span><span className="font-bold">Daviplata</span></div><p className="text-xs text-white/50">Envía ${price} a:</p><p className="font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.daviplata}</p></div>
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
    </>
  );
};

export default Roulette;