import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { getTickets, updateTicket } from '../../services/marketplace';
import type { Ticket } from '../../types/marketplace';
import { Ticket as TicketIcon, HelpCircle, CheckCircle, XCircle, Loader, Eye, X } from 'lucide-react';
import { motion } from 'framer-motion';

type FilterTab = 'todos' | 'open' | 'resolved' | 'closed';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'open', label: 'Abiertos' },
  { key: 'resolved', label: 'Resueltos' },
  { key: 'closed', label: 'Cerrados' },
];

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  open: { className: 'bg-yellow-500/20 text-yellow-400', label: 'Abierto' },
  resolved: { className: 'bg-green-500/20 text-green-400', label: 'Resuelto' },
  closed: { className: 'bg-gray-500/20 text-gray-400', label: 'Cerrado' },
};

const AdminTickets = (): JSX.Element => {
  const { userTenantId, role: _role } = useAuthStore();
  const tenantId = userTenantId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenantId) loadTickets();
  }, [tenantId]);

  const loadTickets = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getTickets(tenantId);
      setTickets(data);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = activeTab === 'todos'
    ? tickets
    : tickets.filter((t) => t.status === activeTab);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const resolvedToday = tickets.filter((t) => {
    if (t.status !== 'resolved') return false;
    const today = new Date();
    const updated = new Date(t.updatedAt);
    return (
      updated.getDate() === today.getDate() &&
      updated.getMonth() === today.getMonth() &&
      updated.getFullYear() === today.getFullYear()
    );
  }).length;

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.adminNotes || '');
  };

  const closeDetail = () => {
    setSelectedTicket(null);
    setAdminNotes('');
  };

  const handleStatusChange = async (status: 'open' | 'resolved' | 'closed') => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await updateTicket(selectedTicket.id, { status, adminNotes });
      await loadTickets();
      setSelectedTicket((prev) => prev ? { ...prev, status, adminNotes: adminNotes || prev.adminNotes } : null);
    } catch (err) {
      console.error('Error updating ticket:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await updateTicket(selectedTicket.id, { adminNotes });
      await loadTickets();
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const userTypeBadge = (type: string) => {
    return type === 'customer' ? (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
        Cliente
      </span>
    ) : (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
        Subdistribuidor
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Tickets de Soporte</h1>
          <p className="text-white/60 text-sm">Gestión de solicitudes de soporte</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-500 text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Total Tickets</p>
            <TicketIcon size={18} className="text-primary-400" />
          </div>
          <p className="text-2xl font-bold text-white">{tickets.length}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Abiertos</p>
            <HelpCircle size={18} className="text-yellow-400" />
          </div>
          <p className="text-2xl font-bold text-yellow-400">{openCount}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Resueltos Hoy</p>
            <CheckCircle size={18} className="text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400">{resolvedToday}</p>
        </div>
      </div>

      {/* Table */}
      {filteredTickets.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <p className="text-white/50">No hay tickets de soporte</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Servicio</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Asunto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredTickets.map((ticket) => (
                  <motion.tr
                    key={ticket.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-white/50 text-sm whitespace-nowrap">{formatDate(ticket.createdAt)}</td>
                    <td className="px-4 py-3">{userTypeBadge(ticket.userType)}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">{ticket.serviceName}</td>
                    <td className="px-4 py-3 text-white text-sm max-w-[200px] truncate">{ticket.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[ticket.status].className}`}>
                        {STATUS_BADGES[ticket.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openTicket(ticket)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-xs"
                      >
                        <Eye size={14} />
                        Ver
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div className="glass-dark rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Detalle del Ticket</h2>
              <button onClick={closeDetail} className="text-white/50 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Fecha</p>
                  <p className="text-white text-sm">{formatDate(selectedTicket.createdAt)}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Tipo</p>
                  <div className="mt-0.5">{userTypeBadge(selectedTicket.userType)}</div>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Servicio</p>
                  <p className="text-white text-sm">{selectedTicket.serviceName}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Estado</p>
                  <div className="mt-0.5">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGES[selectedTicket.status].className}`}>
                      {STATUS_BADGES[selectedTicket.status].label}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Asunto</p>
                <p className="text-white text-sm font-medium">{selectedTicket.subject}</p>
              </div>

              <div>
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Descripción</p>
                <p className="text-white/80 text-sm bg-white/5 rounded-lg p-3 whitespace-pre-wrap">{selectedTicket.description}</p>
              </div>

              {selectedTicket.imageUrl && (
                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Imagen</p>
                  <img
                    src={selectedTicket.imageUrl}
                    alt="Ticket"
                    className="rounded-lg max-h-64 object-contain bg-white/5"
                  />
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Notas del Admin</p>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="input-field min-h-[100px] resize-y"
                  placeholder="Escribe tus notas aquí..."
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {selectedTicket.status === 'open' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      disabled={saving}
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      {saving ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle size={16} />}
                      Resolver
                    </button>
                    <button
                      onClick={() => handleStatusChange('closed')}
                      disabled={saving}
                      className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      Cerrar
                    </button>
                  </>
                )}
                {selectedTicket.status === 'resolved' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('open')}
                      disabled={saving}
                      className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <HelpCircle size={16} />
                      Reabrir
                    </button>
                    <button
                      onClick={() => handleStatusChange('closed')}
                      disabled={saving}
                      className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      Cerrar
                    </button>
                  </>
                )}
                {selectedTicket.status === 'closed' && (
                  <button
                    onClick={() => handleStatusChange('open')}
                    disabled={saving}
                    className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    <HelpCircle size={16} />
                    Reabrir
                  </button>
                )}
                <button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 ml-auto"
                >
                  {saving ? <Loader className="w-4 h-4 animate-spin" /> : null}
                  Guardar Notas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTickets;
