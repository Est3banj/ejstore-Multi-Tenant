import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { getResellerById } from '../../services/marketplace';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  Wallet,
  ShoppingCart,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Store,
  Users,
  PlusCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseData {
  id: string;
  customerEmail: string;
  customerName?: string;
  serviceName: string;
  createdAt: Date;
  quantity: number;
  total: number;
  unitPrice: number;
  status: string;
  profiles?: { profileName: string; profilePin?: string; credential: Record<string, string> }[];
  durationDays?: number;
  accountIds: string[];
  credentials: Record<string, string>[];
}

interface AccountInfo {
  purchaseId: string;
  serviceName: string;
  customerEmail: string;
  customerName?: string;
  createdAt: Date;
  durationDays: number;
  expirationDate: Date;
  daysRemaining: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ResellerDashboard = (): JSX.Element => {
  const { user } = useAuthStore();
  const uid = user?.uid || '';
  const [balance, setBalance] = useState(0);
  const [resellerName, setResellerName] = useState('');
  const [purchases, setPurchases] = useState<PurchaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const resellerData = await getResellerById(uid);
        if (resellerData) {
          setBalance(resellerData.balance || 0);
          setResellerName(resellerData.name || '');
        }

        const q = query(
          collection(db, 'purchases'),
          where('customerId', '==', uid),
          where('type', '==', 'bulk'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const list: PurchaseData[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            customerEmail: data.customerEmail || '',
            customerName: data.customerName || '',
            serviceName: data.serviceName || '',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            quantity: data.quantity || 1,
            total: data.price || 0,
            unitPrice: data.unitPrice || 0,
            status: data.status || 'active',
            profiles: data.profiles || undefined,
            durationDays: data.durationDays || undefined,
            accountIds: data.accountIds || [],
            credentials: data.credentials || [],
          };
        });
        setPurchases(list);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  // ─── Flatten purchases into individual accounts with dates ─────────────
  const allAccounts = useMemo<AccountInfo[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const accounts: AccountInfo[] = [];

    for (const p of purchases) {
      const durationDays = p.durationDays || 30;
      const expirationDate = new Date(
        p.createdAt.getTime() + durationDays * 24 * 60 * 60 * 1000
      );
      const diffTime = expirationDate.getTime() - today.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      // Count accounts per purchase (profiles or quantity)
      const count = Math.max(
        p.profiles?.length || 0,
        p.credentials?.length || 0,
        p.quantity
      );

      for (let i = 0; i < count; i++) {
        accounts.push({
          purchaseId: p.id,
          serviceName: p.serviceName,
          customerEmail: p.customerEmail,
          customerName: p.customerName,
          createdAt: p.createdAt,
          durationDays,
          expirationDate,
          daysRemaining,
        });
      }
    }

    return accounts;
  }, [purchases]);

  // ─── Stats ─────────────────────────────────────────────────────────────
  const activas = allAccounts.filter((a) => a.daysRemaining > 5).length;
  const proximasAVencer = allAccounts.filter(
    (a) => a.daysRemaining > 0 && a.daysRemaining <= 5
  ).length;
  const vencidas = allAccounts.filter((a) => a.daysRemaining <= 0).length;

  // Próximos a vencer (próximos 5 días, ordenados por fecha)
  const expiringSoon = useMemo(() => {
    return allAccounts
      .filter((a) => a.daysRemaining > 0 && a.daysRemaining <= 5)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 10);
  }, [allAccounts]);

  // ─── Stats cards config ────────────────────────────────────────────────
  const statsCards = [
    {
      title: 'Saldo Actual',
      value: `$${balance.toLocaleString()}`,
      icon: Wallet,
      gradient: 'from-yellow-500 to-orange-600',
      loading,
    },
    {
      title: 'Cargar Saldo',
      value: '—',
      icon: PlusCircle,
      gradient: 'from-sky-500 to-blue-600',
      loading: false,
      badge: 'Próximamente',
    },
    {
      title: 'Cuentas Activas',
      value: activas,
      icon: CheckCircle,
      gradient: 'from-green-500 to-emerald-600',
      loading,
    },
    {
      title: 'Próximas a Vencer',
      value: proximasAVencer,
      icon: Clock,
      gradient: 'from-amber-500 to-orange-600',
      loading,
    },
    {
      title: 'Vencidas',
      value: vencidas,
      icon: XCircle,
      gradient: 'from-red-500 to-rose-600',
      loading,
    },
  ];

  const allClients = new Set(
    purchases.map((p) => p.customerEmail || p.customerName).filter(Boolean)
  );

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando dashboard...</div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Dashboard
            {resellerName ? (
              <span className="text-gray-400 font-normal ml-2">
                — {resellerName}
              </span>
            ) : null}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Resumen de tu actividad como subdistribuidor
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          const isPlaceholder = !!(stat as any).badge;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={
                isPlaceholder
                  ? 'rounded-xl p-4 border-2 border-dashed border-gray-600/60 bg-gray-800/50'
                  : 'bg-gray-800 rounded-xl p-4 border border-gray-700'
              }
            >
              <div className="flex items-center justify-between mb-3">
                <p className={
                  isPlaceholder
                    ? 'text-gray-500 text-xs uppercase tracking-wider font-medium'
                    : 'text-gray-400 text-xs uppercase tracking-wider font-medium'
                }>
                  {stat.title}
                </p>
                <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} ${isPlaceholder ? 'opacity-60' : ''}`}>
                  <Icon className={`w-4 h-4 text-white ${isPlaceholder ? 'opacity-60' : ''}`} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </p>
              {(stat as any).badge && (
                <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-700/50 text-gray-500 border border-gray-600/50">
                  {(stat as any).badge}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Fila de clientes únicos y acciones rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Clientes únicos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gray-800 rounded-xl p-4 border border-gray-700 lg:col-span-1"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600">
              <Users className="w-4 h-4 text-white" />
            </div>
            <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">
              Clientes Atendidos
            </p>
          </div>
          <p className="text-2xl font-bold text-white">
            {allClients.size}
          </p>
        </motion.div>

        {/* Acciones rápidas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800 rounded-xl p-4 border border-gray-700 lg:col-span-2 flex flex-col gap-3"
        >
          <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">
            Acciones Rápidas
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/r/catalogo"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Store size={16} />
              Ir al Catálogo
              <ArrowRight size={14} className="ml-1" />
            </a>
            <a
              href="/r/mis-clientes"
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Users size={16} />
              Ir a Mis Clientes
              <ArrowRight size={14} className="ml-1" />
            </a>
          </div>
        </motion.div>
      </div>

      {/* Próximos a Vencer */}
      {expiringSoon.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-700 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Próximos a Vencer</h2>
            <span className="text-xs text-gray-500 ml-2">
              ({expiringSoon.length} cuenta{expiringSoon.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Vence
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Días Rest.
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {expiringSoon.map((acct, i) => (
                  <tr key={`${acct.purchaseId}_${i}`} className="hover:bg-gray-700/30">
                    <td className="px-5 py-3 text-white text-sm font-medium">
                      {acct.customerName || acct.customerEmail || '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-300 text-sm">
                      {acct.serviceName}
                    </td>
                    <td className="px-5 py-3 text-gray-300 text-sm">
                      {acct.expirationDate.toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-sm font-medium ${
                          acct.daysRemaining <= 2
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {acct.daysRemaining}d
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href="/r/mis-clientes"
                        className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs font-medium"
                      >
                        Ver cliente
                        <ArrowRight size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Compras Recientes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5 border-b border-gray-700 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Compras Recientes</h2>
        </div>

        {purchases.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No hay compras aún.{' '}
            <a
              href="/r/catalogo"
              className="text-primary-400 hover:underline"
            >
              Explorar catálogo
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Cantidad
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {purchases.slice(0, 10).map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-700/30">
                    <td className="px-5 py-4 text-gray-300 text-sm">
                      {purchase.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-white font-medium text-sm">
                      {purchase.serviceName}
                    </td>
                    <td className="px-5 py-4 text-gray-300 text-sm">
                      {purchase.quantity}
                    </td>
                    <td className="px-5 py-4 text-white font-medium text-sm">
                      ${purchase.total.toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                        {purchase.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ResellerDashboard;
