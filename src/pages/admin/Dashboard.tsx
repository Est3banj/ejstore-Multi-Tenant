import { useApp } from '../../context/AppContext';
import { useAuthStore } from '../../store/authStore';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Package, Wallet, Ticket, AlertCircle, LucideIcon } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { adminDb as db } from '../../services/firebase';
import { Link } from 'react-router-dom';

interface DashboardData {
  customers: number;
  services: number;
  activeServices: number;
  pendingRecharges: number;
  pendingTickets: number;
}

interface Card {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  urgent?: boolean;
}

const Dashboard = () => {
  const { services: _services, banners, tenant, userTenantId } = useApp();
  const { role } = useAuthStore();
  const effectiveTenantId = tenant?.id || userTenantId;
  const isSuperadmin = role === 'superadmin';

  const [data, setData] = useState<DashboardData>({ customers: 0, services: 0, activeServices: 0, pendingRecharges: 0, pendingTickets: 0 });

  useEffect(() => {
    const load = async () => {
      if (!effectiveTenantId) return;
      try {
        const { getAllServices } = await import('../../services/firestore');
        const all = await getAllServices(effectiveTenantId, db);

        let customerCount = 0, pendingCount = 0, ticketCount = 0;
        try {
          const cq = isSuperadmin
            ? query(collection(db, 'customers'))
            : query(collection(db, 'customers'), where('tenantId', '==', effectiveTenantId));
          const cSnap = await getDocs(cq);
          customerCount = cSnap.size;
        } catch {}

        try {
          const rq = query(
            collection(db, 'recharges'),
            where('tenantId', '==', effectiveTenantId),
            where('status', '==', 'pending')
          );
          const rSnap = await getDocs(rq);
          pendingCount = rSnap.size;
        } catch {}

        try {
          const tq = query(
            collection(db, 'tickets'),
            where('tenantId', '==', effectiveTenantId),
            where('status', '==', 'open')
          );
          const tSnap = await getDocs(tq);
          ticketCount = tSnap.size;
        } catch {}

        setData({
          customers: customerCount,
          services: all.length,
          activeServices: all.filter(s => s.isActive).length,
          pendingRecharges: pendingCount,
          pendingTickets: ticketCount,
        });
      } catch (error) {
        console.error('Error loading dashboard:', error);
      }
    };
    load();
  }, [effectiveTenantId, banners, isSuperadmin]);

  const cards: Card[] = [
    { label: 'Clientes', value: data.customers, icon: Users, color: 'from-gray-400 to-gray-600' },
    { label: 'Servicios Activos', value: `${data.activeServices}/${data.services}`, icon: Package, color: 'from-gray-300 to-gray-500' },
    { label: 'Recargas Pendientes', value: data.pendingRecharges, icon: Wallet, color: 'from-gray-400 to-gray-600', urgent: data.pendingRecharges > 0 },
    { label: 'Reportes Pendientes', value: data.pendingTickets, icon: Ticket, color: 'from-gray-400 to-gray-600', urgent: data.pendingTickets > 0 },
  ];

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Resumen general de la tienda</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`bg-gray-800 rounded-xl p-5 border ${
                c.urgent ? 'border-yellow-500/40' : 'border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{c.label}</p>
                  <p className={`text-3xl font-bold mt-2 ${c.urgent ? 'text-yellow-400' : 'text-white'}`}>
                    {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                  </p>
                </div>
                <div className={`p-3 rounded-lg bg-gradient-to-br ${c.color} ${c.urgent ? 'animate-pulse' : ''}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="space-y-3">
        {data.pendingRecharges > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Link
              to="/admin/recargas"
              className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl hover:bg-yellow-500/15 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-yellow-500/20 shrink-0">
                <AlertCircle size={20} className="text-yellow-400" />
              </div>
              <div className="flex-1">
                <p className="text-yellow-400 font-medium">
                  {data.pendingRecharges} recarga{data.pendingRecharges !== 1 ? 's' : ''} pendiente{data.pendingRecharges !== 1 ? 's' : ''}
                </p>
                <p className="text-yellow-500/70 text-sm">Hacé clic para revisarlas</p>
              </div>
              <span className="text-yellow-400 text-sm font-medium group-hover:underline shrink-0">
                Ir a Recargas →
              </span>
            </Link>
          </motion.div>
        )}

        {data.pendingTickets > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Link
              to="/admin/tickets"
              className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500/15 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-rose-500/20 shrink-0">
                <AlertCircle size={20} className="text-rose-400" />
              </div>
              <div className="flex-1">
                <p className="text-rose-400 font-medium">
                  {data.pendingTickets} reporte{data.pendingTickets !== 1 ? 's' : ''} pendiente{data.pendingTickets !== 1 ? 's' : ''}
                </p>
                <p className="text-rose-500/70 text-sm">Hacé clic para revisarlos</p>
              </div>
              <span className="text-rose-400 text-sm font-medium group-hover:underline shrink-0">
                Ir a Tickets →
              </span>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
