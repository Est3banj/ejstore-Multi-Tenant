import { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Copy, ClipboardCheck, ShoppingBag, Home } from 'lucide-react';

interface LocationState {
  credential?: { email: string; password: string; extra?: Record<string, string> };
  serviceName?: string;
  newBalance?: number;
  linkToken?: string | null;
  hasCodeExtraction?: boolean;
}

const PurchaseResult = () => {
  useParams<{ purchaseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const credential = state?.credential;
  const serviceName = state?.serviceName || 'Servicio';
  const linkToken = state?.linkToken || null;
  const hasCodeExtraction = state?.hasCodeExtraction || false;

  if (!credential) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-8 rounded-xl text-center max-w-md w-full">
          <p className="text-white/70 mb-4">No se encontraron datos de la compra.</p>
          <button
            onClick={() => navigate('/')}
            className="w-full text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #E50914, #E50914dd)',
            }}
          >
            Volver a la tienda
          </button>
        </div>
      </div>
    );
  }

  const template = `🎎 SERVICIO DE ${serviceName}
*Correo:* ${credential.email}
*Clave:* ${credential.password}
${credential.extra ? Object.entries(credential.extra).map(([k, v]) => `*${k}:* ${v}`).join('\n') : ''}
*Fecha Entrega:* ${new Date().toLocaleDateString('es-CO')}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = template;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-lg w-full"
      >
        <div className="glass p-8 rounded-2xl text-center space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
            className="w-20 h-20 mx-auto bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
          >
            <Check size={40} className="text-white" />
          </motion.div>

          <div>
            <h1 className="text-3xl font-bold text-white mb-2">¡Compra exitosa!</h1>
            <p className="text-white/60">
              Tu servicio <span className="text-white font-semibold">{serviceName}</span> está listo.
            </p>
            {state?.newBalance !== undefined && (
              <p className="text-white/50 text-sm mt-2">
                Saldo restante: <span className="text-green-400 font-semibold">${state.newBalance.toLocaleString()}</span>
              </p>
            )}
          </div>

          <div className="glass-dark p-4 rounded-xl text-left">
            <pre className="text-white/80 text-sm whitespace-pre-wrap font-mono">{template}</pre>
          </div>

          {hasCodeExtraction && linkToken && (
            <div className="glass-dark p-4 rounded-xl">
              <p className="text-white/70 text-sm mb-2">Link público de acceso</p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-primary-400 text-sm font-mono break-all">
                  {window.location.origin}?token={linkToken}
                </code>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}?token=${linkToken}`);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-medium whitespace-nowrap"
                >
                  {copiedLink ? (
                    <><ClipboardCheck size={14} className="text-green-400" /><span className="text-green-400">Copiado</span></>
                  ) : (
                    <><Copy size={14} /> Copiar link</>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all"
            >
              {copied ? (
                <>
                  <ClipboardCheck size={18} className="text-green-400" />
                  <span className="text-green-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy size={18} />
                  <span>Copiar credenciales</span>
                </>
              )}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/mis-servicios')}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all"
            >
              <ShoppingBag size={18} />
              <span>Ver en mis servicios</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 flex items-center justify-center gap-2 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #E50914, #E50914dd)',
              }}
            >
              <Home size={18} />
              <span>Volver a la tienda</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PurchaseResult;
