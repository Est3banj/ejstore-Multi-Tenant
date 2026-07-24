import { useState, useEffect } from 'react';
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
import { User, Mail, Phone, Percent, Wallet, Clock } from 'lucide-react';

interface BalanceTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

const Perfil = (): JSX.Element => {
  const { user } = useAuthStore();
  const uid = user?.uid || '';
  const [resellerData, setResellerData] = useState<{
    name: string;
    email: string;
    phone: string;
    balance: number;
    commissionPercent: number;
  } | null>(null);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const data = await getResellerById(uid);
        if (data) {
          setResellerData({
            name: data.name || '',
            email: data.email || user?.email || '',
            phone: data.phone || '',
            balance: data.balance || 0,
            commissionPercent: data.commissionPercent || 0,
          });
        }

        try {
          const q = query(
            collection(db, 'balanceTransactions'),
            where('customerId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(20)
          );
          const snapshot = await getDocs(q);
          const txs: BalanceTransaction[] = snapshot.docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              type: d.type || 'adjustment',
              amount: d.amount || 0,
              description: d.description || '',
              createdAt: d.createdAt?.toDate?.() || new Date(),
            };
          });
          setTransactions(txs);
        } catch {
          // index may not exist yet
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando perfil...</div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b border-gray-700">
            <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center">
              <User className="w-8 h-8 text-primary-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {resellerData?.name || 'Subdistribuidor'}
              </h2>
              <p className="text-gray-400 text-sm">
                {resellerData?.email || user?.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg">
              <Mail className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-gray-400 text-xs">Email</p>
                <p className="text-white">{resellerData?.email || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg">
              <Phone className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-gray-400 text-xs">Teléfono</p>
                <p className="text-white">{resellerData?.phone || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg">
              <Percent className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-gray-400 text-xs">Comisión</p>
                <p className="text-white font-bold">
                  {resellerData?.commissionPercent || 0}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg">
              <Wallet className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-gray-400 text-xs">Saldo Actual</p>
                <p className="text-yellow-400 font-bold">
                  ${resellerData?.balance?.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Historial de Movimientos
          </h2>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No hay movimientos registrados.
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 hover:bg-gray-700/30"
              >
                <div>
                  <p className="text-white font-medium">
                    {tx.description || tx.type}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {tx.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.amount >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}$
                  {Math.abs(tx.amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Perfil;