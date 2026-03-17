import { useApp } from '../../context/AppContext';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Tag, Image, Settings } from 'lucide-react';

const Dashboard = () => {
  const { services, banners, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const [allServices, setAllServices] = useState([]);
  const [stats, setStats] = useState({
    totalServices: 0,
    activeServices: 0,
    totalBanners: 0,
    activeBanners: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!effectiveTenantId) return;
      try {
        const { getAllServices } = await import('../../services/firestore');
        const all = await getAllServices(effectiveTenantId);
        setAllServices(all);
        setStats({
          totalServices: all.length,
          activeServices: all.filter(s => s.active).length,
          totalBanners: banners.length,
          activeBanners: banners.filter(b => b.active).length
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    };

    loadStats();
  }, [effectiveTenantId, banners]);

  const statCards = [
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
      title: 'Banners Totales',
      value: stats.totalBanners,
      icon: Image,
      color: 'from-primary-600 to-red-700'
    },
    {
      title: 'Banners Activos',
      value: stats.activeBanners,
      icon: Settings,
      color: 'from-orange-500 to-primary-500'
    }
  ];

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 gradient-text">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`glass rounded-xl p-6 bg-gradient-to-br ${stat.color} relative overflow-hidden`}
          >
            <div className="relative z-10">
              <stat.icon className="text-white/80 mb-4" size={32} />
              <h3 className="text-white/80 text-sm font-semibold mb-2">{stat.title}</h3>
              <p className="text-4xl font-bold text-white">{stat.value}</p>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
          </motion.div>
        ))}
      </div>

      <div className="glass p-6 rounded-xl">
        <h2 className="text-2xl font-bold mb-4 text-white">Bienvenido al Panel de Administración</h2>
        <p className="text-white/70">
          Desde aquí puedes gestionar todos los servicios, banners, términos y condiciones, y configuración general de la plataforma.
        </p>
      </div>
    </div>
  );
};

export default Dashboard;

