import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_PRIZES, DEFAULT_PAYMENT_INFO } from '../utils/roulette';
import { getUserSpinData, useSpin, spinWheel, getSpinPrice, getSpinsForFreeSpin } from '../hooks/useRoulette';
import type { RoulettePrize, UserSpinData } from '../types';
import { Gift, X, Zap, RotateCcw } from 'lucide-react';

interface RouletteProps {
  tenantId?: string;
}

// Colores por premio
const PRIZE_COLORS: Record<string, string> = {
  nothing: '#1F2937',      // Gris oscuro (X nada)
  netflix: '#E50914',      // Rojo Netflix
  disney: '#1E3A8A',      // Azul oscuro Disney
  prime: '#3B82F6',        // Azul claro Prime Video
  crunchyroll: '#F97316',  // Naranja Crunchyroll
  hbo: '#9333EA',          // Púrpura HBO
};

const Roulette = ({ tenantId }: RouletteProps) => {
  const [userData, setUserData] = useState<UserSpinData>({ spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' });
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RoulettePrize | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const [phone, setPhone] = useState('');
  const [useFreeSpin, setUseFreeSpin] = useState(false);
  const [rotation, setRotation] = useState(0);

  const price = getSpinPrice();
  const spinsForFree = getSpinsForFreeSpin();
  const prizes = DEFAULT_PRIZES;
  const segmentAngle = 360 / prizes.length;

  // Función helper para calcular puntos del polígono
  const getPoint = (angleInDegrees: number): string => {
    const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180);
    const radius = 50;
    const x = 50 + radius * Math.cos(angleInRadians);
    const y = 50 + radius * Math.sin(angleInRadians);
    return `${x}% ${y}%`;
  };

  useEffect(() => {
    setUserData(getUserSpinData());
  }, []);

  const getPrizeColor = (prize: RoulettePrize): string => {
    return PRIZE_COLORS[prize.id] || '#6B7280';
  };

  const handleSpin = async () => {
    if (isSpinning) return;
    
    const data = getUserSpinData();
    const usingFree = useFreeSpin || data.spinsFree > 0;
    
    if (!usingFree && data.spinsPaid === 0) {
      setShowPayment(true);
      return;
    }

    setIsSpinning(true);
    setShowResult(false);

    const useFree = data.spinsFree > 0 && (useFreeSpin || data.spinsPaid === 0);
    
    // Animación de giro
    const spins = 5 + Math.random() * 3;
    const newRotation = rotation + (spins * 360);
    setRotation(newRotation);
    
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const prize = spinWheel();
    setResult(prize);
    
    const newData = useSpin(useFree, data);
    setUserData(newData);
    
    setIsSpinning(false);
    setShowResult(true);
  };

  const handlePaymentConfirm = () => {
    if (!phone) return;
    
    setShowPayment(false);
    setIsSpinning(true);
    
    const spins = 5 + Math.random() * 3;
    const newRotation = rotation + (spins * 360);
    setRotation(newRotation);
    
    setTimeout(async () => {
      const data = getUserSpinData();
      const prize = spinWheel();
      setResult(prize);
      
      const newData = useSpin(false, data);
      setUserData(newData);
      
      setIsSpinning(false);
      setShowResult(true);
    }, 2500);
  };

  return (
    <>
      {/* Botón flotante discreto */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-6 right-6 z-40"
        onClick={() => setShowRoulette(true)}
      >
        <div className="relative group">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-full blur-lg opacity-75 group-hover:opacity-100 transition-opacity"></div>
          
          {/* Botón principal */}
          <div className="relative bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 p-4 rounded-full shadow-2xl hover:scale-110 transition-transform cursor-pointer">
            <Gift size={28} className="text-white" />
          </div>
          
          {/* Badge de giros gratis */}
          {userData.spinsFree > 0 && (
            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
              {userData.spinsFree}
            </div>
          )}
        </div>
        
        {/* Tooltip */}
        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-2 bg-black/90 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          🎰 Gira y gana!
        </div>
      </motion.button>

      {/* Modal de la ruleta */}
      <AnimatePresence>
        {showRoulette && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowRoulette(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="glass relative max-w-lg w-full p-6 md:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Botón cerrar */}
              <button
                onClick={() => setShowRoulette(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold gradient-text mb-1">
                  🎰 Ruleta de Premios
                </h2>
                <p className="text-white/60 text-sm">
                  Gira y gana premios exclusivos
                </p>
              </div>

              {/* Info del usuario */}
              <div className="flex justify-center gap-3 mb-4">
                <div className="bg-white/5 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <Zap size={14} className="text-yellow-400" />
                  <span className="text-white/70 text-sm">Gratis:</span>
                  <span className="text-yellow-400 font-bold">{userData.spinsFree}</span>
                </div>
                <div className="bg-white/5 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <span className="text-white/70 text-sm">Pagados:</span>
                  <span className="text-primary-400 font-bold">{userData.spinsPaid}</span>
                </div>
              </div>

              {/* La Ruleta */}
              <div className="relative flex justify-center items-center my-6">
                {/* Flecha indicadora */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20">
                  <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[25px] border-t-yellow-400 drop-shadow-lg"></div>
                </div>

                {/* Rueda */}
                <div
                  className="relative w-56 h-56 md:w-64 md:h-64 rounded-full shadow-2xl overflow-hidden border-4 border-white"
                  style={{ 
                    transform: `rotate(${rotation}deg)`,
                    transition: isSpinning ? 'transform 2.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'transform 0.5s ease'
                  }}
                >
                  {prizes.map((prize, index) => {
                    const color = getPrizeColor(prize);
                    const startAngle = index * segmentAngle;
                    
                    return (
                      <div
                        key={prize.id}
                        className="absolute w-full h-full"
                        style={{
                          clipPath: `polygon(50% 50%, ${getPoint(startAngle)} ${getPoint(startAngle + segmentAngle)})`,
                          background: color,
                        }}
                      >
                        {/* Texto del premio */}
                        <span 
                          className="absolute text-white text-xs font-bold drop-shadow-md"
                          style={{
                            top: '50%',
                            left: '50%',
                            transform: `rotate(${startAngle + segmentAngle / 2 - 90}deg) translate(45px, -50%)`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {prize.name}
                        </span>
                      </div>
                    );
                  })}
                  
                  {/* Centro */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg z-10 border-3 border-white">
                    <span className="text-xl">🎰</span>
                  </div>
                </div>
              </div>

              {/* Checkbox giro gratis */}
              {userData.spinsFree > 0 && (
                <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useFreeSpin}
                    onChange={(e) => setUseFreeSpin(e.target.checked)}
                    className="w-4 h-4 rounded accent-yellow-400"
                  />
                  <span className="text-white/70 text-sm">Usar giro gratis</span>
                </label>
              )}

              {/* Botón de girar */}
              <div className="text-center">
                <button
                  onClick={handleSpin}
                  disabled={isSpinning}
                  className={`btn-primary text-lg px-10 py-3 ${
                    isSpinning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isSpinning ? 'Girando...' : `Girar $${price.toLocaleString()}`}
                </button>

                <p className="text-white/40 text-xs mt-2">
                  {userData.spinsFree > 0 
                    ? `Tienes ${userData.spinsFree} giro${userData.spinsFree > 1 ? 's' : ''} gratis`
                    : `Gira ${spinsForFree} veces para ganar 1 giro gratis!`
                  }
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de resultado */}
      <AnimatePresence>
        {showResult && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowResult(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="glass p-8 max-w-sm text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {result.id === 'nothing' ? (
                <>
                  <div className="text-6xl mb-4">😢</div>
                  <h3 className="text-2xl font-bold text-white mb-2">¡Casi lo logras!</h3>
                  <p className="text-white/70 mb-4">No fue esta vez. ¡Intentá de nuevo!</p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-2xl font-bold text-white mb-2">¡Felicidades!</h3>
                  <p className="text-white/70 mb-2">Ganaste:</p>
                  <p className="text-3xl font-bold gradient-text mb-4">{result.name}</p>
                  
                  <div className="bg-primary-500/20 p-4 rounded-lg mb-4">
                    <p className="text-sm text-white/70">
                      El premio será enviado a tu WhatsApp.
                      <br />
                      <span className="text-primary-400">Próximamente: ingresa tu número</span>
                    </p>
                  </div>
                </>
              )}
              
              <button
                onClick={() => setShowResult(false)}
                className="btn-primary w-full"
              >
                Continuar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de pago */}
      <AnimatePresence>
        {showPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowPayment(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="glass p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-4 text-center">
                💳 Método de Pago
              </h3>
              
              <div className="space-y-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">💚</span>
                    <span className="font-bold text-white">Nequi</span>
                  </div>
                  <p className="text-white/50 text-xs">Envía ${price.toLocaleString()} a:</p>
                  <p className="text-xl font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.nequi}</p>
                </div>

                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">💙</span>
                    <span className="font-bold text-white">Daviplata</span>
                  </div>
                  <p className="text-white/50 text-xs">Envía ${price.toLocaleString()} a:</p>
                  <p className="text-xl font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.daviplata}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-white/70 mb-2 text-sm">
                  Tu número (para el premio)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="3101234567"
                  className="input-field"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPayment(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePaymentConfirm}
                  disabled={!phone}
                  className="btn-primary flex-1"
                >
                  Ya pagué
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Roulette;
