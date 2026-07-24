import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  MessageSquare,
  HelpCircle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  X,
  ThumbsUp,
  MessageCircle,
  Loader,
} from 'lucide-react';
import { updateTicket } from '../../services/marketplace';
import { doc, getDoc } from 'firebase/firestore';

interface TicketData {
  id: string;
  tenantId: string;
  serviceName: string;
  subject: string;
  description: string;
  customerEmail: string;
  purchaseId?: string;
  imageUrl?: string;
  status: string;
  adminNotes?: string;
  newCredentials?: { email?: string; password?: string; profileName?: string; profilePin?: string };
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_CONFIG: Record<string, { className: string; label: string; icon: typeof HelpCircle }> = {
  open: { className: 'bg-yellow-500/20 text-yellow-400', label: 'Abierto', icon: HelpCircle },
  resolved: { className: 'bg-green-500/20 text-green-400', label: 'Resuelto', icon: CheckCircle },
  closed: { className: 'bg-gray-500/20 text-gray-400', label: 'Cerrado', icon: XCircle },
};

const MisReportesCliente = (): JSX.Element => {
  const { customer } = useAuthStore();
  const uid = customer?.uid || '';
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketData | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'tickets'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const list: TicketData[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            tenantId: d.tenantId || '',
            serviceName: d.serviceName || '',
            subject: d.subject || '',
            description: d.description || '',
            customerEmail: d.customerEmail || '',
            purchaseId: d.purchaseId || undefined,
            imageUrl: d.imageUrl || undefined,
            status: d.status || 'open',
            adminNotes: d.adminNotes || undefined,
            newCredentials: d.newCredentials || undefined,
            createdAt: d.createdAt?.toDate?.() || new Date(),
            updatedAt: d.updatedAt?.toDate?.() || new Date(),
          };
        });
        setTickets(list);
      } catch (err) {
        console.error('Error loading tickets:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  const loadWhatsApp = async (tenantId: string) => {
    try {
      const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
      if (tenantSnap.exists()) {
        setWhatsappNumber(tenantSnap.data().whatsappNumber || '');
      }
    } catch { /* silent */ }
  };

  const handleConfirmResolved = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await updateTicket(selected.id, {
        status: 'closed',
        adminNotes: selected.adminNotes
          ? selected.adminNotes + '\n\n[Cliente confirmó resolución]'
          : '[Cliente confirmó resolución]',
      });
      setSelected((prev) => prev ? { ...prev, status: 'closed' } : null);
      setTickets((prev) => prev.map((t) =>
        t.id === selected.id ? { ...t, status: 'closed' as const } : t
      ));
    } catch (err) {
      console.error('Error confirming:', err);
    } finally {
      setConfirming(false);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!selected || !whatsappNumber) return;
    const msg = encodeURIComponent(
      `Hola, necesito más ayuda con mi reporte:\n\n` +
      `Ticket: ${selected.purchaseId || selected.id}\n` +
      `Servicio: ${selected.serviceName}\n` +
      `Asunto: ${selected.subject}\n` +
      `Email: ${selected.customerEmail}\n\n` +
      `Descripción: ${selected.description}`
    );
    window.open(`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  if (loading) {
    return <div className="text-center text-gray-400 py-8"><Loader size={20} className="animate-spin inline-block" /> Cargando reportes...</div>;
  }

  return (
    <div className="space-y-4">
      {tickets.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 text-center py-12">
          <MessageSquare size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No enviaste reportes todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket, index) => {
            const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const StatusIcon = statusConfig.icon;
            return (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConfig.className} flex items-center gap-1`}>
                        <StatusIcon size={10} />
                        {statusConfig.label}
                      </span>
                      <span className="text-gray-500 text-xs">{formatDate(ticket.createdAt)}</span>
                    </div>
                    <h3 className="text-white font-semibold text-sm truncate">{ticket.subject}</h3>
                    <p className="text-gray-400 text-xs mt-0.5 truncate">{ticket.serviceName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelected(ticket);
                      if (ticket.status === 'resolved' || ticket.status === 'closed') {
                        loadWhatsApp(ticket.tenantId);
                      }
                    }}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors"
                  >
                    <Eye size={12} /> Ver
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal detalle */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-800 rounded-2xl w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-gray-800 px-6 py-4 border-b border-gray-700 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold text-white">Detalle del Reporte</h2>
                  <p className="text-gray-500 text-xs mt-0.5">{formatDate(selected.createdAt)}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center gap-2">
                  {(() => {
                    const cfg = STATUS_CONFIG[selected.status] || STATUS_CONFIG.open;
                    const Icon = cfg.icon;
                    return (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${cfg.className} flex items-center gap-1.5`}>
                        <Icon size={12} /> {cfg.label}
                      </span>
                    );
                  })()}
                  {(selected.adminNotes || selected.newCredentials) && selected.status === 'resolved' && (
                    <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle size={10} /> Resuelto</span>
                  )}
                </div>

                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">Asunto</p>
                  <p className="text-white font-medium">{selected.subject}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">Servicio</p>
                    <p className="text-white text-sm">{selected.serviceName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">Email</p>
                    <p className="text-white text-sm font-mono truncate">{selected.customerEmail}</p>
                  </div>
                </div>

                {selected.purchaseId && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">ID Ticket</p>
                    <p className="text-primary-400 text-sm font-mono font-medium">{selected.purchaseId}</p>
                  </div>
                )}

                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">Descripción</p>
                  <p className="text-gray-300 text-sm bg-gray-900 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{selected.description}</p>
                </div>

                {selected.imageUrl && (
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-1 font-medium">Imagen adjunta</p>
                    <img src={selected.imageUrl} alt="Evidencia" className="rounded-lg max-h-48 object-contain bg-gray-900 border border-gray-700" />
                  </div>
                )}

                {(selected.adminNotes || selected.newCredentials) && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-green-400" />
                      <p className="text-green-400 text-xs uppercase tracking-wider font-medium">
                        {selected.newCredentials ? 'Ticket resuelto — credenciales actualizadas' : 'Respuesta del administrador'}
                      </p>
                    </div>
                    {selected.adminNotes && (
                      <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{selected.adminNotes}</p>
                    )}
                    {selected.newCredentials && (
                      <div className="bg-gray-900/50 rounded-lg p-3 border border-green-500/10">
                        <p className="text-green-400 text-[10px] uppercase tracking-wider font-medium mb-2">Credenciales actualizadas</p>
                        <div className="space-y-1 text-xs font-mono">
                          {selected.newCredentials.email && <p className="text-gray-300"><span className="text-gray-500">Email:</span> {selected.newCredentials.email}</p>}
                          {selected.newCredentials.password && <p className="text-gray-300"><span className="text-gray-500">Clave:</span> {selected.newCredentials.password}</p>}
                          {selected.newCredentials.profileName && <p className="text-gray-300"><span className="text-gray-500">Perfil:</span> {selected.newCredentials.profileName}</p>}
                          {selected.newCredentials.profilePin && <p className="text-gray-300"><span className="text-gray-500">PIN:</span> {selected.newCredentials.profilePin}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selected.status === 'open' && !selected.adminNotes && (
                  <div className="bg-gray-900 rounded-xl p-4 text-center">
                    <Clock size={20} className="mx-auto text-gray-500 mb-2" />
                    <p className="text-gray-500 text-sm">Esperando respuesta del administrador</p>
                    <p className="text-gray-600 text-xs mt-1">Suele responderse en menos de 24h</p>
                  </div>
                )}

                {(selected.status === 'resolved') && (
                  <div className="space-y-2 pt-1">
                    <p className="text-gray-500 text-xs text-center">¿Este reporte resolvió tu problema?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleConfirmResolved} disabled={confirming}
                        className="flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                        {confirming ? <Loader size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                        Sí, resolver
                      </button>
                      <button onClick={handleOpenWhatsApp} disabled={!whatsappNumber}
                        className="flex items-center justify-center gap-2 py-2.5 bg-green-700/50 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                        <MessageCircle size={14} /> No, más ayuda
                      </button>
                    </div>
                  </div>
                )}

                {selected.status === 'closed' && (
                  <div className="text-center py-1">
                    <p className="text-gray-500 text-xs flex items-center justify-center gap-1">
                      <CheckCircle size={12} className="text-green-400" /> Reporte cerrado
                    </p>
                  </div>
                )}

                <button onClick={() => setSelected(null)}
                  className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors rounded-lg hover:bg-gray-700/50">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MisReportesCliente;
