import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, AlertTriangle, User } from 'lucide-react';
import { CATEGORIES } from '../../utils/constants';

interface ResellerPurchaseConfirmModalProps {
  open: boolean;
  onConfirm: (customerName: string) => void;
  onCancel: () => void;
  serviceName: string;
  category: string;
  description: string;
  terms?: string;
  stock: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  purchasing: boolean;
}

const getCategoryName = (categoryId: string): string => {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  return cat?.name || categoryId;
};

const ResellerPurchaseConfirmModal = ({
  open,
  onConfirm,
  onCancel,
  serviceName,
  category,
  description,
  terms,
  stock,
  quantity,
  unitPrice,
  totalPrice,
  purchasing,
}: ResellerPurchaseConfirmModalProps): JSX.Element => {
  const [customerName, setCustomerName] = useState('');

  // Reset input when modal opens
  useEffect(() => {
    if (open) setCustomerName('');
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={!purchasing ? onCancel : undefined}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-800 rounded-2xl w-full max-w-lg p-6 border border-gray-700 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Confirmación de Compra</h2>
              {!purchasing && (
                <button onClick={onCancel} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Order summary */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Módulo</span>
                <span className="text-white font-medium">{getCategoryName(category)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Producto</span>
                <span className="text-white font-medium text-right max-w-[60%]">{serviceName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Disponibilidad</span>
                <span className={`font-medium ${stock >= quantity ? 'text-green-400' : 'text-red-400'}`}>
                  {stock} disponible{stock !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Cantidad</span>
                <span className="text-white font-medium">{quantity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Precio unitario</span>
                <span className="text-white font-medium">${unitPrice.toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-700 pt-3 flex justify-between">
                <span className="text-white font-bold">Total</span>
                <span className="text-green-400 font-bold text-lg">${totalPrice.toLocaleString()}</span>
              </div>
            </div>

            {/* Customer name */}
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-700 mb-3">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nombre del Cliente <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej: María García"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  disabled={purchasing}
                  maxLength={100}
                  autoFocus
                />
              </div>
            </div>

            {/* Service description */}
            {description && (
              <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50 mb-3">
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                  {description}
                </p>
              </div>
            )}

            {/* Service-specific terms & conditions */}
            {terms ? (
              <div className="bg-gray-900/50 rounded-xl p-4 border border-yellow-500/20 mb-6">
                <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-2">
                  Términos del Servicio
                </h3>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                  {terms}
                </div>
              </div>
            ) : (
              <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20 mb-6">
                <p className="text-sm text-yellow-300/80 italic">
                  Este servicio no tiene términos y condiciones específicos configurados.
                </p>
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-6">
              <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-300/80 leading-relaxed">
                Al confirmar la compra se descontará el valor del saldo de tu cuenta de subdistribuidor.
                Revisa bien la cantidad antes de continuar.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={purchasing}
                className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-300 font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={() => onConfirm(customerName.trim())}
                disabled={purchasing || !customerName.trim()}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {purchasing ? (
                  'Procesando...'
                ) : (
                  <>
                    <ShoppingCart size={18} />
                    Comprar
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResellerPurchaseConfirmModal;
