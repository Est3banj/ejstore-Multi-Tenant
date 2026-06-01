import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getRecharges } from '../../services/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { motion } from 'framer-motion';
import { Check, X, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import type { Recharge } from '../../types';

const Recharges = () => {
  const { tenant, userTenantId, user } = useApp();
  const tenantId = tenant?.id || userTenantId;
  
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    if (tenantId) loadRecharges();
  }, [tenantId]);

  const loadRecharges = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getRecharges(tenantId);
      // Ordenar: primero pending, luego por fecha
      data.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setRecharges(data);
    } catch (error) {
      console.error('Error loading recharges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (recharge: Recharge) => {
    if (!tenantId || !user?.email) return;
    setProcessing(recharge.id);
    try {
      // Usar Cloud Function que maneja Firestore + Discord + Telegram
      const processRechargeCF = httpsCallable(functions, 'processRecharge');
      await processRechargeCF({ rechargeId: recharge.id, action: 'approve' });
      
      // Recargar lista
      await loadRecharges();
    } catch (error) {
      console.error('Error approving:', error);
      alert('Error al aprobar');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (recharge: Recharge) => {
    if (!tenantId || !user?.email) return;
    const defaultReason = 'Pago no válido o no verificado';
    const reason = prompt('Motivo del rechazo (Enter para "Pago no válido"):', defaultReason);
    if (reason === null) return; // Usuario canceló
    setProcessing(recharge.id);
    try {
      // Usar Cloud Function que maneja Firestore + Discord + Telegram
      const processRechargeCF = httpsCallable(functions, 'processRecharge');
      await processRechargeCF({ rechargeId: recharge.id, action: 'reject' });
      
      await loadRecharges();
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Error al rechazar');
    } finally {
      setProcessing(null);
    }
  };

  // Filtrar recargas
  const filteredRecharges = filter === 'all' 
    ? recharges 
    : recharges.filter(r => r.status === filter);
    
  const pendingCount = recharges.filter(r => r.status === 'pending').length;
  const approvedCount = recharges.filter(r => r.status === 'approved').length;
  const rejectedCount = recharges.filter(r => r.status === 'rejected').length;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Recargas</h1>
          <p className="text-white/60 text-sm">Gestión de solicitudes</p>
        </div>
        
        {/* Filtros - responsive */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm whitespace-nowrap ${
                filter === f 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-white/10 text-white/60 hover:text-white'
              }`}
            >
              {f === 'all' && `Todas (${recharges.length})`}
              {f === 'pending' && `Pendientes (${pendingCount})`}
              {f === 'approved' && `Aprobadas (${approvedCount})`}
              {f === 'rejected' && `Rechazadas (${rejectedCount})`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : filteredRecharges.length === 0 ? (
        <div className="glass p-12 text-center">
          <p className="text-white/50">
            {filter === 'all' ? 'No hay solicitudes de recarga' : `No hay solicitudes ${filter}`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecharges.map(recharge => (
            <motion.div
              key={recharge.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`glass p-4 rounded-xl border ${
                recharge.status === 'pending' 
                  ? 'border-yellow-500/30' 
                  : recharge.status === 'approved'
                  ? 'border-green-500/30'
                  : 'border-red-500/30'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-white font-medium">{recharge.customerName}</p>
                      <p className="text-white/50 text-sm">
                        {recharge.customerPhone || 'Sin teléfono'}
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-yellow-400 mt-2">
                    ${recharge.amount.toLocaleString()}
                  </p>
                  <p className="text-white/40 text-xs mt-1">
                    {new Date(recharge.createdAt).toLocaleString('es-CO', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </p>
                </div>
                
                {/* Botones responsive */}
                <div className="flex sm:flex-col items-center gap-2">
                  {recharge.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(recharge)}
                        disabled={!!processing}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                        title="Rechazar"
                      >
                        {processing === recharge.id ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <X size={18} />
                        )}
                      </button>
                      <button
                        onClick={() => handleApprove(recharge)}
                        disabled={!!processing}
                        className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50"
                        title="Aprobar"
                      >
                        {processing === recharge.id ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check size={18} />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                      recharge.status === 'approved'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {recharge.status === 'approved' ? (
                        <>
                          <CheckCircle size={14} />
                          <span>Aprobado</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={14} />
                          <span>Rechazado</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {recharge.status === 'rejected' && recharge.rejectionReason && (
                <p className="text-red-400 text-sm mt-2">
                  Motivo: {recharge.rejectionReason}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Recharges;