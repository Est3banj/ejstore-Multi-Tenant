import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Upload, FileText, Loader, Check } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useApp } from '../../context/AppContext';
import { createTicket } from '../../services/marketplace';
import type { Purchase } from '../../types/marketplace';

interface ReportarProps {
  purchases: Purchase[];
  selectedServiceId?: string | null;
}

const Reportar = ({ purchases, selectedServiceId }: ReportarProps) => {
  const { customer } = useAuthStore();
  const { userTenantId, tenant } = useApp();
  const tenantId = tenant?.id || userTenantId;

  const [serviceId, setServiceId] = useState(selectedServiceId || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const serviceName = purchases.find((p) => p.serviceId === serviceId)?.serviceName || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !tenantId) return;
    if (!serviceId || !subject || !description) {
      setError('Completá todos los campos obligatorios');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createTicket({
        tenantId,
        userId: customer.uid,
        userType: 'customer',
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
        className="glass p-12 text-center"
      >
        <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4">
          <Check size={32} className="text-green-400" />
        </div>
        <p className="text-white font-medium text-lg">Reporte enviado</p>
        <p className="text-white/50 text-sm mt-1">Te responderemos a la brevedad.</p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 px-4 py-2 bg-white/10 text-white/70 hover:text-white rounded-lg transition-all text-sm"
        >
          Enviar otro reporte
        </button>
      </motion.div>
    );
  }

  const activePurchases = purchases.filter((p) => p.status === 'active');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-xl"
    >
      <p className="text-white/60 text-sm mb-4">
        Reportá un problema con tu servicio y te ayudaremos a resolverlo.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-white/70 mb-1">Servicio *</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="input-field w-full"
            required
          >
            <option value="">Seleccioná un servicio</option>
            {activePurchases.map((p) => (
              <option key={p.id} value={p.serviceId}>
                {p.serviceName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-white/70 mb-1">Asunto *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input-field w-full"
            placeholder="Ej: No puedo acceder al servicio"
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
          disabled={submitting}
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

export default Reportar;
