import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { adminDb as db } from '../../services/firebase';
import { Crown, Shield, Search, Users, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

interface AppUser {
  uid: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'superadmin';
  createdAt?: any;
}

const Admins = (): JSX.Element => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'users'), orderBy('email'));
      const snapshot = await getDocs(q);
      
      const data: AppUser[] = [];
      snapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.role === 'admin' || userData.role === 'superadmin') {
          data.push({ 
            uid: doc.id, 
            email: userData.email || 'Sin email',
            tenantId: userData.tenantId || 'N/A',
            role: userData.role,
            createdAt: userData.createdAt
          });
        }
      });
      
      // Superadmins primero, luego admins, ambos ordenados por email
      const sorted = data.sort((a, b) => {
        if (a.role !== b.role) return a.role === 'superadmin' ? -1 : 1;
        return a.email.localeCompare(b.email);
      });
      
      setUsers(sorted);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return null;
    const date = timestamp?.toDate?.() || new Date(timestamp);
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const filteredUsers = users.filter(u => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      u.email.toLowerCase().includes(q) ||
      u.tenantId.toLowerCase().includes(q) ||
      u.role.includes(q) ||
      u.uid.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  const superadmins = filteredUsers.filter(u => u.role === 'superadmin');
  const admins = filteredUsers.filter(u => u.role === 'admin');

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">Administradores</h1>
          <p className="text-white/50 text-sm mt-1">{users.length} usuarios registrados</p>
        </div>
        <a
          href="https://console.firebase.google.com/u/0/project/ejstore-web/authentication/users"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center space-x-2 shrink-0"
        >
          <span>Nuevo Admin</span>
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
          placeholder="Buscar por email, tenant, rol..."
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all"
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

      {filteredUsers.length === 0 ? (
        <div className="text-center py-16 text-white/50">
          {searchTerm ? (
            <>
              <Search size={40} className="mx-auto mb-4 opacity-30" />
              <p>No se encontraron usuarios para "<span className="text-white/70">{searchTerm}</span>"</p>
              <button onClick={() => setSearchTerm('')} className="text-primary-400 hover:text-primary-300 text-sm mt-2">
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <>
              <Users size={40} className="mx-auto mb-4 opacity-30" />
              <p>No hay administradores registrados</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Superadmins */}
          {superadmins.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Crown size={18} className="text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">Superadmins</h2>
                <span className="text-white/30 text-sm">({superadmins.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {superadmins.map((user) => (
                  <UserCard key={user.uid} user={user} formatDate={formatDate} />
                ))}
              </div>
            </section>
          )}

          {/* Admins */}
          {admins.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-primary-400" />
                <h2 className="text-lg font-semibold text-white">Admins</h2>
                <span className="text-white/30 text-sm">({admins.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {admins.map((user) => (
                  <UserCard key={user.uid} user={user} formatDate={formatDate} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

const UserCard = ({ user, formatDate }: { user: AppUser; formatDate: (t: any) => string | null }) => {
  const createdDate = formatDate(user.createdAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-5 group hover:border-white/20 transition-all duration-300"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
          user.role === 'superadmin' 
            ? 'bg-gradient-to-br from-yellow-500 to-orange-600' 
            : 'bg-gradient-to-br from-primary-500 to-red-600'
        }`}>
          {user.role === 'superadmin' ? (
            <Crown size={22} className="text-white" />
          ) : (
            <Shield size={22} className="text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold truncate">{user.email}</h3>
          <p className="text-white/40 text-xs font-mono truncate">ID: {user.uid.slice(0, 12)}...</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/40 text-xs">Tenant</span>
          <span className="text-white/70 text-sm font-medium">{user.tenantId}</span>
        </div>
        {createdDate && (
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-xs">Creado</span>
            <span className="text-white/50 text-sm flex items-center gap-1">
              <Calendar size={12} />
              {createdDate}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
          user.role === 'superadmin' 
            ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' 
            : 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
        }`}>
          {user.role === 'superadmin' ? <Crown size={12} /> : <Shield size={12} />}
          {user.role === 'superadmin' ? 'Superadmin' : 'Admin'}
        </span>
      </div>
    </motion.div>
  );
};

export default Admins;