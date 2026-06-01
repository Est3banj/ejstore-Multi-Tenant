import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  primaryColor?: string;
  whatsappNumber?: string;
  contactEmail?: string;
}

const Tenants = (): JSX.Element => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'tenants'), orderBy('name'));
      const snapshot = await getDocs(q);
      
      const data: Tenant[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Tenant);
      });
      
      setTenants(data);
    } catch (err) {
      console.error('Error loading tenants:', err);
      setError('Error al cargar tiendas');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tenantId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tienda?')) return;
    
    try {
      await deleteDoc(doc(db, 'tenants', tenantId));
      setTenants(tenants.filter(t => t.id !== tenantId));
    } catch (err) {
      console.error('Error deleting tenant:', err);
      setError('Error al eliminar');
    }
  };

  const openTenant = (subdomain: string) => {
    window.open(`/?v=${subdomain}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold gradient-text">Gestión de Tiendas</h1>
        <a
          href="https://console.firebase.google.com/u/0/project/ejstore-web/firestore/data/~2Ftenants"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Nueva Tienda</span>
        </a>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {tenants.length === 0 ? (
        <div className="text-center py-12 text-white/50">
          <p>No hay tiendas creadas</p>
          <p className="text-sm">Crea la primera desde Firebase Console</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl overflow-hidden"
            >
              <div 
                className="h-40 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${tenant.primaryColor || '#6366f1'}20, ${tenant.primaryColor || '#6366f1'}05)` }}
              >
                <span className="text-6xl font-bold" style={{ color: tenant.primaryColor || '#6366f1' }}>
                  {tenant.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="p-5">
                <h3 className="text-xl font-bold mb-2 text-white">{tenant.name}</h3>
                <p className="text-white/70 text-sm mb-2">/{tenant.subdomain}</p>
                {tenant.whatsappNumber && (
                  <p className="text-white/50 text-sm">📱 {tenant.whatsappNumber}</p>
                )}
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => openTenant(tenant.subdomain)}
                    className="flex items-center space-x-1 text-primary-400 hover:text-primary-300"
                  >
                    <ExternalLink size={16} />
                    <span className="text-sm">Ver tienda</span>
                  </button>
                  <button
                    onClick={() => handleDelete(tenant.id)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tenants;