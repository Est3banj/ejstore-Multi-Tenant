import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getSettings, updateSettings } from '../../services/firestore';
import { uploadImage } from '../../services/storage';
import { validateImageUrl } from '../../utils/validation';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { Save, Upload, AlertCircle, CheckCircle2, Webhook, Loader2 } from 'lucide-react';

const Settings = () => {
  const { refreshSettings, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [formData, setFormData] = useState({
    siteName: 'Mi Tienda',
    logo: '',
    logoUrlInput: '',
    whatsappNumber: '',
    contactEmail: '',
    primaryColor: '#E50914',
    secondaryColor: '#1A1A1A',
    qrImage: '',
    brebKey: '',
    brebBankName: '',
    discordWebhookUrl: ''
  });
  const [logoFile, setLogoFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [urlValidation, setUrlValidation] = useState({ isValid: true, error: '', warning: '' });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message }

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  const loadSettings = async () => {
    if (!tenantId) return;
    try {
      const settingsData = await getSettings(tenantId);
      const { logoUrlInput, ...restSettings } = settingsData || {};
      setFormData({
        siteName: 'Mi Tienda',
        logo: '',
        logoUrlInput: '',
        whatsappNumber: '',
        contactEmail: '',
        primaryColor: '#E50914',
        secondaryColor: '#1A1A1A',
        ...restSettings
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
    }
  };

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setFormData({ ...formData, logoUrlInput: url });

    if (url.trim()) {
      const validation = validateImageUrl(url);
      setUrlValidation(validation);
    } else {
      setUrlValidation({ isValid: true, error: '', warning: '' });
    }
  };

  const handleSave = async () => {
    // Validate URL if provided
    if (formData.logoUrlInput && !urlValidation.isValid) {
      alert('Por favor, corrija la URL del logo antes de continuar');
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      let logoUrl = formData.logo;

      // Priority: URL input > File upload > Existing URL
      if (formData.logoUrlInput && formData.logoUrlInput.trim()) {
        logoUrl = formData.logoUrlInput.trim();
      } else if (logoFile) {
        const path = `settings/logo_${Date.now()}_${logoFile.name}`;
        logoUrl = await uploadImage(logoFile, path);
      }

      const settingsData = {
        ...formData,
        logo: logoUrl
      };
      delete settingsData.logoUrlInput;

      await updateSettings(tenantId, settingsData);
      await refreshSettings();
      await loadSettings(); // Recargar desde Firestore
      setSaved(true);
      setLogoFile(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!formData.discordWebhookUrl?.trim()) {
      alert('Primero ingresa una URL de webhook de Discord');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const testWebhook = httpsCallable(functions, 'testDiscordWebhook');
      const result = await testWebhook({ webhookUrl: formData.discordWebhookUrl.trim() });
      setTestResult({ success: true, message: result.data.message });
    } catch (error) {
      setTestResult({ success: false, message: error.message || 'Error al probar el webhook' });
    } finally {
      setTestLoading(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold gradient-text">Configuración General</h1>
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
          Configuración guardada exitosamente
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass p-6 rounded-xl space-y-6">
          <div>
            <label className="block text-white/70 mb-2">Nombre del Sitio</label>
            <input
              type="text"
              value={formData.siteName}
              onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
              className="input-field"
              placeholder="Mi Tienda"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 mb-2">Color Primario</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.primaryColor || '#E50914'}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-12 h-12 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.primaryColor || '#E50914'}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="input-field flex-1"
                  placeholder="#E50914"
                />
              </div>
            </div>
            <div>
              <label className="block text-white/70 mb-2">Color Secundario</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={formData.secondaryColor || '#1A1A1A'}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-12 h-12 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.secondaryColor || '#1A1A1A'}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="input-field flex-1"
                  placeholder="#1A1A1A"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Logo del Sitio</label>

            {/* URL Input */}
            <div className="mb-4">
              <label className="block text-white/50 text-sm mb-2">URL del Logo (Recomendado)</label>
              <input
                type="url"
                value={formData.logoUrlInput}
                onChange={handleUrlChange}
                className="input-field"
                placeholder="https://ejemplo.com/logo.png"
              />
              {formData.logoUrlInput && (
                <div className="mt-2">
                  {urlValidation.isValid ? (
                    <div className="flex items-center space-x-2 text-green-400 text-sm">
                      <CheckCircle2 size={16} />
                      <span>URL válida</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-red-400 text-sm">
                      <AlertCircle size={16} />
                      <span>{urlValidation.error}</span>
                    </div>
                  )}
                  {urlValidation.warning && (
                    <div className="flex items-center space-x-2 text-yellow-400 text-sm mt-1">
                      <AlertCircle size={16} />
                      <span>{urlValidation.warning}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Current Logo Preview */}
            {(formData.logoUrlInput || formData.logo) && !logoFile && (
              <div className="mb-4">
                <p className="text-white/50 text-sm mb-2">Vista previa:</p>
                <img
                  src={formData.logoUrlInput || formData.logo}
                  alt="Logo preview"
                  className="h-20 w-auto rounded-lg"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* File Upload Preview */}
            {logoFile && (
              <div className="mb-4">
                <p className="text-white/50 text-sm mb-2">Nuevo logo seleccionado:</p>
                <img
                  src={URL.createObjectURL(logoFile)}
                  alt="Preview"
                  className="h-20 w-auto rounded-lg"
                />
                {formData.logoUrlInput && (
                  <p className="text-yellow-400 text-xs mt-2">
                    ⚠️ La URL tiene prioridad sobre el archivo
                  </p>
                )}
              </div>
            )}

            {/* File Upload Button */}
            <label className="btn-secondary inline-flex items-center space-x-2 cursor-pointer">
              <Upload size={20} />
              <span>O subir logo desde dispositivo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Número de WhatsApp</label>
            <input
              type="text"
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              className="input-field"
              placeholder="+57 300 123 4567"
            />
            <p className="text-white/50 text-sm mt-2">
              Este número se usará para redirigir a los usuarios cuando compren un servicio.
            </p>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Email de Contacto</label>
            <input
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              className="input-field"
              placeholder="contacto@ejstore.com"
            />
          </div>

          <div>
            <label className="block text-white/70 mb-2">URL de Imagen QR (Recargas)</label>
            <input
              type="url"
              value={formData.qrImage || ''}
              onChange={(e) => setFormData({ ...formData, qrImage: e.target.value })}
              className="input-field"
              placeholder="https://ejemplo.com/qr-recarga.png"
            />
            <p className="text-white/50 text-sm mt-2">
              Imagen QR que se mostrará en el modal de recarga. Sube la imagen a Storage y pega la URL aquí.
            </p>
            {formData.qrImage && (
              <div className="mt-2">
                <img src={formData.qrImage} alt="QR Preview" className="w-24 h-24 rounded-lg border border-white/20" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-white/70 mb-2">Clave BRE-B</label>
            <input
              type="text"
              value={formData.brebKey || ''}
              onChange={(e) => setFormData({ ...formData, brebKey: e.target.value })}
              className="input-field"
              placeholder="0035443571"
            />
            <p className="text-white/50 text-sm mt-2">
              Clave BRE-B para transferencias. Se mostrará en el modal de recarga de saldo.
            </p>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Nombre del Banco (BRE-B)</label>
            <input
              type="text"
              value={formData.brebBankName || ''}
              onChange={(e) => setFormData({ ...formData, brebBankName: e.target.value })}
              className="input-field"
              placeholder="GIO TECH"
            />
            <p className="text-white/50 text-sm mt-2">
              Nombre que aparecerá junto a BRE-B en las transferencias.
            </p>
          </div>

          {/* ========== DISCORD WEBHOOK ========== */}
          <div className="border-t border-white/10 pt-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Webhook className="w-5 h-5 text-indigo-400" />
              Notificaciones por Discord
            </h3>

            <div>
              <label className="block text-white/70 mb-2">URL del Webhook de Discord</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={formData.discordWebhookUrl || ''}
                  onChange={(e) => setFormData({ ...formData, discordWebhookUrl: e.target.value })}
                  className="input-field flex-1"
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <button
                  onClick={handleTestWebhook}
                  disabled={testLoading || !formData.discordWebhookUrl?.trim()}
                  className="btn-secondary flex items-center gap-2 px-4 whitespace-nowrap"
                >
                  {testLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Webhook className="w-4 h-4" />
                  )}
                  <span>Probar</span>
                </button>
              </div>

              {/* Test result feedback */}
              {testResult && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 px-3 py-2 rounded-lg text-sm ${
                    testResult.success
                      ? 'bg-green-500/20 border border-green-500/50 text-green-200'
                      : 'bg-red-500/20 border border-red-500/50 text-red-200'
                  }`}
                >
                  {testResult.success ? '✅ ' : '❌ '}
                  {testResult.message}
                </motion.div>
              )}

              <p className="text-white/50 text-sm mt-2">
                Configura un webhook de Discord para recibir notificaciones de recargas y premios de tu tienda.
                Crea un webhook en un canal de Discord y pega la URL aquí.
              </p>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-xl">
          <h2 className="text-2xl font-bold mb-4 text-white">Información</h2>
          <div className="space-y-4 text-white/70">
            <p>
              Desde aquí puedes configurar la información general de tu plataforma.
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>El nombre del sitio aparecerá en el header si no hay logo</li>
              <li>El logo se mostrará en el header principal</li>
              <li>El número de WhatsApp debe incluir el código de país</li>
              <li>El email de contacto aparecerá en el footer</li>
              <li>La clave BRE-B se muestra en el modal de recarga de saldo</li>
              <li>El Webhook de Discord envía notificaciones de recargas y premios al canal de tu servidor</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

