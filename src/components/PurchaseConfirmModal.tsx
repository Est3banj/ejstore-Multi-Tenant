import { motion } from 'framer-motion';
import { AlertCircle, Check, Loader } from 'lucide-react';
import Modal from './Modal';
import { isValidFFId } from '../utils/freefire';

export interface FreeFireVerification {
  status: 'idle' | 'verifying' | 'valid' | 'not_found' | 'unavailable';
  nickname: string;
  level: number | null;
}

interface PurchaseConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onRecharge?: () => void;
  serviceName: string;
  price: number;
  currentBalance: number;
  loading: boolean;
  error: string | null;
  terms?: string;
  serviceType?: 'diamond' | 'subscription';
  freeFireId?: string;
  onFreeFireIdChange?: (value: string) => void;
  onFreeFireIdBlur?: () => void;
  ffVerification?: FreeFireVerification;
}

const PurchaseConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  onRecharge,
  serviceName,
  price,
  currentBalance,
  loading,
  error,
  terms,
  serviceType,
  freeFireId = '',
  onFreeFireIdChange,
  onFreeFireIdBlur,
  ffVerification,
}: PurchaseConfirmModalProps) => {
  const remaining = currentBalance - price;
  const insufficient = price > currentBalance;
  const isDiamond = serviceType === 'diamond';
  const ffIdValid = !isDiamond || isValidFFId(freeFireId.trim());
  const ffIdInvalid = isDiamond && freeFireId.trim().length > 0 && !isValidFFId(freeFireId.trim());
  // Bloqueo central del flujo: sólo un ID que el upstream marcó como inexistente
  // corta la compra. UNAVAILABLE (y el resto) es fallback no bloqueante.
  const ffNotFound = isDiamond && ffVerification?.status === 'not_found';
  const canConfirm = ffIdValid && !insufficient && !ffNotFound;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmar compra" size="sm">
      <div className="space-y-6">
        <div className="glass p-6 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-white/60">Servicio</span>
            <span className="text-white font-semibold">{serviceName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/60">Precio</span>
            <span className="text-white font-semibold">${price.toLocaleString()}</span>
          </div>
          <div className="border-t border-white/10 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60">Saldo actual</span>
              <span className="text-white">${currentBalance.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-white/60">Saldo restante</span>
              <span className={`font-bold ${remaining < 0 ? 'text-red-400' : 'text-green-400'}`}>
                ${remaining.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {isDiamond && (
          <div>
            <label htmlFor="ff-id-input" className="block text-white/70 mb-2">
              ID de jugador de Free Fire
            </label>
            <input
              id="ff-id-input"
              data-testid="ff-id-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={freeFireId}
              onChange={(e) => onFreeFireIdChange?.(e.target.value)}
              onBlur={() => onFreeFireIdBlur?.()}
              className="input-field font-mono tracking-wider"
              placeholder="Ej: 123456789"
              disabled={loading}
            />
            {ffIdInvalid && (
              <p className="text-red-400 text-xs mt-1.5">
                Ingresá tu ID de jugador de Free Fire (8 a 12 dígitos, sin letras ni espacios).
              </p>
            )}
            {ffVerification?.status === 'verifying' && (
              <p
                className="text-white/50 text-xs mt-1.5 animate-pulse"
                data-testid="ff-verify-pending"
              >
                Verificando ID…
              </p>
            )}
            {ffVerification?.status === 'valid' && (
              <p
                className="text-emerald-400 text-xs mt-1.5 flex items-center gap-1"
                data-testid="ff-verify-ok"
              >
                <Check size={14} aria-hidden="true" />
                <span>
                  Jugador: {ffVerification.nickname} · Nivel {ffVerification.level}
                </span>
              </p>
            )}
            {ffVerification?.status === 'not_found' && (
              <p className="text-red-400 text-xs mt-1.5" data-testid="ff-verify-not-found">
                ID no encontrado — verificá que sea correcto
              </p>
            )}
            {ffVerification?.status === 'unavailable' && (
              <p className="text-amber-400 text-xs mt-1.5" data-testid="ff-verify-unavailable">
                No se pudo verificar el ID
              </p>
            )}
          </div>
        )}

        {terms && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 max-h-40 overflow-y-auto">
            <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">
              Términos del Servicio
            </h4>
            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
              {terms}
            </div>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          {insufficient ? (
            <button
              onClick={onRecharge || onClose}
              className="flex-1 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
            >
              Recargar Saldo
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={loading || !canConfirm}
              data-testid={isDiamond ? 'confirm-diamond-purchase' : undefined}
              className="flex-1 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader size={18} className="animate-spin" />
                  Procesando...
                </span>
              ) : (
                'Confirmar compra'
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PurchaseConfirmModal;
