import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { getResellers, createReseller, loadResellerBalance } from '../../services/marketplace';
import { Users, UserPlus, DollarSign, Wallet, Phone, Percent, Activity, X, Loader } from 'lucide-react';
import { motion } from 'framer-motion';

interface Reseller {
  id: string;
  email: string;
  name: string;
  phone?: string;
  balance?: number;
  commissionPercent?: number;
  active?: boolean;
  createdAt?: any;
  tenantId?: string;
}

const AdminResellers = (): JSX.Element => {
  const { tenant, userTenantId } = useApp();
  const tenantId = tenant?.id || userTenantId;

  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [loadingBalanceTarget, setLoadingBalanceTarget] = useState<Reseller | null>(null);
  const [loadAmount, setLoadAmount] = useState('');
  const [loadingBalance, setLoadingBalance] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (tenantId) loadResellers();
  }, [tenantId]);

  const loadResellers = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getResellers(tenantId);
      setResellers(data as Reseller[]);
    } catch (err) {
      console.error('Error loading resellers:', err);
      setError('Error al cargar subdistribuidores');
    } finally {
      setLoading(false);
    }
  };

  const totalResellers = resellers.length;
  const totalBalance = resellers.reduce((sum, r) => sum + (r.balance || 0), 0);
  const activeResellers = resellers.filter(r => r.active !== false).length;

  const handleCreateReseller = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenantId) return;
    setCreating(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      commissionPercent: Number(formData.get('commissionPercent')) || 0,
    };
    try {
      await createReseller(data);
      showToast('success', 'Subdistribuidor creado correctamente');
      setCreateModalOpen(false);
      form.reset();
      await loadResellers();
    } catch (err: any) {
      const msg = err?.message || 'Error al crear subdistribuidor';
      showToast('error', msg);
    } finally {
      setCreating(false);
    }
  };

  const openLoadModal = (reseller: Reseller) => {
    setLoadingBalanceTarget(reseller);
    setLoadAmount('');
    setLoadModalOpen(true);
  };

  const handleLoadBalance = async () => {
    if (!loadingBalanceTarget) return;
    const amount = Number(loadAmount);
    if (amount < 1000) {
      showToast('error', 'El monto mínimo es $1,000');
      return;
    }
    setLoadingBalance(true);
    try {
      const result = await loadResellerBalance({
        resellerId: loadingBalanceTarget.id,
        amount,
      });
      showToast('success', `Saldo cargado correctamente. Nuevo saldo: $${result.newBalance.toLocaleString()}`);
      setLoadModalOpen(false);
      await loadResellers();
    } catch (err: any) {
      const msg = err?.message || 'Error al cargar saldo';
      showToast('error', msg);
    } finally {
      setLoadingBalance(false);
    }
  };

  const formatCurrency = (amount: number = 0) => {
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (date: any) => {
    if (!date) return '-';
    if (date.toDate) return date.toDate().toLocaleDateString('es-CO');
    if (date.seconds) return new Date(date.seconds * 1000).toLocaleDateString('es-CO');
    return new Date(date).toLocaleDateString('es-CO');
  };

  const statusBadge = (active: boolean | undefined) => {
    return active !== false ? (
      <span className="px-2 py-0.5 rounded-full text-xs border bg-green-500/20 text-green-400 border-green-500/30">
        Activo
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs border bg-red-500/20 text-red-400 border-red-500/30">
        Inactivo
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
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Subdistribuidores</h1>
          <p className="text-white/60 text-sm">Gestión de resellers y saldos</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
        >
          <UserPlus size={16} />
          Crear Subdistribuidor
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Total Resellers</p>
            <Users size={18} className="text-primary-400" />
          </div>
          <p className="text-2xl font-bold text-white">{totalResellers}</p>
        </div>
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Saldo Total Cargado</p>
            <DollarSign size={18} className="text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(totalBalance)}</p>
        </div>
        <div className="glass p-5 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-sm">Resellers Activos</p>
            <Activity size={18} className="text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-400">{activeResellers}</p>
        </div>
      </div>

      {/* Table */}
      {resellers.length === 0 ? (
        <div className="glass p-12 text-center">
          <p className="text-white/50">No hay subdistribuidores registrados</p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Teléfono</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Balance</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Comisión</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Creado</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {resellers.map((reseller) => (
                  <motion.tr
                    key={reseller.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-white text-sm font-medium">{reseller.name || '-'}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">{reseller.email}</td>
                    <td className="px-4 py-3 text-white/70 text-sm">
                      <div className="flex items-center gap-1">
                        <Phone size={12} className="text-white/40" />
                        {reseller.phone || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white text-sm text-right font-mono">{formatCurrency(reseller.balance)}</td>
                    <td className="px-4 py-3 text-white/70 text-sm text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Percent size={12} className="text-white/40" />
                        {reseller.commissionPercent ?? 0}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(reseller.active)}</td>
                    <td className="px-4 py-3 text-white/50 text-sm">{formatDate(reseller.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openLoadModal(reseller)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-xs mx-auto"
                      >
                        <Wallet size={14} />
                        Cargar Saldo
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Reseller Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !creating && setCreateModalOpen(false)}>
          <div className="glass-dark rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Nuevo Subdistribuidor</h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="text-white/50 hover:text-white p-1 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateReseller} className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="input-field"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Contraseña</label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="input-field"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Nombre</label>
                <input
                  name="name"
                  type="text"
                  required
                  className="input-field"
                  placeholder="Nombre del reseller"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Teléfono</label>
                <input
                  name="phone"
                  type="text"
                  className="input-field"
                  placeholder="+57 300 000 0000"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Comisión (%)</label>
                <input
                  name="commissionPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <Loader className="w-4 h-4 animate-spin" /> : <UserPlus size={16} />}
                  {creating ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load Balance Modal */}
      {loadModalOpen && loadingBalanceTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !loadingBalance && setLoadModalOpen(false)}>
          <div className="glass-dark rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Cargar Saldo</h2>
              <button
                onClick={() => setLoadModalOpen(false)}
                disabled={loadingBalance}
                className="text-white/50 hover:text-white p-1 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="glass p-4 rounded-lg">
                <p className="text-white/60 text-sm">Reseller</p>
                <p className="text-white font-medium">{loadingBalanceTarget.name || loadingBalanceTarget.email}</p>
                <p className="text-white/50 text-xs mt-1">
                  Balance actual: <span className="text-green-400 font-mono">{formatCurrency(loadingBalanceTarget.balance)}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Monto a cargar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                  <input
                    type="number"
                    min="1000"
                    value={loadAmount}
                    onChange={e => setLoadAmount(e.target.value)}
                    className="input-field pl-8"
                    placeholder="1,000"
                  />
                </div>
                <p className="text-white/40 text-xs mt-1">Monto mínimo: $1,000</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setLoadModalOpen(false)}
                  disabled={loadingBalance}
                  className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLoadBalance}
                  disabled={loadingBalance || !loadAmount}
                  className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loadingBalance ? <Loader className="w-4 h-4 animate-spin" /> : <Wallet size={16} />}
                  {loadingBalance ? 'Cargando...' : `Cargar $${Number(loadAmount).toLocaleString() || '0'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminResellers;
