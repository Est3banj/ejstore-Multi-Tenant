import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_PRIZES, DEFAULT_PAYMENT_INFO } from '../utils/roulette';
import { getUserSpinData, useSpin, spinWheel, getSpinPrice, getSpinsForFreeSpin, canSpin } from '../hooks/useRoulette';
import type { RoulettePrize, UserSpinData } from '../types';

interface RouletteProps {
  tenantId?: string;
}

const Roulette = ({ tenantId }: RouletteProps) => {
  const [userData, setUserData] = useState<UserSpinData>({ spinsPaid: 0, spinsFree: 0, todaySpins: 0, lastSpinDate: '' });
  const [isSpinning, setIsSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<RoulettePrize | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [phone, setPhone] = useState('');
  const [useFreeSpin, setUseFreeSpin] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  const price = getSpinPrice();
  const spinsForFree = getSpinsForFreeSpin();

  useEffect(() => {
    setUserData(getUserSpinData());
  }, []);

  const handleSpin = async () => {
    if (isSpinning) return;
    
    const data = getUserSpinData();
    const usingFree = useFreeSpin || data.spinsFree > 0;
    
    if (!usingFree && data.spinsPaid === 0) {
      // No tiene giros, mostrar pago
      setShowPayment(true);
      return;
    }

    setIsSpinning(true);
    setShowResult(false);

    // Determinar si usar giro gratis o pago
    const useFree = data.spinsFree > 0 && (useFreeSpin || data.spinsPaid === 0);
    
    // Simular tiempo de giro (2-3 segundos)
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Obtener resultado
    const prize = spinWheel();
    setResult(prize);
    
    // Actualizar datos del usuario
    const newData = useSpin(useFree, data);
    setUserData(newData);
    
    setIsSpinning(false);
    setShowResult(true);
  };

  const handlePaymentConfirm = () => {
    if (!phone) return;
    
    // Aquí en el futuro se integraría MercadoPago
    // Por ahora solo confirma el "pago" y permite girar
    setShowPayment(false);
    setIsSpinning(true);
    
    // Simular giro después de "pago"
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

  const prizes = DEFAULT_PRIZES;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-4xl font-bold gradient-text mb-2">
          🎰 Ruleta de Premios
        </h2>
        <p className="text-white/70">
          Gira y gana premios exclusivos
        </p>
      </motion.div>

      {/* Info del usuario */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center gap-4 mb-6"
      >
        <div className="glass px-4 py-2 rounded-lg">
          <span className="text-white/50 text-sm">Giros Gratis:</span>
          <span className="text-primary-400 font-bold ml-2">{userData.spinsFree}</span>
        </div>
        <div className="glass px-4 py-2 rounded-lg">
          <span className="text-white/50 text-sm">Giros Pagados:</span>
          <span className="text-primary-400 font-bold ml-2">{userData.spinsPaid}</span>
        </div>
        {userData.spinsPaid > 0 && userData.spinsPaid % spinsForFree === 0 && (
          <div className="glass px-4 py-2 rounded-lg bg-green-500/20 border-green-500/50">
            <span className="text-green-400 font-bold">🎁 Giros gratis disponibles!</span>
          </div>
        )}
      </motion.div>

      {/* La Ruleta */}
      <div className="relative flex justify-center items-center my-8">
        {/* Flecha indicadora */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
          <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[30px] border-t-primary-500 drop-shadow-lg"></div>
        </div>

        {/* Rueda */}
        <motion.div
          ref={wheelRef}
          className="relative w-80 h-80 md:w-96 md:h-96 rounded-full border-8 border-primary-600 shadow-2xl shadow-primary-500/50 overflow-hidden"
          animate={{ rotate: isSpinning ? 360 * 5 : 0 }}
          transition={{ 
            duration: isSpinning ? 2.5 : 0, 
            ease: isSpinning ? [0.25, 0.1, 0.25, 1] : 'easeOut' 
          }}
        >
          {/* Segmentos de la ruleta */}
          <div className="w-full h-full relative">
            {prizes.map((prize, index) => {
              const angle = (360 / prizes.length) * index;
              const isWin = prize.id !== 'nothing';
              return (
                <div
                  key={prize.id}
                  className="absolute w-full h-full"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <div
                    className={`absolute w-1/2 h-1/2 left-1/2 origin-left flex items-center justify-center ${
                      index % 2 === 0 ? 'bg-primary-600' : 'bg-primary-700'
                    }`}
                    style={{ transform: `rotate(${360 / prizes.length / 2}deg)` }}
                  >
                    <span 
                      className={`text-xs md:text-sm font-bold ${isWin ? 'text-white' : 'text-white/30'}`}
                      style={{ transform: 'rotate(90deg)', whiteSpace: 'nowrap' }}
                    >
                      {prize.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Centro */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg z-10">
            <span className="text-2xl">🎰</span>
          </div>
        </motion.div>
      </div>

      {/* Botón de girar */}
      <div className="text-center">
        {userData.spinsFree > 0 && (
          <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={useFreeSpin}
              onChange={(e) => setUseFreeSpin(e.target.checked)}
              className="w-5 h-5 rounded"
            />
            <span className="text-white/70">Usar giro gratis</span>
          </label>
        )}

        <button
          onClick={handleSpin}
          disabled={isSpinning}
          className={`btn-primary text-xl px-12 py-4 ${
            isSpinning ? 'opacity-50 cursor-not-allowed' : 'animate-pulse'
          }`}
        >
          {isSpinning ? 'Girando...' : `Girar $${price.toLocaleString()}`}
        </button>

        <p className="text-white/50 text-sm mt-2">
          {userData.spinsFree > 0 
            ? `Tienes ${userData.spinsFree} giro${userData.spinsFree > 1 ? 's' : ''} gratis disponible${userData.spinsFree > 1 ? 's' : ''}`
            : `Gira ${spinsForFree} veces para ganar 1 giro gratis!`
          }
        </p>
      </div>

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
              className="glass p-8 max-w-md text-center"
              onClick={(e) => e.stopPropagation()}
            >
              {result.id === 'nothing' ? (
                <>
                  <div className="text-6xl mb-4">😢</div>
                  <h3 className="text-2xl font-bold text-white mb-2">¡Casi lo logras!</h3>
                  <p className="text-white/70 mb-4">No fue esta vez. ¡Intenta de nuevo!</p>
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
              className="glass p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-4 text-center">
                💳 Método de Pago
              </h3>
              
              <div className="space-y-4 mb-6">
                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">💚</span>
                    <span className="font-bold text-white">Nequi</span>
                  </div>
                  <p className="text-white/70 text-sm">Envía ${price.toLocaleString()} a:</p>
                  <p className="text-2xl font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.nequi}</p>
                </div>

                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">💙</span>
                    <span className="font-bold text-white">Daviplata</span>
                  </div>
                  <p className="text-white/70 text-sm">Envía ${price.toLocaleString()} a:</p>
                  <p className="text-2xl font-bold text-primary-400">{DEFAULT_PAYMENT_INFO.daviplata}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-white/70 mb-2 text-sm">
                  Tu número de teléfono (para el premio)
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
    </div>
  );
};

export default Roulette;
