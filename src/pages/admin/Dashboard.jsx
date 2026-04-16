import { useApp } from '../../context/AppContext';
import { useAuthStore } from '../../store/authStore';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Tag, Image, Settings, Users, Wallet, Search, X, Plus } from 'lucide-react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

const Dashboard = () => {
  const { services, banners, tenant, userTenantId } = useApp();
  const { role } = useAuthStore(); // Agregar acceso al role
  const effectiveTenantId = tenant?.id || userTenantId;
  const isSuperadmin = role === 'superadmin';
  const [allServices, setAllServices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);
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
        
        // Cargar clientes: superadmin ve todos, admin ve solo los de su tenant
        setLoadingCustomers(true);
        try {
          let customersQuery;
          if (isSuperadmin) {
            // Superadmin puede ver todos los clientes
            customersQuery = query(
              collection(db, 'customers'),
              orderBy('createdAt', 'desc')
            );
          } else {
            // Admin solo ve clientes de su tenant
            customersQuery = query(
              collection(db, 'customers'),
              where('tenantId', '==', effectiveTenantId),
              orderBy('createdAt', 'desc')
            );
          }
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

        <div className="block md:overflow-x-auto">
          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {loadingCustomers ? (
              <div className="text-center text-gray-400 py-8">Cargando clientes...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <div key={customer.id} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                      <span className="text-primary-400 font-medium">
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
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <p className="text-gray-500">Teléfono</p>
                      <p className="text-gray-300">{customer.phone || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo</p>
                      <p className={`font-medium ${customer.balance > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                        ${(customer.balance || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Registrado</p>
                      <p className="text-gray-400 text-xs">
                        {customer.createdAt?.toDate?.()?.toLocaleDateString() || '-'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedCustomer(customer)}
                    className="w-full mt-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium py-2 rounded-lg"
                  >
                    Cargar Saldo
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <table className="hidden md:table w-full">
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
                      <button 
                        onClick={() => setSelectedCustomer(customer)}
                        className="text-primary-400 hover:text-primary-300 text-sm font-medium"
                      >
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

      {/* Modal para cargar saldo */}
      <AnimatePresence>
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
            onClick={() => setSelectedCustomer(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-gray-800 rounded-t-2xl md:rounded-xl p-4 md:p-6 w-full md:max-w-md border-t md:border border-gray-700"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Cargar Saldo</h3>
                <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-white p-1">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                <p className="text-gray-400 text-xs md:text-sm">Cliente</p>
                <p className="text-white font-medium text-sm md:text-base">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                <p className="text-gray-400 text-xs md:text-sm">{selectedCustomer.email}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Monto a agregar (COP)</label>
                <input
                  type="number"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  placeholder="Ej: 10000"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                  min={1000}
                />
              </div>

              <button
                onClick={async () => {
                  const amount = parseInt(rechargeAmount);
                  if (!amount || amount < 1000) {
                    alert('El monto mínimo es $1,000');
                    return;
                  }
                  setRecharging(true);
                  try {
                    // Usar Cloud Function para cargar saldo (server-side)
                    const loadBalance = httpsCallable(functions, 'loadCustomerBalance');
                    const result = await loadBalance({
                      customerId: selectedCustomer.id,
                      amount: amount
                    });
                    
                    if (result.data.success) {
                      // Actualizar la lista de clientes
                      setCustomers(customers.map(c => 
                        c.id === selectedCustomer.id 
                          ? { ...c, balance: (c.balance || 0) + amount }
                          : c
                      ));
                      setSelectedCustomer(null);
                      setRechargeAmount('');
                      alert('Saldo cargado correctamente');
                    }
                  } catch (error) {
                    console.error('Error recargando:', error);
                    alert('Error al cargar saldo: ' + (error.message || 'Intente de nuevo'));
                  } finally {
                    setRecharging(false);
                  }
                }}
                disabled={recharging || !rechargeAmount}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {recharging ? 'Cargando...' : 'Confirmar Recarga'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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