import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { useAuthStore } from '../../store/authStore';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { adminDb as db, adminFunctions as functions } from '../../services/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  Search, X, Users, Wallet, Calendar, ChevronDown, ChevronUp,
  Loader, AlertCircle, User, Mail,
} from 'lucide-react';

interface Cliente {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  balance?: number;
  tenantId?: string;
  createdAt?: any;
}

type SortField = 'name' | 'email' | 'balance' | 'createdAt';
type SortDir = 'asc' | 'desc';

const Clientes = () => {
  const { tenant, userTenantId } = useApp();
  const { role } = useAuthStore();
  const tenantId = tenant?.id || userTenantId;
  const isSuperadmin = role === 'superadmin';

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modal recarga
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  useEffect(() => {
    if (tenantId) loadClientes();
  }, [tenantId]);

  const loadClientes = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const q = isSuperadmin
        ? query(collection(db, 'customers'), limit(200))
        : query(collection(db, 'customers'), where('tenantId', '==', tenantId), limit(200));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente));
      setClientes(list);
    } catch (err: any) {
      console.error('Error loading customers:', err);
      setError(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    let list = clientes;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name':
          return dir * (`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
        case 'email':
          return dir * (a.email || '').localeCompare(b.email || '');
        case 'balance':
          return dir * ((a.balance || 0) - (b.balance || 0));
        case 'createdAt': {
          const da = a.createdAt?.toMillis?.() || 0;
          const db2 = b.createdAt?.toMillis?.() || 0;
          return dir * (da - db2);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [clientes, search, sortField, sortDir]);

  const handleRecharge = async () => {
    if (!selectedCliente) return;
    const amount = parseInt(rechargeAmount);
    if (!amount || amount < 1000) { alert('Monto mínimo $1,000'); return; }
    setRecharging(true);
    try {
      const cf = httpsCallable(functions, 'loadCustomerBalance');
      const res = await cf({ customerId: selectedCliente.id, amount });
      if ((res.data as any).success) {
        setClientes(prev => prev.map(c =>
          c.id === selectedCliente.id ? { ...c, balance: (c.balance || 0) + amount } : c
        ));
        setSelectedCliente(null);
        setRechargeAmount('');
      }
    } catch (err: any) {
      alert('Error: ' + (err.message || 'desconocido'));
    } finally {
      setRecharging(false);
    }
  };

  const totalBalance = clientes.reduce((s, c) => s + (c.balance || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrados &mdash; ${totalBalance.toLocaleString()} en saldo total
          </p>
        </div>
        <button
          onClick={loadClientes}
          disabled={loading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Loader size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-2.5 pl-10 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Cargando clientes...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-800/50 rounded-2xl p-16 text-center border border-dashed border-gray-700">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-700/40 flex items-center justify-center">
            {search ? <Search size={32} className="text-gray-500" /> : <Users size={32} className="text-gray-500" />}
          </div>
          <p className="text-gray-400 text-lg font-medium">
            {search ? 'No se encontraron clientes' : 'No hay clientes registrados'}
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/30">
                  {([
                    { key: 'name' as SortField, label: 'Cliente', icon: User },
                    { key: 'email' as SortField, label: 'Email', icon: Mail },
                    { key: 'balance' as SortField, label: 'Saldo', icon: Wallet },
                    { key: 'createdAt' as SortField, label: 'Registrado', icon: Calendar },
                  ]).map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-5 py-3.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <col.icon size={13} />
                        {col.label}
                        {sortField === col.key && (
                          sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-5 py-3.5 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filtered.map((cliente, i) => (
                  <motion.tr
                    key={cliente.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center border border-primary-500/20">
                          <span className="text-primary-400 font-bold text-sm">
                            {((cliente.firstName || cliente.email || '?')[0]).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{cliente.firstName} {cliente.lastName}</p>
                          {cliente.phone && <p className="text-gray-500 text-xs">{cliente.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-300 text-sm">{cliente.email || '-'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`font-medium ${(cliente.balance || 0) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                        ${(cliente.balance || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-gray-400 text-sm">
                        {cliente.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => { setRechargeAmount(''); setSelectedCliente(cliente); }}
                        className="px-3 py-1.5 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 rounded-lg text-xs font-medium transition-all"
                      >
                        Cargar Saldo
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2 p-4">
            {filtered.map(cliente => (
              <div key={cliente.id} className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center border border-primary-500/20">
                    <span className="text-primary-400 font-bold">
                      {((cliente.firstName || cliente.email || '?')[0]).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{cliente.firstName} {cliente.lastName}</p>
                    <p className="text-gray-400 text-xs truncate">{cliente.email}</p>
                  </div>
                  <span className={`font-bold text-sm ${(cliente.balance || 0) > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                    ${(cliente.balance || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{cliente.phone || 'Sin teléfono'}</span>
                  <span>{cliente.createdAt?.toDate?.()?.toLocaleDateString() || '-'}</span>
                </div>
                <button
                  onClick={() => { setRechargeAmount(''); setSelectedCliente(cliente); }}
                  className="w-full mt-3 py-2 bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 rounded-lg text-sm font-medium transition-all"
                >
                  Cargar Saldo
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-700/50 bg-gray-900/20">
            <p className="text-gray-500 text-xs">
              Mostrando {filtered.length} de {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
              {search && ' (filtrados)'}
            </p>
          </div>
        </div>
      )}

      {/* Modal recarga */}
      <AnimatePresence>
        {selectedCliente && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCliente(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-white mb-1">Cargar Saldo</h3>
              <p className="text-gray-400 text-sm mb-5">
                {selectedCliente.firstName} {selectedCliente.lastName}
              </p>

              <div className="mb-4 p-4 bg-gray-900/50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Saldo actual</span>
                  <span className="text-white font-bold">${(selectedCliente.balance || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Monto a agregar (COP)</label>
                <input
                  type="number"
                  value={rechargeAmount}
                  onChange={e => setRechargeAmount(e.target.value)}
                  placeholder="Ej: 10000"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
                  min={1000}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedCliente(null)}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRecharge}
                  disabled={recharging || !rechargeAmount}
                  className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {recharging ? <><Loader size={14} className="animate-spin" /> Cargando...</> : 'Confirmar Recarga'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Clientes;
