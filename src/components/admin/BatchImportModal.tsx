import { useState } from 'react';
import Modal from '../Modal';
import { Loader, CheckCircle, XCircle, Users } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

interface ParsedAccount {
  email: string;
  password: string;
  label: string;
  profiles: Array<{ name: string; pin: string }>;
  raw: string;
}

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string;
  tenantId: string;
}

interface ImportResult {
  accountsCreated: number;
  profilesCreated: number;
  failed: Array<{ line: string; error: string }>;
}

const BatchImportModal = ({ isOpen, onClose, serviceId, tenantId }: BatchImportModalProps) => {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedAccount[]>([]);
  const [errors, setErrors] = useState<Array<{ line: string; error: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const detectSeparator = (line: string): string | null => {
    if (line.includes('|')) return '|';
    if (line.includes('\t')) return '\t';
    // Only use : if we have at least 2 colons (more reliable for email:pass detection)
    // email:pass is 1 colon, email:pass:name:pin is 3 colons
    const colonCount = (line.match(/:/g) || []).length;
    if (colonCount >= 1) return ':';
    return null;
  };

  const handleParse = () => {
    const lines = text.split('\n').filter(l => l.trim());
    const accounts: ParsedAccount[] = [];
    const errs: Array<{ line: string; error: string }> = [];
    let lastAccount: ParsedAccount | null = null;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      const lineNum = lines.indexOf(rawLine) + 1;

      // # continuation line: append profiles to previous account
      if (trimmed.startsWith('#')) {
        if (!lastAccount) {
          errs.push({ line: trimmed, error: `Línea ${lineNum}: continuación sin cuenta anterior (usa # después de una cuenta)` });
          continue;
        }
        const rest = trimmed.slice(1).trim();
        const sep = detectSeparator(rest);
        if (!sep) {
          errs.push({ line: trimmed, error: `Línea ${lineNum}: formato inválido` });
          continue;
        }
        const parts = rest.split(sep).map(s => s.trim());
        const name = parts[0] || 'Perfil';
        const pin = parts[1] || '';
        lastAccount.profiles.push({ name, pin });
        continue;
      }

      // Detect separator
      const sep = detectSeparator(trimmed);
      if (!sep) {
        errs.push({ line: trimmed, error: `Línea ${lineNum}: no se pudo detectar separador` });
        continue;
      }

      const parts = trimmed.split(sep).map(s => s.trim());
      const email = parts[0];
      const password = parts[1];

      if (!email || !password) {
        errs.push({ line: trimmed, error: `Línea ${lineNum}: email y password requeridos` });
        continue;
      }

      const colCount = parts.length;

      // Auto-detect format based on column count:
      if (colCount === 2) {
        // email:pass → 1 profile "Perfil 1" no pin
        const account: ParsedAccount = {
          email,
          password,
          label: '',
          profiles: [{ name: 'Perfil 1', pin: '' }],
          raw: trimmed,
        };
        accounts.push(account);
        lastAccount = account;
      } else if (colCount === 4) {
        // email:pass:profileName:pin → 1 named profile with pin
        const account: ParsedAccount = {
          email,
          password,
          label: parts[2] || '',
          profiles: [{ name: parts[2] || 'Perfil 1', pin: parts[3] || '' }],
          raw: trimmed,
        };
        accounts.push(account);
        lastAccount = account;
      } else if (colCount >= 6) {
        // email:pass:name1:pin1:name2:pin2:name3:pin3...
        // Profiles are in pairs starting from index 2
        const label = parts[2] || '';
        const profiles: Array<{ name: string; pin: string }> = [];
        for (let i = 2; i + 1 < parts.length; i += 2) {
          profiles.push({ name: parts[i] || `Perfil ${(i - 2) / 2 + 1}`, pin: parts[i + 1] || '' });
        }
        const account: ParsedAccount = {
          email,
          password,
          label,
          profiles: profiles.length > 0 ? profiles : [{ name: 'Perfil 1', pin: '' }],
          raw: trimmed,
        };
        accounts.push(account);
        lastAccount = account;
      } else if (colCount === 3) {
        // email:pass:label (no profiles specified) → 1 default profile
        const account: ParsedAccount = {
          email,
          password,
          label: parts[2] || '',
          profiles: [{ name: parts[2] || 'Perfil 1', pin: '' }],
          raw: trimmed,
        };
        accounts.push(account);
        lastAccount = account;
      } else {
        errs.push({ line: trimmed, error: `Línea ${lineNum}: formato no reconocido (${colCount} columnas)` });
      }
    }

    setParsed(accounts);
    setErrors(errs);
    setResult(null);
  };

  const totalProfiles = parsed.reduce((sum, a) => sum + a.profiles.length, 0);

  const handleImport = async () => {
    if (!tenantId) {
      setResult({ accountsCreated: 0, profilesCreated: 0, failed: [{ line: '', error: 'tenantId no disponible' }] });
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const cf = httpsCallable(functions, 'createAccountWithProfiles');
      const res = await cf({
        serviceId,
        tenantId,
        accounts: parsed.map(a => ({
          email: a.email,
          password: a.password,
          label: a.label,
          profiles: a.profiles,
        })),
      });
      const data = res.data as ImportResult;
      // Merge any parse-time errors with CF errors
      const allFailed = [
        ...(data.failed || []),
        ...errors.map(e => ({ line: e.line, error: e.error })),
      ];
      setResult({
        accountsCreated: data.accountsCreated,
        profilesCreated: data.profilesCreated,
        failed: allFailed,
      });
      if (allFailed.length === 0) {
        setText('');
        setParsed([]);
        setErrors([]);
      }
    } catch (error) {
      console.error('Error importing batch:', error);
      setResult({
        accountsCreated: 0,
        profilesCreated: 0,
        failed: [
          ...errors.map(e => ({ line: e.line, error: e.error })),
          { line: '', error: (error as Error).message },
        ],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setParsed([]);
    setErrors([]);
    setResult(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Carga por lote — Cuentas con Perfiles" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-2">
            Pegar cuentas — detección automática de formato
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 resize-none font-mono text-sm"
            placeholder={
              "email1@ejemplo.com:pass123\nemail2@ejemplo.com:pass456:Perfil Principal:1234\nemail3@ejemplo.com:pass789:Perfil1:1111:Perfil2:2222:Perfil3:3333\n#Perfil4:4444"
            }
            disabled={!!result && result.failed.length === 0}
          />
          <p className="text-white/40 text-xs mt-1">
            Formato: email:password (1 perfil) | email:password:perfil:pin (1 perfil con nombre) | email:password:perfil1:pin1:perfil2:pin2... (multi-perfil). Líneas con # agregan perfiles a la cuenta anterior.
          </p>
        </div>

        {parsed.length === 0 && !result && (
          <button
            onClick={handleParse}
            disabled={!text.trim()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            Parsear
          </button>
        )}

        {/* Preview */}
        {parsed.length > 0 && !result && (
          <>
            <div className="glass p-4 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-medium">Vista previa</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-white/60">{parsed.length} cuentas</span>
                  <Users size={14} className="text-white/40" />
                  <span className="text-white/60">{totalProfiles} perfiles</span>
                </div>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {parsed.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-white/5 rounded px-3 py-2">
                    <span className="text-white/70">{p.email}</span>
                    <div className="flex items-center gap-2">
                      {p.label && <span className="text-white/40 text-xs">({p.label})</span>}
                      <span className="bg-primary-500/20 text-primary-300 px-2 py-0.5 rounded-full text-xs">
                        {p.profiles.length} {p.profiles.length === 1 ? 'perfil' : 'perfiles'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Parse-time errors */}
            {errors.length > 0 && (
              <div className="glass p-4 rounded-xl border border-red-500/30">
                <p className="text-red-400 font-medium mb-2">{errors.length} líneas con errores</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {errors.map((e, i) => (
                    <div key={i} className="text-xs text-white/60">
                      <span className="text-red-400">{e.line}</span> — {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setParsed([]); setErrors([]); setResult(null); }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing || parsed.length === 0}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {importing && <Loader className="w-4 h-4 animate-spin" />}
                Importar {parsed.length} cuentas ({totalProfiles} perfiles)
              </button>
            </div>
          </>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-3">
            <div className="glass p-4 rounded-xl">
              {result.accountsCreated > 0 && (
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <CheckCircle size={18} />
                  <span className="font-medium">
                    {result.accountsCreated} cuentas importadas ({result.profilesCreated} perfiles)
                  </span>
                </div>
              )}
              {result.failed.length > 0 && (
                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                  <XCircle size={18} />
                  <span className="font-medium">{result.failed.length} con errores</span>
                </div>
              )}
              {result.accountsCreated === 0 && result.failed.length === 0 && (
                <p className="text-white/60 text-sm">No se importó nada</p>
              )}
            </div>

            {result.failed.length > 0 && (
              <div className="glass p-4 rounded-xl">
                <p className="text-red-400 font-medium mb-2">Errores:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.failed.map((f, i) => (
                    <div key={i} className="text-sm text-white/70">
                      {f.line && (
                        <>
                          <span className="text-red-400">Línea:</span> {f.line}
                          <br />
                        </>
                      )}
                      <span className="text-red-400">Error:</span> {f.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
              >
                {result.failed.length === 0 ? 'Cerrar' : 'Cerrar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BatchImportModal;
