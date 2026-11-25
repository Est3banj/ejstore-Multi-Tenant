import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getSettings, updateSettings } from '../../services/firestore';
import { adminDb } from '../../services/firebase';
import { uploadImage } from '../../services/storage';
import { validateImageUrl } from '../../utils/validation';
import { motion } from 'framer-motion';
import { Save, Upload, AlertCircle, CheckCircle2, Mail, Eye, EyeOff } from 'lucide-react';
import type { SmtpConfig } from '../../types/marketplace';
import { WompiSettings } from '../../components/admin/WompiSettings';

interface FormData {
  siteName: string;
  logo: string;
  logoUrlInput: string;
  whatsappNumber: string;
  contactEmail: string;
  primaryColor: string;
  secondaryColor: string;
  qrImage: string;
  brebKey: string;
  brebBankName: string;
}

interface UrlValidation {
  isValid: boolean;
  error: string;
  warning?: string;
}

const Settings = () => {
  const { refreshSettings, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [formData, setFormData] = useState<FormData>({
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
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [urlValidation, setUrlValidation] = useState<UrlValidation>({ isValid: true, error: '', warning: '' });

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  const loadSettings = async () => {
    if (!tenantId) return;
    try {
      const settingsData = await getSettings(tenantId, adminDb);
      setFormData({
        siteName: settingsData?.siteName || 'Mi Tienda',
        logo: settingsData?.logo || '',
        logoUrlInput: (settingsData as { logoUrlInput?: string } | null)?.logoUrlInput || '',
        whatsappNumber: settingsData?.whatsappNumber || '',
        contactEmail: settingsData?.contactEmail || '',
        primaryColor: settingsData?.primaryColor || '#E50914',
        secondaryColor: settingsData?.secondaryColor || '#1A1A1A',
        qrImage: settingsData?.qrImage || '',
        brebKey: settingsData?.brebKey || '',
        brebBankName: settingsData?.brebBankName || '',
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setFormData({ ...formData, logoUrlInput: url });

    if (url.trim()) {
      setUrlValidation(validateImageUrl(url) as UrlValidation);
    } else {
      setUrlValidation({ isValid: true, error: '', warning: '' });
    }
  };

  const handleSave = async () => {
    if (formData.logoUrlInput && !urlValidation.isValid) {
      alert('Por favor, corrija la URL del logo antes de continuar');
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      let logoUrl = formData.logo;

      if (formData.logoUrlInput && formData.logoUrlInput.trim()) {
        logoUrl = formData.logoUrlInput.trim();
      } else if (logoFile) {
        const path = `settings/logo_${Date.now()}_${logoFile.name}`;
        logoUrl = await uploadImage(logoFile, path);
      }

      const { logoUrlInput: _logoUrlInput, ...settingsData } = { ...formData, logo: logoUrl };

      await updateSettings(tenantId, settingsData, adminDb);
      await refreshSettings();
      await loadSettings();
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <WompiSettings key={tenantId} tenantId={tenantId} />
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

            {(formData.logoUrlInput || formData.logo) && !logoFile && (
              <div className="mb-4">
                <p className="text-white/50 text-sm mb-2">Vista previa:</p>
                <img
                  src={formData.logoUrlInput || formData.logo}
                  alt="Logo preview"
                  className="h-20 w-auto rounded-lg"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

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
                    La URL tiene prioridad sobre el archivo
                  </p>
                )}
              </div>
            )}

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

          <div className="border-t border-white/10 pt-6 mt-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Notificaciones por Telegram
            </h3>
            <TelegramSection />
          </div>

          <div className="border-t border-white/10 pt-6 mt-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-400" />
              Configuración SMTP
            </h3>
            <SmtpSection />
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
              <li>Próximamente: notificaciones por Telegram</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const TelegramSection = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'linked' | 'unlinked'>('idle');
  const [token, setToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const check = async () => {
      try {
        const { checkTelegramStatus } = await import('../../services/marketplace');
        const result: { linked: boolean } = await checkTelegramStatus();
        setStatus(result.linked ? 'linked' : 'unlinked');
      } catch {
        setStatus('unlinked');
      }
    };
    check();
  }, []);

  const handleGenerate = async () => {
    setError('');
    setStatus('loading');
    try {
      const { generateTelegramToken } = await import('../../services/marketplace');
      const result: { token: string; botUsername: string } = await generateTelegramToken();
      setToken(result.token);
      setBotUsername(result.botUsername);
    } catch (e) {
      setError((e as Error).message || 'Error al generar token');
      setStatus('unlinked');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`/start ${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {status === 'linked' ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          <div>
            <p className="text-emerald-400 font-medium">Vinculado a Telegram</p>
            <p className="text-emerald-400/60 text-sm">Recibirás notificaciones aquí</p>
          </div>
        </div>
      ) : token ? (
        <div className="space-y-3">
          <div className="p-4 bg-gray-900/50 rounded-xl border border-primary-500/20">
            <p className="text-gray-400 text-xs mb-2">Tu token de vinculación (vence en 5 min)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 rounded-lg px-3 py-2 text-primary-400 font-bold text-lg tracking-wider text-center select-all">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
                title="Copiar"
              >
                {copied ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <ol className="mt-3 space-y-1 text-gray-400 text-sm">
              <li>1. Abrí Telegram y buscá <strong className="text-white">@{botUsername || 'el bot'}</strong></li>
              <li>2. Iniciá el bot y enviá el token: <code className="text-primary-400 bg-gray-950 px-1 rounded">{token}</code></li>
            </ol>
          </div>
          <button
            onClick={() => setToken('')}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div>
          {error && (
            <p className="text-red-400 text-sm mb-3">{error}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={status === 'loading'}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {status === 'loading' ? (
              <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generando...</>
            ) : (
              <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Vincular Telegram</>
            )}
          </button>
          <p className="text-gray-500 text-xs mt-2">
            Vinculá tu Telegram para recibir notificaciones de recargas, compras y más.
          </p>
        </div>
      )}
    </div>
  );
};

const SmtpSection = () => {
  const [showPass, setShowPass] = useState(false);
  const [config, setConfig] = useState<SmtpConfig>({
    host: '',
    port: 587,
    user: '',
    pass: '',
    from: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { getSmtpConfig } = await import('../../services/marketplace');
        const result = await getSmtpConfig();
        if (result) {
          setConfig({
            host: result.host || '',
            port: result.port || 587,
            user: result.user || '',
            pass: result.pass || '',
            from: result.from || '',
          });
        }
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const { saveSmtpConfig } = await import('../../services/marketplace');
      await saveSmtpConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500 text-sm">Cargando configuración SMTP...</div>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-emerald-400 text-sm">Configuración guardada</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-white/70 text-xs mb-1">Servidor SMTP</label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
            className="input-field text-sm"
            placeholder="smtp.gmail.com"
          />
        </div>
        <div>
          <label className="block text-white/70 text-xs mb-1">Puerto</label>
          <input
            type="number"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 587 })}
            className="input-field text-sm"
            placeholder="587"
          />
        </div>
      </div>
      <div>
        <label className="block text-white/70 text-xs mb-1">Usuario</label>
        <input
          type="text"
          value={config.user}
          onChange={(e) => setConfig({ ...config, user: e.target.value })}
          className="input-field text-sm"
          placeholder="tu@email.com"
        />
      </div>
      <div>
        <label className="block text-white/70 text-xs mb-1">Contraseña</label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={config.pass}
            onChange={(e) => setConfig({ ...config, pass: e.target.value })}
            className="input-field text-sm pr-10"
            placeholder="********"
          />
          <button
            type="button"
            onClick={() => setShowPass(!showPass)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-white/70 text-xs mb-1">Email de envío (from)</label>
        <input
          type="email"
          value={config.from || ''}
          onChange={(e) => setConfig({ ...config, from: e.target.value })}
          className="input-field text-sm"
          placeholder="noreply@tutienda.com"
        />
        <p className="text-gray-500 text-xs mt-1">Opcional. Si no se define, se usa el usuario.</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Configuración SMTP'}
        </button>
        <button
          onClick={async () => {
            setTesting(true);
            setTestResult(null);
            try {
              const { sendTestEmail } = await import('../../services/marketplace');
              const result = await sendTestEmail();
              setTestResult(result);
            } catch (e) {
              setTestResult({ success: false, message: (e as Error).message || 'Error al enviar prueba' });
            } finally {
              setTesting(false);
            }
          }}
          disabled={testing || !config.host || !config.user || !config.pass}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {testing ? 'Enviando...' : 'Enviar Prueba'}
        </button>
      </div>
      {testResult && (
        <div className={`text-sm mt-2 ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={testResult.success ? 'text-emerald-400' : 'text-red-400'}>
            {testResult.success ? 'OK: ' : 'ERROR: '}
          </span>
          {testResult.message}
        </div>
      )}
    </div>
  );
};

export default Settings;
