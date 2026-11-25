import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuthStore } from '../../store/authStore';
import { getRecharges } from '../../services/firestore';
import { httpsCallable } from 'firebase/functions';
import { adminFunctions as functions } from '../../services/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, CheckCircle, XCircle, Loader, Search,
  Wallet, Phone, Calendar, X as XIcon,
  RotateCcw, MessageSquare,
} from 'lucide-react';
import type { Recharge } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'pending' | 'approved' | 'rejected';

// ─── Helpers ───────────────────────────────────────────────────────────────
const formatDate = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatAmount = (n: number) => `$${n.toLocaleString()}`;
const isWompi = (recharge: Recharge) => recharge.provider === 'wompi' || recharge.id.startsWith('wompi_');

// ─── Component ────────────────────────────────────────────────────────────
const Recharges = () => {
  const { tenant, userTenantId } = useApp();
  const { adminUser } = useAuthStore();
  const tenantId = tenant?.id || userTenantId;

  // ── State ──────────────────────────────────────────────────────────────
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<Recharge | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Verify feedback
  const [verifyMsg, setVerifyMsg] = useState<{ id: string; msg: string; type: 'ok' | 'waiting' | 'error' } | null>(null);

  // Detail modal
  const [detailTarget, setDetailTarget] = useState<Recharge | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tenantId) loadRecharges();
  }, [tenantId]);

  const loadRecharges = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getRecharges(tenantId);
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

  // ── Search + Filter ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = recharges;
    if (filterTab !== 'all') list = list.filter(r => r.status === filterTab);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(r =>
        r.customerName?.toLowerCase().includes(q) ||
        r.customerPhone?.toLowerCase().includes(q) ||
        String(r.amount).includes(q) ||
        r.id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [recharges, filterTab, search]);

  const counts = useMemo(() => ({
    all: recharges.length,
    pending: recharges.filter(r => r.status === 'pending').length,
    approved: recharges.filter(r => r.status === 'approved').length,
    rejected: recharges.filter(r => r.status === 'rejected').length,
  }), [recharges]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleApprove = async (r: Recharge) => {
    if (!tenantId || !adminUser?.email) return;
    setProcessing(r.id);
    try {
      await (httpsCallable(functions, 'processRecharge'))({ rechargeId: r.id, action: 'approve' });
      await loadRecharges();
    } catch (e: any) {
      alert('Error al aprobar: ' + (e.message || 'desconocido'));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !tenantId || !adminUser?.email) return;
    setRejecting(true);
    setProcessing(rejectTarget.id);
    try {
      await (httpsCallable(functions, 'processRecharge'))({
        rechargeId: rejectTarget.id, action: 'reject',
        reason: rejectReason.trim() || undefined,
      });
      setRejectTarget(null);
      await loadRecharges();
    } catch (e: any) {
      alert('Error al rechazar: ' + (e.message || 'desconocido'));
    } finally {
      setRejecting(false);
      setProcessing(null);
    }
  };

  const handleReVerify = async (r: Recharge) => {
    setProcessing(r.id);
    setVerifyMsg(null);
    try {
      const res = await (httpsCallable(functions, 'checkRechargePayment'))({ rechargeId: r.id });
      const d = res.data as any;
      let msg: string, type: 'ok' | 'waiting' | 'error';
      if (d.found || d.processed) {
        msg = d.status === 'approved'
          ? 'Pago confirmado. Recarga aprobada.'
          : 'Recarga procesada: ' + (d.message || '');
        type = 'ok';
      } else {
        msg = 'Pago no encontrado. ' + (d.message || 'Intenta de nuevo más tarde.');
        type = 'waiting';
      }
      setVerifyMsg({ id: r.id, msg, type });
      await loadRecharges();
    } catch (e: any) {
      setVerifyMsg({ id: r.id, msg: 'Error: ' + (e.message || 'desconocido'), type: 'error' });
    } finally {
      setProcessing(null);
      setTimeout(() => setVerifyMsg(null), 6000);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Recargas</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Gestioná y verificá las solicitudes de recarga de tus clientes
          </p>
        </div>

        {/* Stats mini */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-yellow-400 font-medium">{counts.pending} pendiente{counts.pending !== 1 ? 's' : ''}</span>
          <span className="text-gray-600">|</span>
          <span className="text-green-400">{counts.approved} aprobada{counts.approved !== 1 ? 's' : ''}</span>
          <span className="text-gray-600">|</span>
          <span className="text-red-400">{counts.rejected} rechazada{counts.rejected !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Search + Filters ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, monto o ID..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-2.5 pl-10 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 bg-gray-800/50 rounded-xl p-1 border border-gray-700/50">
          {([
            { key: 'all' as FilterTab, label: 'Todas' },
            { key: 'pending' as FilterTab, label: 'Pendientes' },
            { key: 'approved' as FilterTab, label: 'Aprobadas' },
            { key: 'rejected' as FilterTab, label: 'Rechazadas' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filterTab === tab.key
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-70">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Cargando recargas...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-800/50 rounded-2xl p-16 text-center border border-dashed border-gray-700">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-700/40 flex items-center justify-center">
            {search ? <Search size={32} className="text-gray-500" /> : <Wallet size={32} className="text-gray-500" />}
          </div>
          <p className="text-gray-400 text-lg font-medium">
            {search
              ? 'No se encontraron recargas con ese criterio'
              : filterTab === 'all'
              ? 'No hay solicitudes de recarga'
              : `No hay solicitudes ${filterTab === 'pending' ? 'pendientes' : filterTab === 'approved' ? 'aprobadas' : 'rechazadas'}`}
          </p>
          <p className="text-gray-500 text-sm mt-1.5">
            {search
              ? 'Probá con otro término de búsqueda'
              : 'Las recargas aparecerán aquí cuando los clientes las soliciten'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(recharge => (
            <motion.div
              key={recharge.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-gray-800/60 backdrop-blur-sm rounded-xl border border-gray-700/60 hover:border-gray-600 transition-all"
            >
              {/* Main row */}
              <div className="p-4 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setDetailTarget(recharge)}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center shrink-0 border border-primary-500/20">
                        <span className="text-primary-400 font-bold text-sm">
                          {(recharge.customerName || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium truncate">{recharge.customerName}</p>
                          {recharge.emailUid && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 font-mono border border-white/10 shrink-0">
                              AUTO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {recharge.customerPhone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} />
                              {recharge.customerPhone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {formatDate(recharge.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: amount + actions */}
                  <div className="flex items-center gap-3 sm:gap-4 ml-12 sm:ml-0">
                    <div className="text-right">
                      <p className="text-xl font-bold text-yellow-400">{formatAmount(recharge.amount)}</p>
                      <p className={`text-[11px] font-medium ${
                        recharge.status === 'pending' ? 'text-yellow-500' :
                         recharge.status === 'sandbox_approved' ? 'text-blue-400' : recharge.status === 'approved' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {recharge.status === 'pending' ? 'PENDIENTE' :
                          recharge.status === 'sandbox_approved' ? 'PRUEBA APROBADA · SIN SALDO REAL' : recharge.status === 'approved' ? 'APROBADA' : 'RECHAZADA'}
                      </p>
                    </div>

                    {recharge.status === 'pending' && isWompi(recharge) && <span className="text-xs text-white/50">Esperando confirmación Wompi</span>}
                    {recharge.status === 'pending' && !isWompi(recharge) && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleReVerify(recharge)}
                          disabled={!!processing}
                          className="p-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-30 transition-all"
                          title="Re-verificar pago"
                        >
                          {processing === recharge.id ? (
                            <Loader size={16} className="animate-spin" />
                          ) : (
                            <RotateCcw size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => { setRejectReason('Pago no válido o no verificado'); setRejectTarget(recharge); }}
                          disabled={!!processing}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 transition-all"
                          title="Rechazar"
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={() => handleApprove(recharge)}
                          disabled={!!processing}
                          className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-30 transition-all"
                          title="Aprobar"
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    )}

                    {recharge.status !== 'pending' && recharge.status !== 'sandbox_approved' && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
                        recharge.status === 'approved'
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {recharge.status === 'approved' ? (
                          <><CheckCircle size={13} /><span>Aprobado</span></>
                        ) : (
                          <><XCircle size={13} /><span>Rechazado</span></>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reason / verify message */}
                {recharge.status === 'rejected' && recharge.rejectionReason && (
                  <p className="text-red-400/80 text-xs mt-3 ml-12 flex items-center gap-1.5">
                    <MessageSquare size={12} />
                    Motivo: {recharge.rejectionReason}
                  </p>
                )}
                {verifyMsg?.id === recharge.id && (
                  <p className={`text-xs mt-3 ml-12 flex items-center gap-1.5 ${
                    verifyMsg.type === 'ok' ? 'text-green-400' :
                    verifyMsg.type === 'waiting' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {verifyMsg.type === 'ok' ? <CheckCircle size={12} /> :
                     verifyMsg.type === 'waiting' ? <Loader size={12} className="animate-spin" /> :
                     <XCircle size={12} />}
                    {verifyMsg.msg}
                  </p>
                )}
                {recharge.status === 'approved' && recharge.emailUid && (
                  <p className="text-white/60 text-xs mt-3 ml-12 flex items-center gap-1.5">
                    <CheckCircle size={12} />
                    Aprobada automáticamente por detección de pago
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {detailTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDetailTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">Detalle de recarga</h3>
                <button onClick={() => setDetailTarget(null)} className="text-gray-500 hover:text-white p-1">
                  <XIcon size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-600/10 flex items-center justify-center border border-primary-500/20">
                    <span className="text-primary-400 font-bold text-lg">
                      {(detailTarget.customerName || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{detailTarget.customerName}</p>
                    <p className="text-gray-400 text-sm">{detailTarget.customerPhone || 'Sin teléfono'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-900/50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-1">Monto</p>
                    <p className="text-white font-bold text-lg">{formatAmount(detailTarget.amount)}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-1">Estado</p>
                    <p className={`font-bold text-lg ${
                      detailTarget.status === 'pending' ? 'text-yellow-400' :
                       detailTarget.status === 'sandbox_approved' ? 'text-blue-400' : detailTarget.status === 'approved' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {detailTarget.status === 'pending' ? 'Pendiente' :
                        detailTarget.status === 'sandbox_approved' ? 'Prueba aprobada (sin saldo real)' : detailTarget.status === 'approved' ? 'Aprobada' : 'Rechazada'}
                    </p>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3 col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Fecha de solicitud</p>
                    <p className="text-white text-sm">{formatDate(detailTarget.createdAt)}</p>
                  </div>
                  {detailTarget.processedAt && (
                    <div className="bg-gray-900/50 rounded-xl p-3 col-span-2">
                      <p className="text-gray-500 text-xs mb-1">Procesada</p>
                      <p className="text-white text-sm">{formatDate(detailTarget.processedAt)}</p>
                    </div>
                  )}
                  {detailTarget.rejectionReason && (
                    <div className="bg-gray-900/50 rounded-xl p-3 col-span-2 border border-red-500/20">
                      <p className="text-red-400 text-xs mb-1">Motivo de rechazo</p>
                      <p className="text-red-300 text-sm">{detailTarget.rejectionReason}</p>
                    </div>
                  )}
                  {detailTarget.emailUid && (
                    <div className="bg-gray-900/50 rounded-xl p-3 col-span-2">
                      <p className="text-gray-500 text-xs mb-1">ID de email (UID)</p>
                      <p className="text-white/70 text-xs font-mono">{detailTarget.emailUid}</p>
                    </div>
                  )}
                  <div className="bg-gray-900/50 rounded-xl p-3 col-span-2">
                    <p className="text-gray-500 text-xs mb-1">ID de recarga</p>
                    <p className="text-gray-400 text-xs font-mono">{detailTarget.id}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-3">
                {detailTarget.status === 'pending' && isWompi(detailTarget) && <p className="text-sm text-white/60">Sólo la confirmación verificada de Wompi puede procesar esta recarga.</p>}
                {detailTarget.status === 'pending' && !isWompi(detailTarget) && (
                  <>
                    <button
                      onClick={() => { setDetailTarget(null); setRejectReason('Pago no válido o no verificado'); setRejectTarget(detailTarget); }}
                      disabled={!!processing}
                      className="flex-1 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => { handleApprove(detailTarget); setDetailTarget(null); }}
                      disabled={!!processing}
                      className="flex-1 py-2.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailTarget(null)}
                  className={`${detailTarget.status === 'pending' ? 'flex-shrink-0 px-4' : 'flex-1'} py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all`}
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reject Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setRejectTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-white mb-1">Rechazar recarga</h3>
              <p className="text-gray-400 text-sm mb-5">
                {rejectTarget.customerName} &mdash; {formatAmount(rejectTarget.amount)}
              </p>

              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Motivo del rechazo</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 px-4 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none transition-colors"
                  rows={3}
                  placeholder="Ej: Pago no verificado, monto incorrecto..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setRejectTarget(null)}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting || !rejectReason.trim()}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {rejecting ? (
                    <><Loader size={14} className="animate-spin" /> Rechazando...</>
                  ) : (
                    'Rechazar recarga'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Recharges;
