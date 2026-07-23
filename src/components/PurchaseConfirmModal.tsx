import { motion } from 'framer-motion';
import { AlertCircle, Loader } from 'lucide-react';
import Modal from './Modal';

interface PurchaseConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  serviceName: string;
  price: number;
  currentBalance: number;
  loading: boolean;
  error: string | null;
}

const PurchaseConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  serviceName,
  price,
  currentBalance,
  loading,
  error,
}: PurchaseConfirmModalProps) => {
  const remaining = currentBalance - price;
  const insufficient = price > currentBalance;

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
          <button
            onClick={onConfirm}
            disabled={loading || insufficient}
            className="flex-1 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: insufficient
                ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                : 'linear-gradient(135deg, #10b981, #059669)',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={18} className="animate-spin" />
                Procesando...
              </span>
            ) : insufficient ? (
              'Saldo insuficiente'
            ) : (
              'Confirmar compra'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PurchaseConfirmModal;
