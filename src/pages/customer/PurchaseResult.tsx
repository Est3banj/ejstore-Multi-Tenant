import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Check, Copy, ClipboardCheck, ShoppingBag, Home, Loader } from 'lucide-react';

interface LocationState {
  credential?: { email: string; password: string; extra?: Record<string, string> };
  serviceName?: string;
  newBalance?: number;
  linkToken?: string | null;
  hasCodeExtraction?: boolean;
  profileName?: string;
  profilePin?: string;
  durationDays?: number;
  purchaseId?: string;
}

const TEMPLATE_RULES = `⚠ REGLAS ⚠
✅ NO EDITAR SOBRE EL MISMO PERFIL // NO CAMBIAR CONTRASEÑA, DE LO CONTRARIO NO SE DARÁ GARANTÍA
USAR EN UN SOLO DISPOSITIVO.
✅ SI LLEGA A PRESENTAR ALGUNA FALLA TU CUENTA, POR FAVOR ENVIAR EN ORDEN: CORREO, CONTRASEÑA Y EVIDENCIA DEL PROBLEMA`;

const buildTicketId = (purchaseId: string, idx: number): string => {
  const shortId = purchaseId.slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${idx + 1}`;
};

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} className="text-xs ml-2 text-blue-500 hover:text-blue-700">
      {copied ? '✅ Copiado!' : (label || 'Copiar')}
    </button>
  );
};

const PurchaseResult = () => {
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [fetchedData, setFetchedData] = useState<LocationState | null>(null);

  useEffect(() => {
    if (state) return;
    if (!purchaseId) {
      setError(true);
      return;
    }
    setLoading(true);
    const fetchData = async () => {
      try {
        const snap = await getDoc(doc(db, 'purchases', purchaseId));
        if (!snap.exists()) {
          setError(true);
          return;
        }
        const data = snap.data();
        let credential: LocationState['credential'];
        let profileName: string | undefined;
        let profilePin: string | undefined;

        if (data.profiles?.length > 0) {
          const profile = data.profiles[0];
          credential = { email: profile.credential?.email || '', password: profile.credential?.password || '' };
          profileName = profile.profileName;
          profilePin = profile.profilePin;
        } else {
          credential = data.credential ? { email: data.credential.email, password: data.credential.password } : undefined;
          profileName = data.profileName;
          profilePin = data.profilePin;
        }

        const durationDays = (data as any).durationDays || 30;

        setFetchedData({
          credential,
          serviceName: data.serviceName || 'Servicio',
          durationDays,
          profileName,
          profilePin,
          linkToken: data.linkTokens?.[0] || null,
          hasCodeExtraction: false,
        });
      } catch (err) {
        console.error('Error fetching purchase:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [state, purchaseId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-8 rounded-xl text-center max-w-md w-full">
          <Loader size={32} className="animate-spin inline-block text-white/60" />
          <p className="text-white/70 mt-4">Cargando datos de la compra...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-8 rounded-xl text-center max-w-md w-full">
          <p className="text-white/70 mb-4">No se encontraron datos de la compra.</p>
          <button
            onClick={() => navigate('/mis-servicios')}
            className="w-full mb-2 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 border border-white/20 hover:border-white/40"
          >
            Ver mis servicios
          </button>
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

  const effectiveData = state || fetchedData;
  const credential = effectiveData?.credential;
  const serviceName = effectiveData?.serviceName || 'Servicio';
  const linkToken = effectiveData?.linkToken || null;
  const hasCodeExtraction = effectiveData?.hasCodeExtraction || false;
  const profileName = effectiveData?.profileName;
  const profilePin = effectiveData?.profilePin;
  const durationDays = effectiveData?.durationDays || 30;
  const newBalance = effectiveData?.newBalance;

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

  const ticketId = buildTicketId(purchaseId || '', 0);

  const buildTemplate = () => {
    let t = `⭕️📺 SERVICIO DE ${serviceName} 📽️\n\n`;
    t += `*Ticket:* ${ticketId}\n`;
    t += `*Correo:* ${credential.email}\n`;
    t += `*Clave:* ${credential.password}\n`;
    if (profileName) t += `*Perfil:* ${profileName}\n`;
    if (profilePin) t += `*Pin:* ${profilePin}\n`;
    if (credential.extra) {
      t += Object.entries(credential.extra).map(([k, v]) => `*${k}:* ${v}`).join('\n') + '\n';
    }
    const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    t += `\n*Vence:* ${expiryDate.toLocaleDateString('es-CO')}\n\n`;
    t += TEMPLATE_RULES;
    return t;
  };

  const template = buildTemplate();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
            {newBalance !== undefined && (
              <p className="text-white/50 text-sm mt-2">
                Saldo restante: <span className="text-green-400 font-semibold">${newBalance.toLocaleString()}</span>
              </p>
            )}
          </div>

          <div className="glass-dark p-4 rounded-xl text-left">
            <pre className="text-white/80 text-sm whitespace-pre-wrap font-mono">{template}</pre>
          </div>

          <div className="glass-dark p-4 rounded-xl text-left space-y-3">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Credenciales</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Correo:</span>
              <div className="flex items-center gap-2">
                <code className="text-white font-mono text-xs">{credential.email}</code>
                <CopyButton text={credential.email} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/70">Clave:</span>
              <div className="flex items-center gap-2">
                <code className="text-white font-mono text-xs">{credential.password}</code>
                <CopyButton text={credential.password} />
              </div>
            </div>
            {profileName && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">Perfil:</span>
                <div className="flex items-center gap-2">
                  <code className="text-white font-mono text-xs">{profileName}</code>
                  <CopyButton text={profileName} />
                </div>
              </div>
            )}
            {profilePin && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70">PIN:</span>
                <div className="flex items-center gap-2">
                  <code className="text-white font-mono text-xs">{profilePin}</code>
                  <CopyButton text={profilePin} />
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-white/10">
              <p className="text-white/50 text-xs">
                Ticket: {ticketId} — Vence: {new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toLocaleDateString('es-CO')}
              </p>
            </div>
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
                  <span>Copiar datos</span>
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
