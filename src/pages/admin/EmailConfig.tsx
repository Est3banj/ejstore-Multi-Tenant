import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEffectiveTenantId } from '../../store';
import { saveEmailConfig, getEmailConfig, testEmailConnection } from '../../services/marketplace';
import {
  Mail,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Shield,
} from 'lucide-react';

const DEFAULT_HOST = 'imap.gmail.com';
const DEFAULT_PORT = 993;

const EmailConfig = (): JSX.Element => {
  const tenantId = useEffectiveTenantId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [changed, setChanged] = useState(false);

  // Cargar configuración existente
  useEffect(() => {
    const load = async () => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const result = await getEmailConfig(tenantId);
        if (result.config) {
          setEmail(result.config.email);
          setHost(result.config.host || DEFAULT_HOST);
          setPort(result.config.port || DEFAULT_PORT);
          setHasExisting(true);
          if (!result.config.hasPassword) {
            // No hay password guardado, mostrar advertencia
          }
        }
      } catch (err) {
        console.error('Error loading email config:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);
    try {
      await saveEmailConfig({
        tenantId,
        email: email.trim(),
        password: password.trim(),
        host: host.trim(),
        port,
      });
      setSaveResult({ success: true, message: 'Configuración guardada correctamente' });
      setHasExisting(true);
      setChanged(false);
      if (!password) {
        // Si no se cambió password, no se pierde
      }
    } catch (err: any) {
      setSaveResult({ success: false, message: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!email || !host || !port) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testEmailConnection({
        email: email.trim(),
        password: password.trim(),
        host: host.trim(),
        port,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Error al probar conexión' });
    } finally {
      setTesting(false);
    }
  };

  const handleFieldChange = () => {
    setChanged(true);
    setSaveResult(null);
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando configuración...</div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Correo Madre</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configura la cuenta de correo que recibe los códigos de verificación de los servicios
        </p>
      </div>

      {/* Info box */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Shield size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-200 leading-relaxed">
          <p className="font-medium text-blue-100 mb-1">Cómo funciona</p>
          <p>Esta cuenta recibirá por reenvío los códigos de verificación de todas las cuentas de servicio. Los subdistribuidores podrán consultarlos desde "Consultar Códigos".</p>
          <p className="mt-2">
            <strong>Importante:</strong> Usá una{' '}
            <a
              href="https://support.google.com/accounts/answer/185833"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline"
            >
              Contraseña de Aplicación
            </a>{' '}
            de Google, no la contraseña de tu cuenta.
          </p>
        </div>
      </div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Mail size={18} className="text-primary-400" />
            Configuración IMAP
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {/* Correo */}
          <div>
            <label className="block text-sm text-gray-300 font-medium mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); handleFieldChange(); }}
              placeholder="cuentamadre@gmail.com"
              className="input-field"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm text-gray-300 font-medium mb-1.5">
              Contraseña de aplicación
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); handleFieldChange(); }}
                placeholder={hasExisting ? 'Dejar vacío para mantener la actual' : 'xxxx xxxx xxxx xxxx'}
                className="input-field pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {hasExisting && (
              <p className="text-gray-500 text-xs mt-1">
                Dejalo vacío si no querés cambiar la contraseña actual
              </p>
            )}
          </div>

          {/* Host y Puerto */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-gray-300 font-medium mb-1.5">
                Servidor IMAP
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => { setHost(e.target.value); handleFieldChange(); }}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-1.5">
                Puerto
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => { setPort(parseInt(e.target.value) || 993); handleFieldChange(); }}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="px-6 py-4 border-t border-gray-700 flex flex-wrap gap-3">
          <button
            onClick={handleTest}
            disabled={testing || !email || !password || !host}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {testing ? (
              <><Loader2 size={14} className="animate-spin" /> Probando...</>
            ) : (
              'Probar conexión'
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !changed || !email || !host}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Guardando...</>
            ) : (
              'Guardar configuración'
            )}
          </button>
        </div>
      </motion.div>

      {/* Resultado de prueba */}
      {testResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 p-4 rounded-xl border ${
            testResult.success
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {testResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{testResult.message}</span>
        </motion.div>
      )}

      {/* Resultado de guardado */}
      {saveResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 p-4 rounded-xl border ${
            saveResult.success
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {saveResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{saveResult.message}</span>
        </motion.div>
      )}
    </div>
  );
};

export default EmailConfig;
