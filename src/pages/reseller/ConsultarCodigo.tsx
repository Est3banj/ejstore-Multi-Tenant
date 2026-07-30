import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Loader, Copy, CheckCircle2, AlertCircle, Mail, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { extraerCodigo } from '../../services/marketplace';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { adminDb } from '../../services/firebase';

interface CodeResult {
  success: boolean;
  code: string;
  subject: string;
  from: string;
  bodyText: string;
  extractedAt: string;
}

const CASOS = [
  { id: 'netflix-viaje',   label: 'Netflix - Estoy de viaje' },
  { id: 'netflix-hogar',   label: 'Netflix - Codigo Hogar' },
  { id: 'netflix-pass',    label: 'Netflix - Cambiar contraseña' },
  { id: 'netflix-sesion',  label: 'Netflix - Codigo inicio sesion' },
  { id: 'win-codigo',      label: 'Win - Codigo' },
  { id: 'tools-chatgpt',   label: 'Tools - ChatGPT Code' },
  { id: 'universal-codigo',label: 'Universal - codigo' },
  { id: 'max-acceso',      label: 'Max - codigo acceso' },
];

const COOLDOWN_SECONDS = 30;

const DOMINIOS = [
  '@gmail.com',
  '@hotmail.com',
  '@outlook.com',
  '@yahoo.com',
  '@icloud.com',
  '@live.com',
  '@msn.com',
  '@yahoo.es',
  '@hotmail.es',
];

