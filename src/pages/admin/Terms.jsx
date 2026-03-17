import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getTerms, updateTerms } from '../../services/firestore';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';

const Terms = () => {
  const { refreshTerms, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadTerms();
    }
  }, [tenantId]);

  const loadTerms = async () => {
    if (!tenantId) return;
    try {
      const termsData = await getTerms(tenantId);
      setContent(termsData);
    } catch (error) {
      console.error('Error loading terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateTerms(tenantId, content);
      await refreshTerms();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving terms:', error);
      alert('Error al guardar los términos y condiciones');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold gradient-text">Términos y Condiciones</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center space-x-2"
        >
          <Save size={20} />
          <span>{saving ? 'Guardando...' : 'Guardar'}</span>
        </button>
      </div>

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg mb-6"
        >
          Términos y condiciones guardados exitosamente
        </motion.div>
      )}

      <div className="glass p-6 rounded-xl">
        <label className="block text-white/70 mb-4">
          Contenido (Texto Plano)
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="input-field min-h-[500px] font-mono whitespace-pre-wrap"
          placeholder="Escribe aquí los términos y condiciones. Se mostrarán tal cual los escribas."
        />
        <p className="text-white/50 text-sm mt-4">
          El texto se mostrará respetando los espacios y saltos de línea que escribas aquí.
        </p>
      </div>

      <div className="mt-8 glass p-6 rounded-xl">
        <h2 className="text-2xl font-bold mb-4 text-white">Vista Previa</h2>
        <div className="bg-slate-800 p-6 rounded-lg">
          <div className="text-white/80 whitespace-pre-wrap">
            {content || 'No hay contenido aún...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;

