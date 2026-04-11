import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Loader2, Crown, Shield } from 'lucide-react';
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
      
      setUsers(data);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
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
        <h1 className="text-4xl font-bold gradient-text">Administradores</h1>
        <a
          href="https://console.firebase.google.com/u/0/project/ejstore-web/authentication/users"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center space-x-2"
        >
          <span>Nuevo Admin</span>
        </a>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="text-center py-12 text-white/50">
          <p>No hay administradores</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((user) => (
            <motion.div
              key={user.uid}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl p-5"
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  user.role === 'superadmin' 
                    ? 'bg-gradient-to-br from-yellow-500 to-orange-600' 
                    : 'bg-gradient-to-br from-primary-500 to-red-600'
                }`}>
                  {user.role === 'superadmin' ? (
                    <Crown size={24} className="text-white" />
                  ) : (
                    <Shield size={24} className="text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-white font-semibold">{user.email}</h3>
                  <p className="text-white/50 text-sm">
                    Tenant: <span className="text-primary-400">{user.tenantId}</span>
                  </p>
                </div>
              </div>

              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                user.role === 'superadmin' 
                  ? 'bg-yellow-500/20 text-yellow-400' 
                  : 'bg-primary-500/20 text-primary-400'
              }`}>
                {user.role === 'superadmin' ? 'Superadmin' : 'Admin'}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Admins;