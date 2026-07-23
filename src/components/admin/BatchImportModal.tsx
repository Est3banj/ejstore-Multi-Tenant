import { useState } from 'react';
import Modal from '../Modal';
import { Loader, CheckCircle, XCircle } from 'lucide-react';
import { createAccountsBatch } from '../../services/marketplace';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string;
}

interface ParsedLine {
  email: string;
  password: string;
  label: string;
  extras: string;
  raw: string;
}

interface ImportResult {
  created: number;
  failed: { line: string; error: string }[];
}

const BatchImportModal = ({ isOpen, onClose, serviceId }: BatchImportModalProps) => {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleParse = () => {
    const lines = text.split('\n').filter(l => l.trim());
    const parsedLines: ParsedLine[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const parts = trimmed.includes('|') ? trimmed.split('|') : trimmed.split(':');

      parsedLines.push({
        email: parts[0]?.trim() || '',
        password: parts[1]?.trim() || '',
        label: parts[2]?.trim() || '',
        extras: parts[3]?.trim() || '',
        raw: trimmed,
      });
    }

    setParsed(parsedLines);
    setResult(null);
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const lines = parsed.map(p => p.raw);
      const res = await createAccountsBatch(serviceId, lines);
      setResult(res);
      if (res.failed.length === 0) {
        setText('');
        setParsed([]);
      }
    } catch (error) {
      console.error('Error importing batch:', error);
      setResult({ created: 0, failed: [{ line: '', error: (error as Error).message }] });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setParsed([]);
    setResult(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Carga por lote" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-2">
            Pegar cuentas (formato: email:password:label:extras — una por linea)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 resize-none font-mono text-sm"
            placeholder={"email1@ejemplo.com:pass123:Cuenta 1:perfil:1\nemail2@ejemplo.com:pass456:Cuenta 2:perfil:2"}
            disabled={!!result && result.failed.length === 0}
          />
        </div>

        {parsed.length === 0 && (
          <button
            onClick={handleParse}
            disabled={!text.trim()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            Parsear
          </button>
        )}

        {parsed.length > 0 && !result && (
          <>
            <div className="glass p-4 rounded-xl">
              <p className="text-white font-medium mb-2">Vista previa ({parsed.length} cuentas)</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {parsed.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-white/40">{i + 1}.</span>
                    <span className="text-white/70">{p.email}</span>
                    {p.label && <span className="text-white/40">({p.label})</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setParsed([]); setResult(null); }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {importing && <Loader className="w-4 h-4 animate-spin" />}
                Importar {parsed.length} cuentas
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="glass p-4 rounded-xl">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle size={18} />
                <span className="font-medium">Se importaron {result.created} cuentas</span>
              </div>
              {result.failed.length > 0 && (
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <XCircle size={18} />
                  <span className="font-medium">{result.failed.length} fallaron</span>
                </div>
              )}
            </div>

            {result.failed.length > 0 && (
              <div className="glass p-4 rounded-xl">
                <p className="text-red-400 font-medium mb-2">Errores:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.failed.map((f, i) => (
                    <div key={i} className="text-sm text-white/70">
                      <span className="text-red-400">Linea:</span> {f.line}
                      <br />
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
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BatchImportModal;
