import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { getResellerById } from '../../services/marketplace';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Wallet, DollarSign, Percent, ShoppingCart } from 'lucide-react';

interface Purchase {
  id: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: string;
  createdAt: Date;
}

const ResellerDashboard = (): JSX.Element => {
  const { user } = useAuthStore();
  const uid = user?.uid || '';
  const [balance, setBalance] = useState(0);
  const [resellerName, setResellerName] = useState('');
  const [commission, setCommission] = useState(0);
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
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
          setCommission(resellerData.commissionPercent || 0);
        }

        const q = query(
          collection(db, 'purchases'),
          where('customerId', '==', uid),
          where('type', '==', 'bulk'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const purchases: Purchase[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            serviceName: data.serviceName || '',
            quantity: data.quantity || 1,
            unitPrice: data.unitPrice || 0,
            total: data.total || 0,
            status: data.status || 'completed',
            createdAt: data.createdAt?.toDate?.() || new Date(),
          };
        });
        setRecentPurchases(purchases);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  const totalCuentas = recentPurchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalInvertido = recentPurchases.reduce((sum, p) => sum + p.total, 0);

  const stats = [
    {
      title: 'Saldo Actual',
      value: `$${balance.toLocaleString()}`,
      icon: Wallet,
      color: 'from-yellow-500 to-orange-600',
    },
    {
      title: 'Total Cuentas Compradas',
      value: totalCuentas,
      icon: ShoppingCart,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'Total Invertido',
      value: `$${totalInvertido.toLocaleString()}`,
      icon: DollarSign,
      color: 'from-green-500 to-emerald-600',
    },
    {
      title: 'Comisión Configurada',
      value: `${commission}%`,
      icon: Percent,
      color: 'from-purple-500 to-pink-600',
    },
  ];

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Dashboard {resellerName ? `- ${resellerName}` : ''}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Panel de control de subdistribuidor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gray-800 rounded-xl p-5 border border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{stat.title}</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-lg bg-gradient-to-br ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-400" />
            Compras Recientes
          </h2>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-8">Cargando...</div>
        ) : recentPurchases.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No hay compras aún. Explora el catálogo mayorista.
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
                    Precio Unit.
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
                {recentPurchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-700/30">
                    <td className="px-5 py-4 text-gray-300 text-sm">
                      {purchase.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-white font-medium">
                      {purchase.serviceName}
                    </td>
                    <td className="px-5 py-4 text-gray-300">{purchase.quantity}</td>
                    <td className="px-5 py-4 text-gray-300">
                      ${purchase.unitPrice.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-white font-medium">
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