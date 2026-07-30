import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEffectiveTenantId } from '../../store';
import { saveEmailConfig, getEmailConfig, testEmailConnection, checkEmailStatus } from '../../services/marketplace';
import { adminFunctions } from '../../services/firebase';
import {
  Mail,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  DollarSign,
} from 'lucide-react';

const DEFAULT_HOST = 'imap.gmail.com';
const DEFAULT_PORT = 993;

// ─── Componente reutilizable para formulario IMAP ──────────────────────────
const ImapForm = ({
  title, icon: Icon, iconColor, docId, infoText,
  tenantId,
}: {
  title: string;
  icon: any;
  iconColor: string;
  docId: string;
  infoText: string;
  tenantId: string | null;
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [showPassword, setShowPassword] = useState(false);
  const [_loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [changed, setChanged] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>('idle');

  useEffect(() => {
    const load = async () => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const result = await getEmailConfig(tenantId, docId, adminFunctions);
        if (result.config) {
          setEmail(result.config.email);
          setHost(result.config.host || DEFAULT_HOST);
          setPort(result.config.port || DEFAULT_PORT);
          setHasExisting(true);
          // Verificamos conexión usando la contraseña guardada en Firestore
          setConnectionStatus('checking');
          try {
            const status = await checkEmailStatus(tenantId, docId, adminFunctions);
            setConnectionStatus(status.connected ? 'connected' : 'disconnected');
          } catch {
            setConnectionStatus('disconnected');
          }
        }
      } catch { /* silent */ } finally { setLoading(false); }
    };
    load();
  }, [tenantId, docId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);
    try {
      await saveEmailConfig({ tenantId, email: email.trim(), password: password.trim(), host: host.trim(), port, docId }, adminFunctions);
      setSaveResult({ success: true, message: 'Configuración guardada' });
      setHasExisting(true);
      setChanged(false);
    } catch (err: any) {
      setSaveResult({ success: false, message: err.message || 'Error al guardar' });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!email || !host || !port) return;
    setTesting(true);
    setTestResult(null);
    setConnectionStatus('checking');
    try {
      const result = await testEmailConnection({ email: email.trim(), password: password.trim(), host: host.trim(), port }, adminFunctions);
      setTestResult(result);
      setConnectionStatus(result.success ? 'connected' : 'disconnected');
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Error al probar' });
      setConnectionStatus('disconnected');
    } finally { setTesting(false); }
  };

  const handleRecheck = async () => {
    if (!tenantId) return;
    setConnectionStatus('checking');
    try {
      const status = await checkEmailStatus(tenantId, docId, adminFunctions);
      setConnectionStatus(status.connected ? 'connected' : 'disconnected');
    } catch {
      setConnectionStatus('disconnected');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Icon size={18} className={iconColor} />
          {title}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            connectionStatus === 'connected'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : connectionStatus === 'disconnected'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : connectionStatus === 'checking'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
          }`}>
            {connectionStatus === 'checking' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : connectionStatus === 'connected' ? (
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            ) : connectionStatus === 'disconnected' ? (
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
            )}
            {connectionStatus === 'checking' ? 'Verificando...'
              : connectionStatus === 'connected' ? 'Conectado'
              : connectionStatus === 'disconnected' ? 'Desconectado'
              : 'Sin probar'}
          </span>
          {connectionStatus !== 'checking' && (
            <button type="button" onClick={handleRecheck}
              className="ml-1 text-gray-500 hover:text-gray-300 transition-colors" title="Re-verificar conexión">
              <RefreshCw size={13} />
            </button>
          )}
        </h2>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-gray-400 text-sm">{infoText}</p>
        <div>
          <label className="block text-sm text-gray-300 font-medium mb-1.5">Correo electrónico</label>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setChanged(true); setSaveResult(null); }}
            placeholder="correo@gmail.com" className="input-field" />
        </div>
        <div>
          <label className="block text-sm text-gray-300 font-medium mb-1.5">Contraseña de aplicación</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={password}
              onChange={(e) => { setPassword(e.target.value); setChanged(true); setSaveResult(null); }}
              placeholder={hasExisting ? 'Dejar vacío para mantener la actual' : 'xxxx xxxx xxxx xxxx'}
              className="input-field pr-10" autoComplete="off" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {hasExisting && <p className="text-gray-500 text-xs mt-1">Dejalo vacío si no querés cambiar la contraseña actual</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm text-gray-300 font-medium mb-1.5">Servidor IMAP</label>
            <input type="text" value={host} onChange={(e) => { setHost(e.target.value); setChanged(true); setSaveResult(null); }} className="input-field" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 font-medium mb-1.5">Puerto</label>
            <input type="number" value={port} onChange={(e) => { setPort(parseInt(e.target.value) || 993); setChanged(true); setSaveResult(null); }} className="input-field" />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-700 flex flex-wrap gap-3">
        <button onClick={handleTest} disabled={testing || !email || !password || !host}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          {testing ? <><Loader2 size={14} className="animate-spin" /> Probando...</> : 'Probar conexión'}
        </button>
        <button onClick={handleSave} disabled={saving || !changed || !email || !host}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar configuración'}
        </button>
      </div>
      {testResult && (
        <div className={`mx-6 mb-4 flex items-center gap-2 p-4 rounded-xl border ${testResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {testResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{testResult.message}</span>
        </div>
      )}
      {saveResult && (
        <div className={`mx-6 mb-4 flex items-center gap-2 p-4 rounded-xl border ${saveResult.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {saveResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{saveResult.message}</span>
        </div>
      )}
    </motion.div>
  );
};

// ─── Página principal ──────────────────────────────────────────────────────
const EmailConfig = (): JSX.Element => {
  const tenantId = useEffectiveTenantId();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Correo Madre</h1>
        <p className="text-gray-400 text-sm mt-1">
          Configura las cuentas de correo para la verificación automática de códigos y pagos
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Shield size={18} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-200 leading-relaxed">
          <p className="font-medium text-blue-100 mb-1">Cómo funciona</p>
          <p>Necesitás dos cuentas de correo separadas:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><strong>Códigos:</strong> Recibe los códigos de verificación de Netflix, Disney+, etc.</li>
            <li><strong>Pagos:</strong> Recibe los comprobantes de pago de Bancolombia (transferencias)</li>
          </ul>
          <p className="mt-2">Usá <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">Contraseñas de Aplicación</a> de Google.</p>
        </div>
      </div>

      <ImapForm
        title="Correo para Códigos"
        icon={Mail}
        iconColor="text-primary-400"
        docId="emailConfig"
        infoText="Los subdistribuidores consultan códigos de verificación desde este correo."
        tenantId={tenantId}
      />

      <ImapForm
        title="Correo para Pagos"
        icon={DollarSign}
        iconColor="text-green-400"
        docId="emailConfigPayments"
        infoText="Este correo recibe las notificaciones de pago de Bancolombia para auto-aprobar recargas."
        tenantId={tenantId}
      />
    </div>
  );
};

export default EmailConfig;
