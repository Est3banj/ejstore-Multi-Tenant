import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Copy, ExternalLink } from 'lucide-react';

interface Credential {
  email: string;
  password: string;
  extra?: Record<string, string>;
}

interface ResellerPurchaseSuccessModalProps {
  open: boolean;
  onClose: () => void;
  serviceName: string;
  quantity: number;
  credentials: Credential[];
  linkTokens?: string[];
}

const ResellerPurchaseSuccessModal = ({
  open,
  onClose,
  serviceName,
  quantity,
  credentials,
  linkTokens,
}: ResellerPurchaseSuccessModalProps): JSX.Element => {

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const hasLinks = linkTokens && linkTokens.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-800 rounded-2xl w-full max-w-lg p-6 border border-gray-700 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                <CheckCircle size={36} className="text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Compra Exitosa</h2>
              <p className="text-gray-400 mt-1">
                {quantity}x {serviceName}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Credenciales ({credentials.length})
              </h3>
              {credentials.map((cred, index) => (
                <div
                  key={index}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                >
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Usuario:</span>
                      <p className="text-white font-mono break-all">{cred.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Contraseña:</span>
                      <p className="text-white font-mono break-all">{cred.password}</p>
                    </div>
                  </div>

                  {/* Link público auto-generado */}
                  {hasLinks && linkTokens[index] && (
                    <div className="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs">
                        <ExternalLink size={12} className="text-primary-400" />
                        <code className="text-primary-400">?token={linkTokens[index]}</code>
                      </div>
                      <button
                        onClick={() => handleCopyLink(linkTokens[index])}
                        className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-medium"
                      >
                        <Copy size={12} />
                        Copiar link
                      </button>
                    </div>
                  )}

                  {!hasLinks && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <span className="text-xs text-gray-500 italic">URL: no aplica</span>
                    </div>
                  )}

                  {cred.extra && Object.keys(cred.extra).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      {Object.entries(cred.extra).map(([key, value]) => (
                        <div key={key} className="flex gap-2 text-sm">
                          <span className="text-gray-500 capitalize">{key}:</span>
                          <span className="text-white font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={onClose}
                className="w-full text-gray-400 hover:text-white font-medium py-2 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResellerPurchaseSuccessModal;
