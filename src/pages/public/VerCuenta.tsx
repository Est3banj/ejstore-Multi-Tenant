import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import type {
  GetPublicAccountRequest,
  GetPublicAccountResponse,
} from '../../types/marketplace';
import {
  Search, Copy, CheckCircle2, XCircle, Clock,
  AlertTriangle, Shield, Mail, Eye, EyeOff,
  RefreshCw, Key,
} from 'lucide-react';
import Swal from 'sweetalert2';

const CASOS: { value: string; label: string }[] = [
  { value: '', label: 'Selecciona un caso' },
  { value: 'netflix', label: 'Netflix — Código de verificación' },
  { value: 'disney', label: 'Disney+ — Código de verificación' },
  { value: 'hbo', label: 'HBO Max — Código de verificación' },
];

const VerCuenta = (): JSX.Element => {
  const { token: pathToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const queryToken = searchParams.get('token');

  const initialToken = pathToken || queryToken || '';

  const [token, setToken] = useState(initialToken);
  const [caso, setCaso] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GetPublicAccountResponse | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleConsultar = async () => {
    if (!token) {
      setError('Ingresá un token válido.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setShowPreview(false);

    try {
      const cf = httpsCallable<GetPublicAccountRequest, GetPublicAccountResponse>(
        functions,
        'getPublicAccount'
      );
      const res = await cf({ token });

      if (!res.data.success) {
        setError(res.data.error || 'Token inválido o expirado.');
        return;
      }

      setResult(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      await Swal.fire({
        icon: 'success',
        title: 'Copiado',
        text: label ? `${label} copiado al portapapeles` : 'Copiado al portapapeles',
        timer: 1500,
        showConfirmButton: false,
        background: '#1f2937',
        color: '#fff',
        iconColor: '#22c55e',
      });
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleLimpiar = () => {
    setToken('');
    setCaso('');
    setResult(null);
    setError(null);
    setShowPreview(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConsultar();
  };

  const daysUntilExpiry = (expiresAt: string): number => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 border-b border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary-400" />
            <span className="text-sm text-gray-400">Consulta de código</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Buscar información
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Status / Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
          >
            <AlertTriangle size={16} />
            {error}
          </motion.div>
        )}

        {loading && (
          <div className="flex items-center gap-2 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-sm">
            <RefreshCw size={16} className="animate-spin" />
            Consultando...
          </div>
        )}

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
        >
          <div className="p-5 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-primary-400" />
              Consultar código
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="token">
                  Token
                </label>
                <input
                  id="token"
                  type="text"
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Ingresá el token del servicio"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-colors"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1.5" htmlFor="caso">
                  Caso
                </label>
                <select
                  id="caso"
                  value={caso}
                  onChange={(e) => setCaso(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-colors"
                  required
                >
                  {CASOS.map((c) => (
                    <option key={c.value} value={c.value} className="bg-gray-800 text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? (
                  <><RefreshCw size={16} className="animate-spin" /> Consultando...</>
                ) : (
                  <><Search size={16} /> Consultar</>
                )}
              </button>
              <button
                type="button"
                onClick={handleLimpiar}
                className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors"
              >
                Limpiar
              </button>
            </div>

            {/* Helper */}
            <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50 text-sm text-gray-400 space-y-1">
              <p className="font-medium text-gray-300 mb-2">PASOS A SEGUIR:</p>
              <p>1. Solicitá el código desde el dispositivo con el cual intentaste entrar.</p>
              <p>2. Seleccioná el caso que deseas consultar.</p>
              <p>3. Hacé clic en consultar.</p>
              <p>4. El código puede tardar de 2 a 3 minutos en llegar. Verificá que la hora de llegada coincida con la vigencia esperada.</p>
            </div>
          </form>
        </motion.div>

        {/* Resultado */}
        {result?.account && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
          >
            <div className="p-5 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-yellow-400" />
                Resultado
              </h3>
            </div>

            <div className="p-5 space-y-4">
              {/* Código en caja destacada */}
              {result.lastEmail?.code && (
                <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-xl">
                  <span className="text-3xl sm:text-4xl font-bold text-yellow-400 tracking-wider font-mono">
                    {result.lastEmail.code}
                  </span>
                  <button
                    onClick={() => handleCopy(result.lastEmail!.code, 'Código')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy size={16} />
                    Copiar
                  </button>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleConsultar()}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                >
                  <RefreshCw size={14} />
                  Actualizar código
                </button>
              </div>

              {/* Preview del email completo */}
              {result.lastEmail?.bodyText && (
                <div>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
                  >
                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPreview ? 'Ocultar correo' : 'Ver correo completo'}
                  </button>

                  {showPreview && (
                    <div className="mt-3 p-4 bg-gray-900/50 rounded-lg border border-gray-600/50">
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                        <Mail size={12} />
                        <span className="text-gray-400">{result.lastEmail?.from}</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-400">{result.lastEmail?.subject}</span>
                      </div>
                      <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {result.lastEmail.bodyText}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Grilla de metadatos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Estado</span>
                  <div className="flex items-center gap-1.5">
                    {result.account.status === 'active' ? (
                      <>
                        <CheckCircle2 size={14} className="text-green-400" />
                        <span className="text-sm font-medium text-green-400">Activo</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={14} className="text-red-400" />
                        <span className="text-sm font-medium text-red-400">Expirado</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Servicio</span>
                  <span className="text-sm font-medium text-white">{result.account.serviceName}</span>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Correo</span>
                  <span className="text-sm font-medium text-white truncate block">
                    {result.lastEmail?.from?.replace(/<[^>]+>/, '').trim() || '-'}
                  </span>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Vence</span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-gray-500" />
                    <span className="text-sm font-medium text-white">
                      {new Date(result.account.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Credenciales */}
              {Object.keys(result.account.credential).length > 0 && (
                <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-700/50 text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Key size={14} className="text-yellow-400" />
                    Credenciales de la cuenta
                  </div>
                  <div className="divide-y divide-gray-700/50">
                    {Object.entries(result.account.credential).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400 capitalize min-w-[72px]">{k}:</span>
                          <code className="text-sm text-white font-mono">{v}</code>
                        </div>
                        <button
                          onClick={() => handleCopy(v, k)}
                          className="text-primary-400 hover:text-primary-300 transition-colors"
                          title={`Copiar ${k}`}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer note */}
              <p className="text-xs text-gray-600 text-center">
                Este link es privado y expira automáticamente.{' '}
                {daysUntilExpiry(result.account.expiresAt) > 0 && (
                  <>No lo compartas con personas que no viven contigo.</>
                )}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VerCuenta;
