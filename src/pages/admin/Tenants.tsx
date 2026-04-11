import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react';

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Tiendas</h1>
        <a
          href="https://console.firebase.google.com/project/ejstore-web/firestore/data/tenants"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
        >
          <Plus size={20} />
          <span>Agregar Tienda</span>
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
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div
              key={tenant.id}
              className="glass-dark rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center space-x-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: tenant.primaryColor || '#6366f1' }}
                >
                  {tenant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{tenant.name}</h3>
                  <p className="text-white/50 text-sm">{tenant.subdomain}</p>
                  {tenant.whatsappNumber && (
                    <p className="text-white/30 text-xs">📱 {tenant.whatsappNumber}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => openTenant(tenant.subdomain)}
                  className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Abrir tienda"
                >
                  <ExternalLink size={20} />
                </button>
                <button
                  onClick={() => handleDelete(tenant.id)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tenants;