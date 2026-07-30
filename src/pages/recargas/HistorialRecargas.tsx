import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { getRechargeHistory, checkRechargePayment } from '../../services/marketplace';
import { adminFunctions } from '../../services/firebase';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Loader2,
  X,
  DollarSign,
  User,
} from 'lucide-react';

interface Recharge {
  id: string;
  userId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  status: string;
  tenantId: string;
  transferProof?: string;
  processedAt: string | null;
  createdAt: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  approved: { label: 'Aprobada', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  rejected: { label: 'Rechazada', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
  failed: { label: 'Fallida', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: AlertCircle },
};

const HistorialRecargas = (): JSX.Element => {
  const { role } = useAuthStore();
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [_verifyingId, _setVerifyingId] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedRecharge, setSelectedRecharge] = useState<Recharge | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);

  const isReseller = role === 'reseller';

  const loadHistory = async () => {
    setLoading(true);
    try {
      const result = await getRechargeHistory(isReseller ? adminFunctions : undefined);
      if (result.success) {
        setRecharges(result.recharges);
      }
    } catch (err) {
      console.error('Error loading recharge history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleVerifyClick = (recharge: Recharge) => {
    setSelectedRecharge(recharge);
    setCustomerName(recharge.customerName || '');
    setVerifyResult(null);
    setShowNameModal(true);
  };

  const handleVerifySubmit = async () => {
    if (!selectedRecharge || !customerName.trim()) return;

    setVerifying(true);
    setVerifyResult(null);

    try {
      const result = await checkRechargePayment({
        rechargeId: selectedRecharge.id,
        customerName: customerName.trim(),
      });

      if (result.found && result.status === 'approved') {
        setVerifyResult({ success: true, message: 'Recarga aprobada. Saldo actualizado.' });
      } else if (result.processed && result.status === 'approved') {
        setVerifyResult({ success: true, message: 'Recarga ya estaba aprobada.' });
      } else {
        setVerifyResult({
          success: false,
          message: result.message || 'No se encontró el pago. Verificá el nombre o contactanos por WhatsApp.',
        });
      }
    } catch (err: any) {
      setVerifyResult({ success: false, message: err.message || 'Error al verificar el pago' });
    } finally {
      setVerifying(false);
    }
  };

  const closeNameModal = () => {
    setShowNameModal(false);
    setSelectedRecharge(null);
    setCustomerName('');
    setVerifyResult(null);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatAmount = (amount: number): string => {
    return `$${amount.toLocaleString()} COP`;
  };

  const canVerify = (status: string): boolean => {
    return status === 'pending' || status === 'failed';
  };

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text">Historial de Recargas</h1>
          <p className="text-white/70 mt-2">
            Todas tus solicitudes de recarga de saldo
          </p>
        </div>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="btn-secondary flex items-center gap-2"
        >
          <Loader2 size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
        </div>
      ) : recharges.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <DollarSign size={48} className="mx-auto text-white/20 mb-4" />
          <p className="text-white/50 text-lg">No hay recargas aún</p>
          <p className="text-white/30 text-sm mt-1">
            Tus solicitudes de recarga aparecerán aquí
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl overflow-hidden"
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/50 text-sm font-medium pb-3 pr-4 pt-3 px-4">Fecha</th>
                <th className="text-left text-white/50 text-sm font-medium pb-3 pr-4 pt-3">Nombre</th>
                <th className="text-right text-white/50 text-sm font-medium pb-3 pr-4 pt-3">Monto</th>
                <th className="text-center text-white/50 text-sm font-medium pb-3 pr-4 pt-3">Estado</th>
                <th className="text-right text-white/50 text-sm font-medium pb-3 pt-3 pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {recharges.map((recharge) => {
                const status = statusConfig[recharge.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                return (
                  <tr key={recharge.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 pr-4 px-4">
                      <span className="text-white text-sm">{formatDate(recharge.createdAt)}</span>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="text-white/70 text-sm">{recharge.customerName || '-'}</span>
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <span className="text-white font-medium">{formatAmount(recharge.amount)}</span>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 text-right pr-4">
                      {canVerify(recharge.status) ? (
                        <button
                          onClick={() => handleVerifyClick(recharge)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-colors ml-auto"
                        >
                          <Search size={12} />
                          Verificar
                        </button>
                      ) : (
                        <span className="text-white/30 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Modal para ingresar nombre del cliente */}
      <AnimatePresence>
        {showNameModal && selectedRecharge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeNameModal}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass w-full max-w-md p-6"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={closeNameModal}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X size={20} />
              </button>

              {!verifyResult ? (
                <>
                  <h2 className="text-xl font-bold gradient-text mb-2">Verificar pago</h2>
                  <p className="text-gray-400 text-sm mb-4">
                    Ingresá el nombre completo que aparece en la transferencia para buscar el pago.
                  </p>

                  <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">ID Recarga:</span>
                      <span className="text-gray-300 font-mono text-xs">{selectedRecharge.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Monto:</span>
                      <span className="text-white font-medium">{formatAmount(selectedRecharge.amount)}</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm text-white/70 mb-1">
                      <User size={14} className="inline mr-1" />
                      Nombre completo en la transferencia
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="input-field"
                      placeholder="Ej: Juan Pérez"
                    />
                  </div>

                  <button
                    onClick={handleVerifySubmit}
                    disabled={verifying || !customerName.trim()}
                    className="w-full py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                    ) : (
                      <><Search size={16} /> Buscar pago</>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center py-4 space-y-4">
                    <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                      verifyResult.success ? 'bg-green-500/20' : 'bg-red-500/20'
                    }`}>
                      {verifyResult.success ? (
                        <CheckCircle size={32} className="text-green-400" />
                      ) : (
                        <XCircle size={32} className="text-red-400" />
                      )}
                    </div>
                    <div>
                      <h3 className={`text-lg font-bold ${verifyResult.success ? 'text-green-400' : 'text-white'}`}>
                        {verifyResult.success ? 'Recarga aprobada' : 'No se encontró el pago'}
                      </h3>
                      <p className="text-gray-400 text-sm mt-1">{verifyResult.message}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    {!verifyResult.success && (
                      <button
                        onClick={() => {
                          const msg = encodeURIComponent(
                            `Hola, hice una recarga de ${formatAmount(selectedRecharge.amount)} pero no se refleja. ID: ${selectedRecharge.id}.`
                          );
                          window.open(`https://wa.me/57${selectedRecharge.customerPhone || '3101234567'}?text=${msg}`, '_blank');
                        }}
                        className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Contactar por WhatsApp
                      </button>
                    )}
                    <button
                      onClick={() => {
                        closeNameModal();
                        loadHistory();
                      }}
                      className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {verifyResult.success ? 'Cerrar' : 'Volver a intentar'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HistorialRecargas;