const ConsultarCodigo = (): JSX.Element => {
  const { adminUser } = useAuthStore();
  const uid = adminUser?.uid || '';

  // Form
  const [correo, setCorreo] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [caso, setCaso] = useState('');

  // Autocomplete
  const [foundEmails, setFoundEmails] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchingEmail, setSearchingEmail] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Result
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Listo para consultar.');
  const [copied, setCopied] = useState(false);

  // Cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Close autocomplete on outside click + cleanup cooldown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Email autocomplete
  useEffect(() => {
    if (!uid || !correo.trim() || selectedEmail) {
      setFoundEmails([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (correo.trim().length < 3) return;
      setSearchingEmail(true);
      try {
        const q = query(
          collection(adminDb, 'purchases'),
          where('resellerId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snapshot = await getDocs(q);
        const emails = new Set<string>();
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const email = data.customerEmail || '';
          if (email.toLowerCase().includes(correo.toLowerCase())) {
            emails.add(email);
          }
        });
        setFoundEmails(Array.from(emails).slice(0, 8));
        setShowResults(true);
      } catch {
        // silent
      } finally {
        setSearchingEmail(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [correo, uid, selectedEmail]);

  const handleClear = () => {
    setCorreo('');
    setSelectedEmail('');
    setCaso('');
    setCodeResult(null);
    setError(null);
    setCopied(false);
    setCooldown(0);
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
    setStatusMsg('Listo para consultar.');
  };

  const handleConsultar = async () => {
    if (!uid) return;
    const emailFinal = selectedEmail || correo.trim();
    if (!emailFinal) {
      setError('Ingresá un correo electrónico');
      return;
    }
    if (!caso) {
      setError('Seleccioná un caso');
      return;
    }

    setError(null);
    setStatusMsg('Buscando código...');

    try {
      const casoLabel = CASOS.find((c) => c.id === caso)?.label || '';
      const servicePrefix = casoLabel.split(' - ')[0]?.trim() || '';

      if (!servicePrefix) {
        setError('Caso inválido');
        return;
      }

      const q = query(
        collection(adminDb, 'purchases'),
        where('resellerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);

      const match = snapshot.docs.find((doc) => {
        const data = doc.data();
        const docEmail = (data.customerEmail || '').toLowerCase();
        const name = (data.serviceName || '').toLowerCase();
        return docEmail === emailFinal.toLowerCase() && name.startsWith(servicePrefix.toLowerCase());
      });

      if (!match) {
        setStatusMsg(`No se encontró un código de "${servicePrefix}" para este cliente.`);
        return;
      }

      await doExtract(match.id);
    } catch {
      setError('Error al buscar el código');
      setStatusMsg('Error en la consulta.');
    }
  };

  const doExtract = async (purchaseId: string) => {
    setExtracting(true);
    setError(null);
    setCodeResult(null);
    setStatusMsg('Extrayendo código...');
    try {
      const result = await extraerCodigo({ purchaseId });
      setCodeResult({
        success: result.success,
        code: result.code,
        subject: result.subject,
        from: result.from,
        bodyText: result.bodyText,
        extractedAt: result.extractedAt,
      });
      setStatusMsg(result.success ? 'Código extraído correctamente.' : result.bodyText);
      // Iniciar cooldown
      setCooldown(COOLDOWN_SECONDS);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Error al extraer el código');
      setStatusMsg('Error al extraer el código.');
    } finally {
      setExtracting(false);
    }
  };

  const handleCopyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Hero */}
      <section className="mb-6">
        <h1 className="text-2xl font-bold text-white">Consultar código</h1>
        <p className="text-gray-400 text-sm mt-1">
          Buscá el código de verificación de un cliente
        </p>
      </section>

      {/* Panel */}
      <div className={`bg-gray-800 rounded-xl border overflow-hidden shadow-lg transition-all duration-500 ${
        extracting
          ? 'border-primary-500/50 shadow-primary-500/10 animate-pulse'
          : codeResult
          ? 'border-green-500/30'
          : 'border-gray-700'
      }`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Buscar información</h2>
        </div>

        {/* Status bar */}
        <div className={`mx-5 mt-4 px-4 py-3 rounded-lg text-sm ${
          error
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : codeResult && !codeResult.success
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            : codeResult
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-white/5 text-gray-400 border border-white/10'
        }`}>
          {error ? (
            <span className="flex items-center gap-2"><AlertCircle size={14} /> {error}</span>
          ) : codeResult && !codeResult.success ? (
            <span className="flex items-center gap-2"><AlertCircle size={14} /> No se encontró el código de verificación</span>
          ) : codeResult ? (
            <span className="flex items-center gap-2"><CheckCircle2 size={14} /> {statusMsg}</span>
          ) : (
            statusMsg
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleConsultar(); }}
          className="p-5 space-y-4"
        >
          {/* Correo */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Correo</label>
            <input
              type="email"
              value={selectedEmail || correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                setSelectedEmail('');
                setShowResults(true);
                setCodeResult(null);
                setError(null);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="cliente@ejemplo.com"
              className="input-field"
              disabled={extracting}
              maxLength={200}
              autoComplete="off"
            />

            {/* Autocomplete dropdown: emails de compras + sugerencias de dominio */}
            <AnimatePresence>
              {showResults && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                >
                  {/* Resultados de compras existentes */}
                  {searchingEmail ? (
                    <div className="px-4 py-3 text-gray-400 text-sm flex items-center gap-2">
                      <Loader size={14} className="animate-spin" />
                      Buscando...
                    </div>
                  ) : foundEmails.length > 0 ? (
                    foundEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => {
                          setSelectedEmail(email);
                          setCorreo(email);
                          setShowResults(false);
                          setCodeResult(null);
                          setError(null);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-gray-700/50 last:border-0"
                      >
                        {email}
                      </button>
                    ))
                  ) : null}

                  {/* Sugerencias de dominio si el usuario tipeó @ */}
                  {correo.includes('@') && !selectedEmail && (
                    <div>
                      {foundEmails.length > 0 && (
                        <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-medium border-b border-gray-700/50">
                          Dominios
                        </div>
                      )}
                      {(() => {
                        const localPart = correo.split('@')[0] || '';
                        const typedDomain = correo.split('@')[1] || '';
                        return DOMINIOS.filter((d) =>
                          d.toLowerCase().includes(typedDomain.toLowerCase())
                        ).map((domain) => {
                          const full = `${localPart}${domain}`;
                          return (
                            <button
                              key={domain}
                              type="button"
                              onClick={() => {
                                setSelectedEmail(full);
                                setCorreo(full);
                                setShowResults(false);
                                setCodeResult(null);
                                setError(null);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors font-mono"
                            >
                              {full}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* Empty state: sin resultados ni sugerencias */}
                  {!searchingEmail && foundEmails.length === 0 && !correo.includes('@') && (
                    <div className="px-4 py-3 text-gray-500 text-sm">
                      Escribí el correo del cliente
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Caso */}
          <div>
            <label className="block text-sm text-gray-300 font-semibold mb-1.5">Caso</label>
            <select
              value={caso}
              onChange={(e) => { setCaso(e.target.value); setCodeResult(null); setError(null); }}
              className="input-field"
              disabled={extracting}
            >
              <option value="" className="bg-gray-800 text-gray-400">Selecciona un caso</option>
              {CASOS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-gray-800 text-white">{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={extracting || cooldown > 0 || !(selectedEmail || correo.trim()) || !caso}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extracting ? (
                <><Loader size={16} className="animate-spin" /> Extrayendo...</>
              ) : cooldown > 0 ? (
                <><Loader size={16} className="animate-spin" /> Esperar {cooldown}s</>
              ) : (
                <><Search size={16} /> Consultar</>
              )}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={extracting}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all disabled:opacity-50"
            >
              <X size={16} /> Limpiar
            </button>
          </div>
        </form>

        {/* Steps */}
        <div className="mx-5 mb-5 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs leading-relaxed">
          PASOS A SEGUIR:
          <br /><br />
          1. Solicita el código desde el dispositivo con el cual intentaste entrar.
          <br />
          2. Selecciona el caso que deseas consultar.
          <br />
          3. Da clic en buscar.
          <br />
          4. El código puede tardar de 2 a 3 minutos en llegar. Verifica también que la hora de llegada coincida con la vigencia esperada.
        </div>
      </div>

      {/* Result */}
      <AnimatePresence>
        {codeResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-6 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Resultado</h3>

              {/* Code display */}
              <div className={`rounded-xl p-5 mb-4 ${
                codeResult.success
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                  : 'bg-gray-700 border border-gray-600'
              }`}>
                <p className={`text-sm font-medium mb-1 ${
                  codeResult.success ? 'text-yellow-100' : 'text-gray-400'
                }`}>
                  {codeResult.success ? 'Código de verificación' : 'No se encontró el código'}
                </p>
                <p className={`font-black tracking-wider ${
                  codeResult.success
                    ? 'text-white text-3xl sm:text-4xl'
                    : 'text-gray-400 text-sm'
                }`}>
                  {codeResult.success ? codeResult.code : 'Revisá el contenido del correo para más detalles'}
                </p>
              </div>

              {/* Copy (solo si hay código) */}
              {codeResult.success && codeResult.code && (
                <button
                  onClick={() => handleCopyCode(codeResult.code)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium text-sm transition-colors mb-4"
                >
                  {copied ? (
                    <><CheckCircle2 size={16} className="text-green-400" /> Copiado</>
                  ) : (
                    <><Copy size={16} /> Copiar código</>
                  )}
                </button>
              )}

              {/* Meta info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Estado</span>
                  <p className="text-white font-semibold mt-1 flex items-center gap-1">
                    {codeResult.success ? (
                      <><CheckCircle2 size={14} className="text-green-400" /> Extraído</>
                    ) : (
                      <><AlertCircle size={14} className="text-amber-400" /> No encontrado</>
                    )}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Correo</span>
                  <p className="text-white font-semibold mt-1 text-sm truncate">{codeResult.from}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Fecha</span>
                  <p className="text-white font-semibold mt-1 text-sm">
                    {new Date(codeResult.extractedAt).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">Asunto</span>
                  <p className="text-white font-semibold mt-1 text-sm truncate">{codeResult.subject}</p>
                </div>
              </div>

              {/* Email body */}
              <details className="mt-4">
                <summary className="text-sm text-gray-400 hover:text-gray-300 font-medium cursor-pointer flex items-center gap-2">
                  <Mail size={14} />
                  Ver contenido del correo
                </summary>
                <pre className="mt-2 p-4 bg-white/5 rounded-lg text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-white/10">
                  {codeResult.bodyText}
                </pre>
              </details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConsultarCodigo;
