import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Upload, FileText, Loader, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useTenantStore } from '../../store/tenantStore';
import { createTicket } from '../../services/marketplace';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';

interface BulkPurchase {
  id: string;
  serviceId: string;
  serviceName: string;
}

const ResellerReportar = (): JSX.Element => {
  const { user, userTenantId } = useAuthStore();
  const { tenant } = useTenantStore();
  const tenantId = tenant?.id || userTenantId;
  const uid = user?.uid || '';

  const [purchases, setPurchases] = useState<BulkPurchase[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!uid) return;
      try {
        const q = query(
          collection(db, 'purchases'),
          where('customerId', '==', uid),
          where('type', '==', 'bulk'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const items: BulkPurchase[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            serviceId: data.serviceId || '',
            serviceName: data.serviceName || '',
          };
        });
        // Deduplicate by serviceId
        const seen = new Set<string>();
        const unique = items.filter((p) => {
          if (seen.has(p.serviceId)) return false;
          seen.add(p.serviceId);
          return true;
        });
        setPurchases(unique);
      } catch (err) {
        console.error('Error loading purchases:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  const serviceName = purchases.find((p) => p.serviceId === serviceId)?.serviceName || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !tenantId) return;
    if (!serviceId || !subject || !description) {
      setError('Completá todos los campos obligatorios');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createTicket({
        tenantId,
        userId: uid,
        userType: 'reseller',
        serviceId,
        serviceName,
        subject,
        description,
        status: 'open',
      });
      setSuccess(true);
      setServiceId('');
      setSubject('');
      setDescription('');
      setFileName(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar reporte';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center"
      >
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
          <Check size={32} className="text-green-400" />
        </div>
        <p className="text-white font-medium text-lg">Reporte enviado</p>
        <p className="text-white/50 text-sm mt-1">El admin de tu tienda te responderá a la brevedad.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 px-4 py-2 bg-white/10 text-white/70 hover:text-white rounded-lg transition-all text-sm"
        >
          Enviar otro reporte
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl"
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Reportar un Problema</h2>
        <p className="text-gray-400 text-sm mt-1">
          Reportá un problema con los servicios que compraste y el admin te ayudará.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-1">Servicio *</label>
          {loading ? (
            <div className="input-field w-full text-white/50">Cargando servicios...</div>
          ) : (
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="input-field w-full"
              required
            >
              <option value="">Seleccioná un servicio</option>
              {purchases.map((p) => (
                <option key={p.id} value={p.serviceId}>
                  {p.serviceName}
                </option>
              ))}
            </select>
          )}
          {!loading && purchases.length === 0 && (
            <p className="text-yellow-400/70 text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={12} />
              No tenés compras realizadas. Primero comprá en el catálogo mayorista.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Asunto *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input-field w-full"
            placeholder="Ej: Una cuenta no funciona"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Descripción *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field w-full min-h-[120px] resize-y"
            placeholder="Describí el problema en detalle..."
            required
          />
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">
            Imagen (opcional)
          </label>
          <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/20 cursor-pointer transition-all">
            <Upload size={16} />
            <span className="text-sm">{fileName || 'Subir imagen'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          {fileName && (
            <p className="text-white/40 text-xs mt-1 flex items-center gap-1">
              <FileText size={12} />
              {fileName}
            </p>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || purchases.length === 0}
          className="flex items-center justify-center gap-2 w-full py-3 text-white font-semibold rounded-lg transition-all duration-300 disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, #E50914, #E50914dd)`,
          }}
        >
          {submitting ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send size={16} />
              Enviar reporte
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
};

export default ResellerReportar;
