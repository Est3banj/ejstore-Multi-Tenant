import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getServices } from '../../services/firestore';
import { getAccounts, deleteAccount, getServiceStock } from '../../services/marketplace';
import { motion } from 'framer-motion';
import { Plus, Upload, Edit2, Trash2, Loader, ChevronDown } from 'lucide-react';
import type { ServiceAccount, Service } from '../../types';
import AccountFormModal from '../../components/admin/AccountFormModal';
import BatchImportModal from '../../components/admin/BatchImportModal';

const Accounts = () => {
  const { tenant, userTenantId } = useApp();
  const tenantId = tenant?.id || userTenantId;

  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [stock, setStock] = useState({ total: 0, available: 0, sold: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ServiceAccount | undefined>();
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  useEffect(() => {
    if (tenantId) loadServices();
  }, [tenantId]);

  const loadServices = async () => {
    if (!tenantId) return;
    try {
      const data = await getServices(tenantId);
      setServices(data);
      if (data.length > 0 && !selectedServiceId) {
        setSelectedServiceId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading services:', error);
    }
  };

  useEffect(() => {
    if (selectedServiceId) {
      loadAccounts();
      loadStock();
    }
  }, [selectedServiceId]);

  const loadAccounts = async () => {
    if (!selectedServiceId) return;
    setLoading(true);
    try {
      const data = await getAccounts(selectedServiceId);
      setAccounts(data);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStock = async () => {
    if (!selectedServiceId) return;
    try {
      const data = await getServiceStock(selectedServiceId);
      setStock(data);
    } catch (error) {
      console.error('Error loading stock:', error);
    }
  };

  const handleDelete = async (account: ServiceAccount) => {
    if (account.status === 'sold' && account.purchaseId) {
      const confirmed = window.confirm(
        `Esta cuenta fue asignada a ${account.soldTo || 'un cliente'}. Estas seguro de eliminarla?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm('Estas seguro de eliminar esta cuenta?');
      if (!confirmed) return;
    }

    setDeleting(account.id);
    try {
      await deleteAccount(selectedServiceId, account.id);
      await loadAccounts();
      await loadStock();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error al eliminar la cuenta');
    } finally {
      setDeleting(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveAccount = async (data: any) => {
    if (editingAccount) {
      const { updateAccount } = await import('../../services/marketplace');
      await updateAccount(selectedServiceId, editingAccount.id, data);
    } else {
      const { createAccount } = await import('../../services/marketplace');
      await createAccount(selectedServiceId, data);
    }
    await loadAccounts();
    await loadStock();
  };

  const handleEdit = (account: ServiceAccount) => {
    setEditingAccount(account);
    setAccountModalOpen(true);
  };

  const handleAdd = () => {
    setEditingAccount(undefined);
    setAccountModalOpen(true);
  };

  const statusBadge = (status: ServiceAccount['status']) => {
    const styles: Record<string, string> = {
      available: 'bg-green-500/20 text-green-400 border-green-500/30',
      sold: 'bg-red-500/20 text-red-400 border-red-500/30',
      expired: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      suspended: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    const labels: Record<string, string> = {
      available: 'Disponible',
      sold: 'Vendida',
      expired: 'Expirada',
      suspended: 'Suspendida',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status] || ''}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Cuentas</h1>
          <p className="text-white/60 text-sm">Gestion de cuentas por servicio</p>
        </div>
      </div>

      {services.length === 0 ? (
        <div className="glass p-12 text-center">
          <p className="text-white/50">No hay servicios disponibles</p>
        </div>
      ) : (
        <>
          <div className="glass p-4 rounded-xl mb-6">
            <label className="block text-sm text-white/60 mb-2">Servicio</label>
            <div className="relative">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 appearance-none cursor-pointer focus:outline-none focus:border-primary-500"
              >
                <option value="" disabled>Seleccionar servicio...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={18} />
            </div>
          </div>

          {selectedServiceId && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="glass p-4 rounded-xl text-center">
                  <p className="text-2xl font-bold text-white">{stock.total}</p>
                  <p className="text-white/50 text-xs">Total</p>
                </div>
                <div className="glass p-4 rounded-xl text-center">
                  <p className="text-2xl font-bold text-green-400">{stock.available}</p>
                  <p className="text-white/50 text-xs">Disponibles</p>
                </div>
                <div className="glass p-4 rounded-xl text-center">
                  <p className="text-2xl font-bold text-red-400">{stock.sold}</p>
                  <p className="text-white/50 text-xs">Vendidas</p>
                </div>
                <div className="glass p-4 rounded-xl text-center">
                  <p className="text-2xl font-bold text-yellow-400">{stock.expired}</p>
                  <p className="text-white/50 text-xs">Expiradas</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
                >
                  <Plus size={16} />
                  Agregar cuenta
                </button>
                <button
                  onClick={() => setBatchModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
                >
                  <Upload size={16} />
                  Carga por lote
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-primary-400" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="glass p-12 text-center">
                  <p className="text-white/50">No hay cuentas para este servicio</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map(account => (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass p-4 rounded-xl"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium truncate">
                              {account.label || account.credential?.email}
                            </p>
                            {statusBadge(account.status)}
                          </div>
                          {account.credential?.email && (
                            <p className="text-white/60 text-sm mt-1 truncate">
                              {account.credential.email}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                            {account.batchNumber && (
                              <span>Lote: {account.batchNumber}</span>
                            )}
                            {account.createdAt && (
                              <span>{new Date(account.createdAt).toLocaleDateString('es-CO')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          <button
                            onClick={() => handleEdit(account)}
                            disabled={!!deleting}
                            className="p-2 rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(account)}
                            disabled={!!deleting}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            title="Eliminar"
                          >
                            {deleting === account.id ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}

          {selectedServiceId && (
            <>
              <AccountFormModal
                isOpen={accountModalOpen}
                onClose={() => { setAccountModalOpen(false); setEditingAccount(undefined); }}
                onSave={handleSaveAccount}
                serviceId={selectedServiceId}
                account={editingAccount}
              />
              <BatchImportModal
                isOpen={batchModalOpen}
                onClose={() => setBatchModalOpen(false)}
                serviceId={selectedServiceId}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Accounts;
