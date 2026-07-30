import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { db } from '../../services/firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, Mail, Phone, Bell, Clock, RefreshCw, Wallet } from 'lucide-react';
import { RechargeModal } from '../../components/RechargeModal';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  description?: string;
  serviceName?: string;
}

const PerfilTab = () => {
  const { customer } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);
  const [emailNotif, setEmailNotif] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTransactions();
    loadPreferences();
  }, []);

  const loadTransactions = async () => {
    if (!customer?.uid) return;
    try {
      const q = query(
        collection(db, 'balanceTransactions'),
        where('customerId', '==', customer.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    } catch (e) {
      console.error('Error loading transactions:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    if (!customer?.uid) return;
    try {
      const userDoc = await getDoc(doc(db, 'customers', customer.uid));
      if (userDoc.exists() && userDoc.data().emailNotifications) {
        setEmailNotif(true);
      }
    } catch (_) {}
  };

  const toggleEmailNotif = async () => {
    if (!customer?.uid) return;
    setSaving(true);
    try {
      const newVal = !emailNotif;
      await updateDoc(doc(db, 'customers', customer.uid), { emailNotifications: newVal });
      setEmailNotif(newVal);
    } catch (e) {
      console.error('Error saving preference:', e);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-6">
      {/* Personal Info */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-primary-400" />
          Datos Personales
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Nombre</p>
              <p className="font-medium text-white">{customer?.firstName || ''} {customer?.lastName || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium text-white">{customer?.email || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
            <Phone className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Teléfono</p>
              <p className="font-medium text-white">{customer?.phone || 'No registrado'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">Saldo actual</p>
            <p className="text-3xl font-bold">${(customer?.balance || 0).toLocaleString('es-CO')} COP</p>
          </div>
          <button
            onClick={() => setShowRecharge(true)}
            className="bg-white text-primary-600 px-4 py-2 rounded-lg font-semibold hover:bg-white/90 transition flex items-center gap-2"
          >
            <Wallet size={16} />
            Cargar Saldo
          </button>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-400" />
            <div>
              <p className="font-medium text-white">Notificaciones por email</p>
              <p className="text-sm text-gray-400">Recibí información de tus compras y recargas por correo</p>
            </div>
          </div>
          <button
            onClick={toggleEmailNotif}
            disabled={saving}
            className={`relative w-12 h-6 rounded-full transition-colors ${emailNotif ? 'bg-primary-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${emailNotif ? 'translate-x-6' : ''}`} />
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary-400" />
          Últimos Movimientos
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>No hay movimientos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left py-2">Fecha</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-left py-2">Descripción</th>
                  <th className="text-right py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-b border-gray-700 last:border-0 hover:bg-gray-700/50 text-white">
                    <td className="py-2">{formatDate(tx.createdAt)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        tx.type === 'purchase' || tx.type === 'bulk_purchase'
                          ? 'bg-red-500/20 text-red-400'
                          : tx.type === 'recharge'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/10 text-white/70'
                      }`}>
                        {tx.type === 'purchase' || tx.type === 'bulk_purchase' ? 'Compra'
                          : tx.type === 'recharge' ? 'Recarga'
                          : tx.type}
                      </span>
                    </td>
                    <td className="py-2 text-gray-300">{tx.serviceName || tx.description || '-'}</td>
                    <td className={`py-2 text-right font-medium ${(tx.amount || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(tx.amount || 0) >= 0 ? '+' : ''}{tx.amount?.toLocaleString('es-CO') || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRecharge && <RechargeModal onClose={() => setShowRecharge(false)} />}
    </div>
  );
};

export default PerfilTab;
