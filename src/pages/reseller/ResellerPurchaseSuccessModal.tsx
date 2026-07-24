import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Copy, ExternalLink } from 'lucide-react';

interface Credential {
  email: string;
  password: string;
  extra?: Record<string, string>;
}

interface Profile {
  profileId: string | null;
  profileName: string;
  profilePin: string | null;
  credential: Credential;
}

interface ResellerPurchaseSuccessModalProps {
  open: boolean;
  onClose: () => void;
  serviceName: string;
  quantity: number;
  purchaseId: string;
  credentials: Credential[];
  profiles?: Profile[];
  linkTokens?: string[];
}

const TEMPLATE_RULES = `⚠ REGLAS ⚠
✅ NO EDITAR SOBRE EL MISMO PERFIL // NO CAMBIAR CONTRASEÑA, DE LO CONTRARIO NO SE DARÁ GARANTÍA
USAR EN UN SOLO DISPOSITIVO.
✅ SI LLEGA A PRESENTAR ALGUNA FALLA TU CUENTA, POR FAVOR ENVIAR EN ORDEN: CORREO, CONTRASEÑA Y EVIDENCIA DEL PROBLEMA`;

const buildTicketId = (purchaseId: string, idx: number): string => {
  const shortId = purchaseId.slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${idx + 1}`;
};

const buildTemplate = (serviceName: string, profile: Profile, ticketId: string): string => {
  const { credential, profileName, profilePin } = profile;
  const lines = [
    `⭕️📺 SERVICIO DE ${serviceName} 📽️`,
    '',
    `*Ticket:* ${ticketId}`,
    `*Correo:* ${credential.email || ''}`,
    `*Clave:* ${credential.password || ''}`,
    `*Perfil:* ${profileName || ''}`,
    `*Pin:* ${profilePin || ''}`,
    '',
    `*Vence:* --`,
    '',
    TEMPLATE_RULES,
  ];
  return lines.join('\n');
};

const ResellerPurchaseSuccessModal = ({
  open,
  onClose,
  serviceName,
  quantity,
  purchaseId,
  credentials,
  profiles,
  linkTokens,
}: ResellerPurchaseSuccessModalProps): JSX.Element => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const displayProfiles = profiles && profiles.length > 0 ? profiles : [];

  const handleCopyTemplate = async (index: number, profile: Profile) => {
    const ticketId = buildTicketId(purchaseId, index);
    const template = buildTemplate(serviceName, profile, ticketId);
    try {
      await navigator.clipboard.writeText(template);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = template;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

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
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                <CheckCircle size={36} className="text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Compra Exitosa</h2>
              <p className="text-gray-400 mt-1">
                {quantity}x {serviceName}
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                Credenciales ({displayProfiles.length || credentials.length})
              </h3>

              {(displayProfiles.length > 0 ? displayProfiles : credentials.map((c) => ({
                profileId: null,
                profileName: 'Perfil 1',
                profilePin: null,
                credential: c,
              }))).map((profile, index) => {
                const ticketId = buildTicketId(purchaseId, index);
                return (
                  <div
                    key={index}
                    className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                  >
                    {/* Ticket ID badge */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                        #{index + 1}
                      </span>
                      <span className="text-[10px] text-primary-400 font-mono font-medium">
                        {ticketId}
                      </span>
                    </div>

                    {/* Template preview */}
                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed mb-3">
                      {buildTemplate(serviceName, profile, ticketId)}
                    </pre>

                    {/* Copy template button */}
                    <button
                      onClick={() => handleCopyTemplate(index, profile)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-sm font-medium transition-colors"
                    >
                      <Copy size={14} />
                      {copiedIndex === index ? '¡Copiado!' : 'Copiar plantilla con Ticket'}
                    </button>

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
                  </div>
                );
              })}
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
