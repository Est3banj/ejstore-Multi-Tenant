import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { RoulettePrize } from '../../types';
import { getRouletteConfig, saveRouletteConfig } from '../../services/firestore';
import { motion } from 'framer-motion';
import { Save, RotateCcw, Loader } from 'lucide-react';

const RouletteSettings = () => {
  const { tenant, userTenantId } = useApp();
  const tenantId = tenant?.id || userTenantId || '';
  
  // Estado para la configuración
  const [isEnabled, setIsEnabled] = useState(true);
  const [pricePerSpin, setPricePerSpin] = useState(0);
  const [spinsForFreeSpin, setSpinsForFreeSpin] = useState(1);
  const [prizes, setPrizes] = useState<RoulettePrize[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Cargar configuración desde Firestore
  useEffect(() => {
    if (!tenantId) return;
    
    const loadConfig = async () => {
      setLoading(true);
      try {
        const config = await getRouletteConfig(tenantId);
        if (config) {
          setIsEnabled(config.isEnabled);
          setPricePerSpin(config.pricePerSpin);
          setSpinsForFreeSpin(config.spinsForFreeSpin);
          setPrizes(config.prizes);
        }
      } catch (error) {
        console.error('Error loading roulette config:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadConfig();
  }, [tenantId]);

  // Guardar configuración en Firestore
  const handleSave = async () => {
    if (!tenantId) {
      alert('Error: No se detectó el ID de la tienda. Asegúrate de estar logueado.');
      return;
    }
    setSaving(true);
    try {
      console.log('Guardando config para tenant:', tenantId);
      await saveRouletteConfig({
        tenantId,
        isEnabled,
        pricePerSpin,
        spinsForFreeSpin,
        prizes,
      });
      
      alert('✅ Configuración guardada correctamente en Firestore!');
      console.log('Config guardada:', { isEnabled, pricePerSpin, spinsForFreeSpin, prizes });
    } catch (error: any) {
      console.error('Error saving roulette config:', error);
      alert('Error al guardar la configuración: ' + (error?.message || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  // Resetear a valores por defecto
  const handleReset = () => {
    setIsEnabled(true);
    setPricePerSpin(0);
    setSpinsForFreeSpin(1);
    setPrizes([]);
    setShowResetConfirm(false);
  };

  // Actualizar un premio
  const updatePrize = (id: string, field: keyof RoulettePrize, value: any) => {
    setPrizes(prizes.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  // Calcular probabilidades
  const totalProbability = prizes.reduce((sum, p) => sum + (p.isActive ? p.probability : 0), 0);
  const expectedCost = prizes
    .filter(p => p.isActive)
    .reduce((sum, p) => sum + (p.probability / 100) * p.cost, 0);
  const expectedValue = pricePerSpin - expectedCost;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text">🎰 Ruleta de Premios</h1>
            <p className="text-white/70 mt-2">Configura los premios y opciones de la ruleta</p>
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <RotateCcw size={18} />
            Resetear
          </button>
        </div>

        {/* Habilitar/Deshabilitar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 rounded-xl mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Estado de la Ruleta</h3>
              <p className="text-white/50 text-sm">Activa o desactiva la ruleta en la tienda</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary-600"></div>
              <span className="ml-3 text-white/70">
                {isEnabled ? 'Activa' : 'Inactiva'}
              </span>
            </label>
          </div>
        </motion.div>

        {/* Configuración General */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-6 rounded-xl mb-6"
        >
          <h3 className="text-xl font-bold text-white mb-4">Configuración General</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 mb-2">Precio por giro (COP)</label>
              <input
                type="number"
                value={pricePerSpin}
                onChange={(e) => setPricePerSpin(parseInt(e.target.value) || 0)}
                className="input-field"
                min="0"
                step="100"
              />
            </div>
            <div>
              <label className="block text-white/70 mb-2">Giros para giro gratis</label>
              <input
                type="number"
                value={spinsForFreeSpin}
                onChange={(e) => setSpinsForFreeSpin(parseInt(e.target.value) || 1)}
                className="input-field"
                min="1"
              />
            </div>
          </div>
        </motion.div>

        {/* Premios */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass p-6 rounded-xl mb-6"
        >
          <h3 className="text-xl font-bold text-white mb-4">🎁 Premios</h3>
          
          <div className="space-y-3">
            {prizes.map((prize, index) => (
              <div
                key={prize.id}
                className={`flex items-center gap-4 p-4 rounded-lg ${
                  prize.id === 'nothing' ? 'bg-red-500/10' : 'bg-white/5'
                } ${
                  prize.stock !== undefined && prize.stock <= 0 && prize.id !== 'nothing' ? 'opacity-60 border border-yellow-500/30' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-bold">
                  {index + 1}
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      value={prize.name}
                      onChange={(e) => updatePrize(prize.id, 'name', e.target.value)}
                      className="input-field"
                      placeholder="Nombre del premio"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      value={prize.probability}
                      onChange={(e) => updatePrize(prize.id, 'probability', parseInt(e.target.value) || 0)}
                      className="input-field"
                      placeholder="%"
                      min="0"
                      max="100"
                    />
                    <span className="text-white/50 text-xs">% probabilidad</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      value={prize.cost}
                      onChange={(e) => updatePrize(prize.id, 'cost', parseInt(e.target.value) || 0)}
                      className="input-field"
                      placeholder="$$$"
                      min="0"
                    />
                    <span className="text-white/50 text-xs">costo (COP)</span>
                  </div>
                  <div>
                    <div className="relative">
                      <input
                        type="number"
                        value={prize.stock ?? ''}
                        onChange={(e) => updatePrize(prize.id, 'stock', e.target.value === '' ? undefined : parseInt(e.target.value) || 0)}
                        className={`input-field ${(!prize.stock && prize.id !== 'nothing') ? 'text-yellow-400' : ''}`}
                        placeholder="∞"
                        min="0"
                      />
                      {!prize.stock && prize.id !== 'nothing' && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-400 text-xs font-bold">∞</span>
                      )}
                    </div>
                    <span className="text-white/50 text-xs">
                      {prize.stock !== undefined && prize.stock <= 0 && prize.id !== 'nothing' 
                        ? <span className="text-yellow-400 font-bold">⚠️ Agotado</span>
                        : 'stock (∞ = ilimitado)'}
                    </span>
                  </div>
                </div>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={prize.isActive}
                    onChange={(e) => updatePrize(prize.id, 'isActive', e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                </label>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 p-3 rounded-lg text-center">
                <p className="text-white/50 text-sm">Probabilidad Total</p>
                <p className={`text-xl font-bold ${totalProbability === 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {totalProbability}%
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg text-center">
                <p className="text-white/50 text-sm">Costo Esperado</p>
                <p className="text-xl font-bold text-white">
                  ${expectedCost.toLocaleString()}
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg text-center">
                <p className="text-white/50 text-sm">Ganancia por Giro</p>
                <p className={`text-xl font-bold ${expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${expectedValue.toLocaleString()}
                </p>
              </div>
            </div>
            
            {totalProbability !== 100 && (
              <p className="text-yellow-400 text-sm mt-3 text-center">
                ⚠️ La suma de probabilidades debe ser 100% (actualmente {totalProbability}%)
              </p>
            )}
          </div>
        </motion.div>

        {/* Botón Guardar */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || totalProbability !== 100}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={20} />
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>

      {/* Modal de confirmación de reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass p-6 max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">¿Resetear configuración?</h3>
            <p className="text-white/70 mb-6">
              Esto restaurará todos los valores a los originales. ¿Estás seguro?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                className="bg-red-500/20 text-red-400 px-6 py-3 rounded-lg hover:bg-red-500/30 flex-1"
              >
                Resetear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouletteSettings;
