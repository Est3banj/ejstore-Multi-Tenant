import { useState, useEffect } from 'react';
import { collection, getDocs, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Loader2, Crown, Shield } from 'lucide-react';

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
        // Solo mostrar admins
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Administradores</h1>
        <a
          href="https://console.firebase.google.com/u/0/project/ejstore-web/authentication/users"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
        >
          <span>Agregar Admin</span>
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
        <div className="space-y-4">
          {users.map((user) => (
            <div
              key={user.uid}
              className="glass-dark rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
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

              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.role === 'superadmin' 
                  ? 'bg-yellow-500/20 text-yellow-400' 
                  : 'bg-primary-500/20 text-primary-400'
              }`}>
                {user.role === 'superadmin' ? 'Superadmin' : 'Admin'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Admins;