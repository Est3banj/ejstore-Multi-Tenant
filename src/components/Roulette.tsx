import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchRouletteConfig, executeServerSpin, fetchSpinData, notifyPrizeWon } from '../hooks/useRoulette';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import type { RoulettePrize, CustomerSpinData } from '../types';
import { Gift, X } from 'lucide-react';

const PRIZE_COLORS: Record<string, string> = {
  nothing: '#2D3748',
  netflix: '#E50914',
  disney: '#1E3A8A',
  hbo: '#9333EA',
  prime: '#3B82F6',
  crunchyroll: '#F97316',
};

const PALETTE = [
  '#E50914', '#1E3A8A', '#9333EA', '#3B82F6',
  '#F97316', '#059669', '#DC2626', '#7C3AED',
];

function getSegmentColor(prize: RoulettePrize, index: number): string {
  return PRIZE_COLORS[prize.id] || PALETTE[index % PALETTE.length];
}

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
  const segmentAngle = 360 / prizes.length;

  useEffect(() => {
    if (mustSpin && !isAnimatingRef.current && prizes.length > 0) {
      isAnimatingRef.current = true;

      setRotation(0);

      requestAnimationFrame(() => {
        const inverted = (prizeNumber + Math.floor(prizes.length / 2)) % prizes.length;
        const sectorCenter = (inverted * segmentAngle) + (segmentAngle / 2);
        let needed = 90 - sectorCenter;
        if (needed < 0) needed += 360;
        const target = (360 * 5) + needed + 90;
        setRotation(target);
        isAnimatingRef.current = false;
      });
    }
  }, [mustSpin, prizeNumber, prizes.length, segmentAngle]);

  const gradientParts = prizes.length === 0 ? '#2D3748 0deg 360deg' : prizes.map((prize, i) => {
    const color = getSegmentColor(prize, i);
    const start = i * segmentAngle;
    const end = (i + 1) * segmentAngle;
    return `${color} ${start}deg ${end}deg`;
  }).join(', ');

  return (
    <div className="relative" style={{ width: 240, height: 240 }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20"
        style={{
          width: 0, height: 0,
          borderLeft: '16px solid transparent',
          borderRight: '16px solid transparent',
          borderTop: '24px solid #F59E0B',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))'
        }} />

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
          const angle = i * segmentAngle + (segmentAngle / 2);
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
  const [spinData, setSpinData] = useState<CustomerSpinData | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RoulettePrize | null>(null);
  const [showRoulette, setShowRoulette] = useState(false);
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [rouletteConfig, setRouletteConfig] = useState<{
    pricePerSpin: number;
    spinsForFreeSpin: number;
    prizes: RoulettePrize[];
    isEnabled: boolean;
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const loadConfig = async () => {
      const config = await fetchRouletteConfig(tenantId);
      if (config) {
        setRouletteConfig({
          pricePerSpin: config.pricePerSpin || 0,
          spinsForFreeSpin: config.spinsForFreeSpin || 1,
          prizes: config.prizes || [],
          isEnabled: config.isEnabled !== false,
        });
      }
    };

    loadConfig();
  }, [tenantId]);

  const price = rouletteConfig?.pricePerSpin || 0;
  const prizes = rouletteConfig?.prizes || [];

  const loadSpinData = useCallback(async () => {
    if (customer) {
      const data = await fetchSpinData(customer.uid);
      setSpinData(data);
    }
  }, [customer]);

  useEffect(() => {
    loadSpinData();
  }, [customer, loadSpinData]);

  const handleOpenRoulette = () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    setIsSpinning(false);
    setMustSpin(false);
    setPrizeNumber(0);
    setShowResult(false);
    setResult(null);
    setShowRoulette(true);
    setServerError(null);
    loadSpinData();
  };

  const handleSpinStart = useCallback(async () => {
    if (isSpinning || mustSpin) return;

    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    if (!customer) {
      setShowAuthPrompt(true);
      return;
    }

    setIsSpinning(true);
    setServerError(null);

    try {
      const serverResult = await executeServerSpin(tenantId);

      const prizeIndex = prizes.findIndex(p => p.id === serverResult.prize.id);
      const wonPrize = prizeIndex >= 0
        ? prizes[prizeIndex]
        : { id: serverResult.prize.id, name: serverResult.prize.name, probability: 0, cost: 0, isActive: true };

      await refreshCustomer();
      await loadSpinData();

      // Notificar premio (no bloqueante)
      if (serverResult.transactionId) {
        try {
          await notifyPrizeWon(serverResult.transactionId);
        } catch (notifError) {
          console.error('Error notificando premio:', notifError);
        }
      }

      setIsSpinning(false);
      setMustSpin(false);
      setResult(wonPrize);
      setShowResult(false);

      setPrizeNumber(999);

      setTimeout(() => {
        setPrizeNumber(prizeIndex >= 0 ? prizeIndex : 0);
        setTimeout(() => {
          setIsSpinning(true);
          setMustSpin(true);
        }, 50);
      }, 50);
    } catch (err: any) {
      setIsSpinning(false);
      const msg = err.message || 'Error al girar la ruleta';
      setServerError(msg);

      if (err.code === 'failed-precondition' && (
        msg.toLowerCase().includes('saldo') || msg.toLowerCase().includes('insuficiente')
      )) {
        setTimeout(() => {
          setShowRoulette(false);
          window.dispatchEvent(new CustomEvent('openRechargeModal'));
        }, 2000);
      }
    }
  }, [isSpinning, mustSpin, user, customer, tenantId, prizes, refreshCustomer, loadSpinData]);

  const handleSpinEnd = useCallback(() => {
    setIsSpinning(false);
    setMustSpin(false);
    setShowResult(true);
  }, []);

  if (prizes.length === 0 && rouletteConfig !== null) return null;

  return (
    <>
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
          {customer && spinData && spinData.spinsFreeToday > 0 && (
            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              {spinData.spinsFreeToday}
            </div>
          )}
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none md:pointer-events-auto">
            <span className="animate-pulse">🎰</span> Prueba tu suerte
            <div className="absolute left-full top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45 hidden md:block"></div>
          </div>
        </div>
      </motion.button>

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
                {spinData && (
                  <div className="flex gap-3">
                    <div className="bg-white/5 px-3 py-1.5 rounded">
                      <span className="text-white/70 text-sm">Total pagados:</span>
                      <span className="text-primary-400 font-bold ml-1">{spinData.totalSpinsPaid}</span>
                    </div>
                  </div>
                )}
                <RouletteWheel key={showResult ? 1 : 0} isSpinning={isSpinning} prizeNumber={prizeNumber} mustSpin={mustSpin} prizes={prizes} onSpinEnd={handleSpinEnd} />
                <button onClick={handleSpinStart} disabled={isSpinning || prizes.length === 0} className={`w-full btn-primary text-lg py-3 ${isSpinning ? 'opacity-50' : ''}`}>
                  {isSpinning ? 'Girando...' : `Girar $${price.toLocaleString()}`}
                </button>
                {serverError && (
                  <p className="text-red-400 text-sm text-center">{serverError}</p>
                )}
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
                <><div className="text-5xl mb-3">🎉</div><h3 className="text-xl font-bold">¡Felicidades!</h3><p className="text-white/70">Ganaste:</p><p className="text-2xl font-bold gradient-text mb-2">{result.name}</p><p className="text-white/60 text-xs bg-white/5 rounded-lg p-2">🎁 Tu premio será entregado en minutos al WhatsApp registrado</p></>
              )}
              <button className="btn-primary w-full mt-4" onClick={() => setShowResult(false)}>Continuar</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Roulette;