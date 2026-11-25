import { useEffect, useState } from 'react';
import { customAdminCallable } from '../../services/apiClient';

const emptyKeys = { publicKey: '', privateKey: '', integritySecret: '', eventsSecret: '' };
export function WompiSettings({ tenantId }: { tenantId?: string | null }) {
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState('test');
  const [keys, setKeys] = useState(emptyKeys);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setReady(false); setKeys(emptyKeys); setEnabled(false); setMessage('');
    if (tenantId) customAdminCallable<{ enabled: boolean; environment: string; publicKey: string }>('getWompiConfig', { tenantId })
      .then(result => {
        if (!active) return;
        setEnabled(result.data.enabled); setEnvironment(result.data.environment);
        setKeys({ ...emptyKeys, publicKey: result.data.publicKey }); setReady(true);
      }).catch(() => { if (active) setMessage('No se pudo consultar la configuración Wompi.'); });
    return () => { active = false; };
  }, [tenantId]);
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      await customAdminCallable('saveWompiConfig', { tenantId, enabled, environment, ...keys });
      setKeys({ ...emptyKeys, publicKey: keys.publicKey });
      setMessage('Configuración guardada. QR y transferencia siguen disponibles.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo guardar Wompi.'); }
    finally { setBusy(false); }
  };
  return <section className="glass-card p-6 mt-6 space-y-4" aria-label="Configuración Wompi">
    <h2 className="text-xl font-bold">Wompi opcional para esta tienda</h2>
    <p className="text-sm text-gray-400">Usá las llaves del comercio de esta tienda. Los secretos se guardan sólo en el servidor y no se vuelven a mostrar. Dejalos vacíos para conservarlos; al cambiar de ambiente ingresá todas las llaves correspondientes.</p>
    <fieldset disabled={!ready || busy} className="space-y-3">
      <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Habilitar Wompi</label>
      <label className="block">Ambiente <select className="bg-gray-900 p-2" value={environment} onChange={e => setEnvironment(e.target.value)}>
        <option value="test">Sandbox (sin saldo real)</option><option value="prod">Producción</option>
      </select></label>
      {(Object.keys(emptyKeys) as Array<keyof typeof emptyKeys>).map(field => <label key={field} className="block">
        {{ publicKey: 'Llave pública', privateKey: 'Llave privada', integritySecret: 'Secreto de integridad', eventsSecret: 'Secreto de eventos' }[field]}
        <input className="block w-full bg-white/5 border border-white/10 rounded-lg p-3" type={field === 'publicKey' ? 'text' : 'password'}
          autoComplete="off" value={keys[field]} onChange={e => setKeys({ ...keys, [field]: e.target.value })} />
      </label>)}
      <button type="button" onClick={save} className="rounded-lg bg-primary-600 p-3">{busy ? 'Guardando…' : 'Guardar Wompi'}</button>
    </fieldset>
    <p className="text-xs text-gray-400">Webhook del ambiente: /api/wompi/events/{environment}. Configurarlo en Wompi requiere una URL HTTPS pública y validación posterior autorizada.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
