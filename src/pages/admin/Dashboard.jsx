import { useApp } from '../../context/AppContext';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Tag, Image, Settings, Users, Wallet, Search } from 'lucide-react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';

const Dashboard = () => {
  const { services, banners, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const [allServices, setAllServices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalServices: 0,
    activeServices: 0,
    totalBanners: 0,
    activeBanners: 0,
    totalCustomers: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!effectiveTenantId) return;
      try {
        const { getAllServices } = await import('../../services/firestore');
        const all = await getAllServices(effectiveTenantId);
        setAllServices(all);
        
        // Cargar clientes
        setLoadingCustomers(true);
        try {
          const customersQuery = query(
            collection(db, 'customers'),
            orderBy('createdAt', 'desc')
          );
          const customerSnap = await getDocs(customersQuery);
          const customerList = customerSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setCustomers(customerList);
          setStats({
            totalServices: all.length,
            activeServices: all.filter(s => s.active).length,
            totalBanners: banners.length,
            activeBanners: banners.filter(b => b.active).length,
            totalCustomers: customerList.length
          });
        } catch (err) {
          console.error('Error loading customers:', err);
        } finally {
          setLoadingCustomers(false);
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    loadStats();
  }, [effectiveTenantId, banners]);

  // Filtrar clientes por búsqueda
  const filteredCustomers = customers.filter(customer => {
    const search = searchTerm.toLowerCase();
    return (
      customer.email?.toLowerCase().includes(search) ||
      customer.firstName?.toLowerCase().includes(search) ||
      customer.lastName?.toLowerCase().includes(search) ||
      customer.phone?.includes(search)
    );
  });

  const statCards = [
    {
      title: 'Clientes',
      value: stats.totalCustomers,
      icon: Users,
      color: 'from-blue-500 to-indigo-600'
    },
    {
      title: 'Servicios Totales',
      value: stats.totalServices,
      icon: Package,
      color: 'from-primary-500 to-red-600'
    },
    {
      title: 'Servicios Activos',
      value: stats.activeServices,
      icon: Tag,
      color: 'from-green-500 to-emerald-500'
    },
    {
      title: 'Banners Activos',
      value: stats.activeBanners,
      icon: Image,
      color: 'from-purple-500 to-pink-500'
    }
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
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
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg bg-gradient-to-br ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Customers Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Clientes Registrados
            </h2>
            <span className="text-gray-400 text-sm">{customers.length} total</span>
          </div>
          
          {/* Search */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Saldo
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Registrado
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loadingCustomers ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    Cargando clientes...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-700/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
                          <span className="text-primary-400 font-medium text-sm">
                            {(customer.firstName || customer.email || 'U')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">
                            {customer.firstName} {customer.lastName}
                          </p>
                          <p className="text-gray-400 text-sm">{customer.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-gray-300">{customer.phone || '-'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`font-medium ${customer.balance > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                        ${(customer.balance || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-gray-400 text-sm">
                        {customer.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button className="text-primary-400 hover:text-primary-300 text-sm font-medium">
                        Cargar Saldo
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-primary-500/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary-500/20">
              <Wallet className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-white font-medium">Recargas Pendientes</p>
              <p className="text-gray-400 text-sm">Ver solicitudes de recarga</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;