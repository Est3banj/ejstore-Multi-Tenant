import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Plus, Trash2, ExternalLink, Loader2, Star, Search, Store } from 'lucide-react';
import { motion } from 'framer-motion';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  logoUrl?: string;
  primaryColor?: string;
  whatsappNumber?: string;
  contactEmail?: string;
  isFeatured?: boolean;
}

const Tenants = (): JSX.Element => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

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

  const openTenant = (tenantId: string) => {
    window.open(`/?v=${tenantId}`, '_blank');
  };

  const toggleFeatured = async (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const newVal = !tenant.isFeatured;

    setTenants(prev => prev.map(t =>
      t.id === tenantId ? { ...t, isFeatured: newVal } : t
    ));
    setTogglingIds(prev => [...prev, tenantId]);

    try {
      await updateDoc(doc(db, 'tenants', tenantId), { isFeatured: newVal });
    } catch (err) {
      console.error('Error toggling featured:', err);
      setTenants(prev => prev.map(t =>
        t.id === tenantId ? { ...t, isFeatured: !newVal } : t
      ));
      setError('Error al actualizar tienda destacada');
    } finally {
      setTogglingIds(prev => prev.filter(id => id !== tenantId));
    }
  };

  const filteredTenants = tenants.filter(t => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      t.name.toLowerCase().includes(q) ||
      t.subdomain.toLowerCase().includes(q) ||
      (t.whatsappNumber || '').replace(/[\s\+]/g, '').includes(q.replace(/[\s\+]/g, '')) ||
      (t.contactEmail || '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.isFeatured && 'destacada'.includes(q))
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-500" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-4xl font-bold gradient-text">Gestión de Tiendas</h1>
        <a
          href="https://console.firebase.google.com/u/0/project/ejstore-web/firestore/data/~2Ftenants"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center space-x-2 shrink-0"
        >
          <Plus size={20} />
          <span>Nueva Tienda</span>
        </a>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Buscador */}
      <div className="relative mb-6 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar tienda por nombre, subdominio, teléfono..."
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50"
          >
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-primary-500" size={40} />
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="text-center py-12 text-white/50">
          {searchTerm ? (
            <>
              <Search size={40} className="mx-auto mb-4 opacity-30" />
              <p>No se encontraron tiendas para "<span className="text-white/70">{searchTerm}</span>"</p>
              <button onClick={() => setSearchTerm('')} className="text-primary-400 hover:text-primary-300 text-sm mt-2">
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <>
              <Store size={40} className="mx-auto mb-4 opacity-30" />
              <p>No hay tiendas creadas</p>
              <p className="text-sm mt-1">Crea la primera desde Firebase Console</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="text-sm text-white/40 mb-4">
            {filteredTenants.length} de {tenants.length} tiendas
            {searchTerm && ` (filtradas)`}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTenants.map((tenant) => (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl overflow-hidden group"
              >
                {/* Header con logo */}
                <div 
                  className="h-36 flex items-center justify-center relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${tenant.primaryColor || '#6366f1'}25, ${tenant.primaryColor || '#6366f1'}08)` }}
                >
                  {tenant.logoUrl ? (
                    <img
                      src={tenant.logoUrl}
                      alt={tenant.name}
                      className="w-20 h-20 object-contain rounded-xl drop-shadow-lg"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl flex items-center justify-center" style={{ background: `${tenant.primaryColor || '#6366f1'}30` }}>
                      <span className="text-4xl font-bold" style={{ color: tenant.primaryColor || '#6366f1' }}>
                        {tenant.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Badge destacado */}
                  {tenant.isFeatured && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-xs font-medium flex items-center gap-1">
                      <Star size={12} className="fill-amber-400" />
                      Destacada
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-5">
                  <h3 className="text-xl font-bold text-white mb-1 truncate">{tenant.name}</h3>
                  <p className="text-primary-400 text-sm mb-3 font-mono">/{tenant.subdomain}</p>

                  <div className="space-y-1.5 mb-4">
                    {tenant.whatsappNumber && (
                      <p className="text-white/60 text-sm flex items-center gap-2">
                        <span className="text-white/30">📱</span>
                        {tenant.whatsappNumber}
                      </p>
                    )}
                    {tenant.contactEmail && (
                      <p className="text-white/60 text-sm flex items-center gap-2 truncate">
                        <span className="text-white/30">✉️</span>
                        {tenant.contactEmail}
                      </p>
                    )}
                    {tenant.id && (
                      <p className="text-white/30 text-xs flex items-center gap-2 font-mono truncate">
                        <span className="text-white/20">ID:</span>
                        {tenant.id}
                      </p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleFeatured(tenant.id)}
                        disabled={togglingIds.includes(tenant.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          tenant.isFeatured
                            ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                            : 'text-white/30 hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                        title={tenant.isFeatured ? 'Quitar destacado' : 'Destacar tienda'}
                      >
                        <Star
                          size={18}
                          className={tenant.isFeatured ? 'fill-amber-400' : ''}
                        />
                      </button>
                      <button
                        onClick={() => openTenant(tenant.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded-lg transition-colors"
                      >
                        <ExternalLink size={16} />
                        Ver tienda
                      </button>
                    </div>
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
        </>
      )}
    </div>
  );
};

export default Tenants;