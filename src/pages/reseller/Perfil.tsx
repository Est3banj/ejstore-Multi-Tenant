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
import { adminDb } from '../../services/firebase';
import { User, Mail, Phone, Percent, Wallet, Clock } from 'lucide-react';

interface BalanceTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Date;
}

const Perfil = (): JSX.Element => {
  const { adminUser } = useAuthStore();
  const uid = adminUser?.uid || '';
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
            email: data.email || adminUser?.email || '',
            phone: data.phone || '',
            balance: data.balance || 0,
            commissionPercent: data.commissionPercent || 0,
          });
        }

        try {
          const q = query(
            collection(adminDb, 'balanceTransactions'),
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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando perfil...</p>
        </div>
      </div>
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
                {resellerData?.email || adminUser?.email}
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

      {/* Telegram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Notificaciones Telegram
          </h2>
          <ResellerTelegramSection />
        </div>
      </motion.div>
    </div>
  );
};

const ResellerTelegramSection = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'linked' | 'unlinked'>('idle');
  const [token, setToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const check = async () => {
      try {
        const { checkTelegramStatus } = await import('../../services/marketplace');
        const result = await checkTelegramStatus();
        setStatus(result.linked ? 'linked' : 'unlinked');
      } catch {
        setStatus('unlinked');
      }
    };
    check();
  }, []);

  const handleGenerate = async () => {
    setError('');
    setStatus('loading');
    try {
      const { generateTelegramToken } = await import('../../services/marketplace');
      const result = await generateTelegramToken();
      setToken(result.token);
      setBotUsername(result.botUsername);
    } catch (e: any) {
      setError(e.message || 'Error al generar token');
      setStatus('unlinked');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`/start ${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {status === 'linked' ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          <div>
            <p className="text-emerald-400 font-medium">Vinculado a Telegram</p>
            <p className="text-emerald-400/60 text-sm">Recibirás notificaciones de tus movimientos</p>
          </div>
        </div>
      ) : token ? (
        <div className="space-y-3">
          <div className="p-4 bg-gray-900/50 rounded-xl border border-primary-500/20">
            <p className="text-gray-400 text-xs mb-2">Tu token de vinculación (vence en 5 min)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 rounded-lg px-3 py-2 text-primary-400 font-bold text-lg tracking-wider text-center select-all">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
                title="Copiar"
              >
                {copied ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <ol className="mt-3 space-y-1 text-gray-400 text-sm">
              <li>1. Abrí Telegram y buscá <strong className="text-white">@{botUsername || 'el bot'}</strong></li>
              <li>2. Iniciá el bot y enviá el token: <code className="text-primary-400 bg-gray-950 px-1 rounded">{token}</code></li>
            </ol>
          </div>
          <button
            onClick={() => setToken('')}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={status === 'loading'}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {status === 'loading' ? (
              <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generando...</>
            ) : (
              <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Vincular Telegram</>
            )}
          </button>
          <p className="text-gray-500 text-xs mt-2">
            Vinculá tu Telegram para recibir notificaciones de ventas, vencimientos y más.
          </p>
        </div>
      )}
    </div>
  );
};

export default Perfil;