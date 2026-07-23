import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Upload, FileText, Loader, Check, AlertCircle, Search, X } from 'lucide-react';
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

  // Email auto-search
  const [searchEmail, setSearchEmail] = useState('');
  const [foundEmails, setFoundEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [searchingEmail, setSearchingEmail] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // Auto-search emails in purchases
  useEffect(() => {
    if (!uid || !searchEmail.trim() || selectedEmail) {
      setFoundEmails([]);
      return;
    }

    const timer = setTimeout(async () => {
      if (searchEmail.trim().length < 3) return;
      setSearchingEmail(true);
      try {
        const q = query(
          collection(db, 'purchases'),
          where('resellerId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snapshot = await getDocs(q);
        const emails = new Set<string>();
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const email = data.customerEmail || '';
          if (email.toLowerCase().includes(searchEmail.toLowerCase())) {
            emails.add(email);
          }
        });
        setFoundEmails(Array.from(emails).slice(0, 10));
        setShowResults(true);
      } catch {
        // silent fail — search is a bonus feature
      } finally {
        setSearchingEmail(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchEmail, uid, selectedEmail]);

  // Close search results on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
        customerEmail: selectedEmail || undefined,
        status: 'open',
      });
      setSuccess(true);
      setServiceId('');
      setSubject('');
      setDescription('');
      setFileName(null);
      setSearchEmail('');
      setSelectedEmail('');
      setFoundEmails([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar reporte';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
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
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all text-sm"
          >
            Enviar otro reporte
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Hero */}
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reportar un Problema</h1>
        <p className="text-gray-400 text-sm mt-1">
          Reportá un problema con los servicios que compraste y el admin te ayudará.
        </p>
      </section>

      {/* Panel */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Detalles del reporte</h2>
        </div>

        {/* Status bar */}
        {error && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Email auto-search */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">
              Email del cliente (opcional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-500" />
              </div>
              <input
                type="email"
                value={selectedEmail || searchEmail}
                onChange={(e) => {
                  setSearchEmail(e.target.value);
                  setSelectedEmail('');
                  setShowResults(true);
                }}
                onFocus={() => foundEmails.length > 0 && setShowResults(true)}
                className="input-field pl-10 pr-10"
                placeholder="cliente@ejemplo.com"
              />
              {(selectedEmail || searchEmail) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchEmail('');
                    setSelectedEmail('');
                    setFoundEmails([]);
                  }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Dropdown results */}
            <AnimatePresence>
              {showResults && (foundEmails.length > 0 || searchingEmail) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                >
                  {searchingEmail ? (
                    <div className="px-4 py-3 text-gray-400 text-sm flex items-center gap-2">
                      <Loader size={14} className="animate-spin" />
                      Buscando...
                    </div>
                  ) : (
                    foundEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => {
                          setSelectedEmail(email);
                          setSearchEmail(email);
                          setShowResults(false);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        {email}
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {selectedEmail && (
              <p className="text-green-400 text-xs mt-1.5 flex items-center gap-1">
                <Check size={12} />
                Cliente seleccionado: {selectedEmail}
              </p>
            )}
          </div>

          {/* Servicio */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Servicio *</label>
            {loading ? (
              <div className="input-field text-gray-400">Cargando servicios...</div>
            ) : (
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="input-field"
                required
              >
                <option value="" className="bg-gray-800 text-gray-400">Seleccioná un servicio</option>
                {purchases.map((p) => (
                  <option key={p.id} value={p.serviceId} className="bg-gray-800 text-white">
                    {p.serviceName}
                  </option>
                ))}
              </select>
            )}
            {!loading && purchases.length === 0 && (
              <p className="text-yellow-400/70 text-xs mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} />
                No tenés compras realizadas. Primero comprá en el catálogo mayorista.
              </p>
            )}
          </div>

          {/* Asunto */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Asunto *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-field"
              placeholder="Ej: Una cuenta no funciona"
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Descripción *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[120px] resize-y"
              placeholder="Describí el problema en detalle..."
              required
            />
          </div>

          {/* Imagen */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">
              Imagen (opcional)
            </label>
            <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all">
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
              <p className="text-gray-400 text-xs mt-1.5 flex items-center gap-1">
                <FileText size={12} />
                {fileName}
              </p>
            )}
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || purchases.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Enviar reporte
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResellerReportar;
