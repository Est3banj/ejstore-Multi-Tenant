import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Upload, Loader, Check, AlertCircle, Search, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useApp } from '../../context/AppContext';
import { createTicket } from '../../services/marketplace';
import { uploadImage } from '../../services/storage';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { Purchase } from '../../types/marketplace';

interface ReportarProps {
  purchases: Purchase[];
  selectedServiceId?: string | null;
}

const DOMINIOS = [
  '@gmail.com', '@hotmail.com', '@outlook.com', '@yahoo.com',
  '@icloud.com', '@live.com', '@msn.com', '@yahoo.es', '@hotmail.es',
];

const Reportar = ({ purchases, selectedServiceId }: ReportarProps) => {
  const { customer } = useAuthStore();
  const { userTenantId, tenant } = useApp();
  const tenantId = tenant?.id || userTenantId;
  const uid = customer?.uid || '';

  const [serviceId, setServiceId] = useState(selectedServiceId || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Email + ID Ticket (igual que el distribuidor)
  const [searchEmail, setSearchEmail] = useState('');
  const [foundEmails, setFoundEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [searchingEmail, setSearchingEmail] = useState(false);
  const [purchaseId, setPurchaseId] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const activePurchases = purchases.filter((p) => p.status === 'active');
  const serviceName = purchases.find((p) => p.serviceId === serviceId)?.serviceName || '';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Autocomplete emails
  useEffect(() => {
    if (!uid || !searchEmail.trim() || selectedEmail) { setFoundEmails([]); return; }
    const timer = setTimeout(async () => {
      if (searchEmail.trim().length < 3) return;
      setSearchingEmail(true);
      try {
        const q = query(
          collection(db, 'purchases'),
          where('customerId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snapshot = await getDocs(q);
        const emails = new Set<string>();
        snapshot.docs.forEach((doc) => {
          const email = doc.data().customerEmail || '';
          if (email.toLowerCase().includes(searchEmail.toLowerCase())) emails.add(email);
        });
        setFoundEmails(Array.from(emails).slice(0, 8));
        setShowResults(true);
      } catch { /* silent */ } finally { setSearchingEmail(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchEmail, uid, selectedEmail]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !tenantId) return;
    const emailFinal = selectedEmail || searchEmail.trim();
    if (!emailFinal || !serviceId || !subject || !description) {
      setError('Completá todos los campos obligatorios');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        try {
          const path = `tickets/${Date.now()}_${imageFile.name}`;
          imageUrl = await uploadImage(imageFile, path);
        } catch { setError('Error al subir la imagen, pero el reporte se enviará sin ella'); }
      }

      await createTicket({
        tenantId,
        userId: uid,
        userType: 'customer',
        serviceId,
        serviceName,
        subject,
        description,
        customerEmail: emailFinal,
        purchaseId: purchaseId || undefined,
        imageUrl,
        status: 'open',
      });
      setSuccess(true);
      handleClear();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar reporte';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setServiceId('');
    setSubject('');
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
    setSearchEmail('');
    setSelectedEmail('');
    setPurchaseId('');
    setError('');
  };

  if (success) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
          <Check size={32} className="text-green-400" />
        </div>
        <p className="text-white font-medium text-lg">Reporte enviado</p>
        <p className="text-gray-400 text-sm mt-1">Te responderemos a la brevedad.</p>
        <button onClick={() => setSuccess(false)}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all text-sm">
          Enviar otro reporte
        </button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Reportar un Problema</h2>
        </div>

        {error && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Email del servicio */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">
              Email del servicio <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-500" />
              </div>
              <input type="email" value={selectedEmail || searchEmail}
                onChange={(e) => { setSearchEmail(e.target.value); setSelectedEmail(''); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                className="input-field pl-10 pr-10" placeholder="netflix1@gmail.com" required />
              {(selectedEmail || searchEmail) && (
                <button type="button" onClick={() => { setSearchEmail(''); setSelectedEmail(''); setFoundEmails([]); }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>
            <AnimatePresence>
              {showResults && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {searchingEmail ? (
                    <div className="px-4 py-3 text-gray-400 text-sm flex items-center gap-2">
                      <Loader size={14} className="animate-spin" /> Buscando...
                    </div>
                  ) : foundEmails.length > 0 ? (
                    foundEmails.map((email) => (
                      <button key={email} type="button"
                        onClick={() => { setSelectedEmail(email); setSearchEmail(email); setShowResults(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-gray-700/50 last:border-0">
                        {email}
                      </button>
                    ))
                  ) : null}
                  {searchEmail.includes('@') && !selectedEmail && (
                    <div>
                      {foundEmails.length > 0 && (
                        <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-medium border-b border-gray-700/50">Dominios</div>
                      )}
                      {(() => {
                        const localPart = searchEmail.split('@')[0] || '';
                        const typedDomain = searchEmail.split('@')[1] || '';
                        return DOMINIOS.filter((d) => d.toLowerCase().includes(typedDomain.toLowerCase())).map((domain) => {
                          const full = `${localPart}${domain}`;
                          return (
                            <button key={domain} type="button"
                              onClick={() => { setSelectedEmail(full); setSearchEmail(full); setShowResults(false); }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors font-mono">
                              {full}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                  {!searchingEmail && foundEmails.length === 0 && !searchEmail.includes('@') && (
                    <div className="px-4 py-3 text-gray-500 text-sm">Escribí el email del servicio</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ID Ticket */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">
              ID Ticket <span className="text-gray-500">(opcional)</span>
            </label>
            <input type="text" value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}
              className="input-field font-mono text-sm" placeholder="Ej: TKT-ABC123-1" />
          </div>

          {/* Servicio */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">
              Servicio <span className="text-red-400">*</span>
            </label>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="input-field" required>
              <option value="" className="bg-gray-800 text-gray-400">Seleccioná un servicio</option>
              {activePurchases.map((p) => (
                <option key={p.id} value={p.serviceId} className="bg-gray-800 text-white">{p.serviceName}</option>
              ))}
            </select>
            {activePurchases.length === 0 && (
              <p className="text-yellow-400/70 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> No tenés servicios activos para reportar
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Asunto <span className="text-red-400">*</span></label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="input-field" placeholder="Ej: No puedo acceder al servicio" required />
          </div>

          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Descripción <span className="text-red-400">*</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[120px] resize-y" placeholder="Describí el problema en detalle..." required />
          </div>

          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Imagen (opcional)</label>
            <label className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all">
              <Upload size={16} />
              <span className="text-sm">{imageFile ? imageFile.name : 'Subir imagen'}</span>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
            {imagePreview && (
              <div className="mt-2 relative inline-block">
                <img src={imagePreview} alt="Preview" className="rounded-lg max-h-32 object-contain bg-gray-900" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 p-0.5 bg-red-500 rounded-full text-white">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting || activePurchases.length === 0}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? <><Loader size={16} className="animate-spin" /> Enviando...</> : <><Send size={16} /> Enviar reporte</>}
            </button>
            <button type="button" onClick={handleClear} disabled={submitting}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all disabled:opacity-50">
              Limpiar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Reportar;
