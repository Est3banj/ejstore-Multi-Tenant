import { useEffect, useRef, useState } from 'react';
import { customAdminCallable } from '../../services/apiClient';

const emptyKeys = { publicKey: '', privateKey: '', integritySecret: '', eventsSecret: '' };
const defaultPolicy = { payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 };
type FeePolicy = typeof defaultPolicy;
const policyInputs = (p: FeePolicy) => ({ rate: String(p.rateBps / 100), fixed: String(p.fixedFee), vat: String(p.vatBps / 100) });
// Decimal text -> integer units, without binary float rounding or truncation.
const parseUnits = (text: string, decimals: number) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length ?? 0) > decimals) return NaN;
  return Number(match[1] + (match[2] || '').padEnd(decimals, '0'));
};
export function WompiSettings({ tenantId }: { tenantId?: string | null }) {
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState('test');
  const [keys, setKeys] = useState(emptyKeys);
  const [feePolicies, setFeePolicies] = useState({ test: { ...defaultPolicy }, prod: { ...defaultPolicy } });
  const [inputs, setInputs] = useState({ test: policyInputs(defaultPolicy), prod: policyInputs(defaultPolicy) });
  const selectedEnvironment = environment as 'test' | 'prod';
  const changeInput = (field: 'rate' | 'fixed' | 'vat', value: string) => setInputs(previous => ({
    ...previous, [selectedEnvironment]: { ...previous[selectedEnvironment], [field]: value },
  }));
  const generation = useRef(0);
  const policy = feePolicies[environment as 'test' | 'prod'];
  const changePolicy = (patch: Partial<FeePolicy>) => setFeePolicies(previous => ({
    ...previous, [environment]: { ...previous[environment as 'test' | 'prod'], ...patch },
  }));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    generation.current++;
    setReady(false); setBusy(false); setKeys(emptyKeys); setEnabled(false); setMessage('');
    setFeePolicies({ test: { ...defaultPolicy }, prod: { ...defaultPolicy } });
    setInputs({ test: policyInputs(defaultPolicy), prod: policyInputs(defaultPolicy) });
    if (tenantId) customAdminCallable<{ enabled: boolean; environment: string; publicKey: string; feePolicies?: { test: FeePolicy; prod: FeePolicy } }>('getWompiConfig', { tenantId })
      .then(result => {
        if (!active) return;
        setEnabled(result.data.enabled); setEnvironment(result.data.environment);
        if (result.data.feePolicies) {
          setFeePolicies(result.data.feePolicies);
          setInputs({ test: policyInputs(result.data.feePolicies.test), prod: policyInputs(result.data.feePolicies.prod) });
        }
        setKeys({ ...emptyKeys, publicKey: result.data.publicKey }); setReady(true);
      }).catch(() => { if (active) setMessage('No se pudo consultar la configuración Wompi.'); });
    return () => { active = false; generation.current++; };
  }, [tenantId]);
  const save = async () => {
    const policies = { test: { ...feePolicies.test }, prod: { ...feePolicies.prod } };
    for (const env of ['test', 'prod'] as const) {
      const values = inputs[env];
      const next = { ...policies[env], rateBps: parseUnits(values.rate, 2), fixedFee: parseUnits(values.fixed, 0), vatBps: parseUnits(values.vat, 2) };
      if (![next.rateBps, next.fixedFee, next.vatBps].every(value => Number.isSafeInteger(value) && value >= 0) ||
          next.rateBps >= 10000 || next.fixedFee > 5000000 || next.vatBps > 10000 || next.rateBps * (10000 + next.vatBps) >= 100000000) {
        setMessage('Cargo inválido: porcentajes con hasta dos decimales, fijo en pesos enteros y comisión efectiva menor al 100%.'); return;
      }
      policies[env] = next;
    }
    const current = generation.current;
    setBusy(true); setMessage('');
    try {
      await customAdminCallable('saveWompiConfig', { tenantId, enabled, environment, ...keys, feePolicies: policies });
      if (generation.current !== current) return;
      setFeePolicies(policies);
      setKeys({ ...emptyKeys, publicKey: keys.publicKey });
      setMessage('Configuración guardada. QR y transferencia siguen disponibles.');
    } catch (err) { if (generation.current === current) setMessage(err instanceof Error ? err.message : 'No se pudo guardar Wompi.'); }
    finally { if (generation.current === current) setBusy(false); }
  };
  return <section className="glass-card p-6 mt-6 space-y-4" aria-label="Configuración Wompi">
    <h2 className="text-xl font-bold">Wompi opcional para esta tienda</h2>
    <p className="text-sm text-gray-400">Usá las llaves del comercio de esta tienda. Los secretos se guardan sólo en el servidor y no se vuelven a mostrar. Dejalos vacíos para conservarlos; al cambiar de ambiente ingresá todas las llaves correspondientes.</p>
    <fieldset disabled={!ready || busy} className="space-y-3">
      <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Habilitar Wompi</label>
      <label className="block">Ambiente <select className="bg-gray-900 p-2" value={environment} onChange={e => setEnvironment(e.target.value)}>
        <option value="test">Sandbox (sin saldo real)</option><option value="prod">Producción</option>
      </select></label>
      <fieldset className="space-y-3 border border-white/10 rounded-lg p-3">
        <legend>Cargo de procesamiento · {environment === 'test' ? 'Sandbox' : 'Producción'}</legend>
        <label className="block">Quién asume el cargo <select className="bg-gray-900 p-2" value={policy.payer} onChange={e => changePolicy({ payer: e.target.value })}>
          <option value="merchant">La tienda (sin cargo al cliente)</option>
          <option value="customer">El cliente (total visible antes de continuar)</option>
        </select></label>
        <label className="block">Comisión porcentual (%) <input type="number" min="0" max="99.99" step="0.01" value={inputs[selectedEnvironment].rate} onChange={e => changeInput('rate', e.target.value)} /></label>
        <label className="block">Comisión fija (COP) <input type="number" min="0" max="5000000" step="1" value={inputs[selectedEnvironment].fixed} onChange={e => changeInput('fixed', e.target.value)} /></label>
        <label className="block">IVA sobre la comisión (%) <input type="number" min="0" max="100" step="0.01" value={inputs[selectedEnvironment].vat} onChange={e => changeInput('vat', e.target.value)} /></label>
        <p className="text-xs text-gray-400">2,65% + $700 + IVA 19% es una referencia pública del plan Agregador, no una confirmación de tu tarifa. Usá la contratada por tu comercio; Gateway puede variar. Cada ambiente conserva su política. Sólo aplica a nuevos intentos.</p>
        <p className="text-xs text-gray-400">El cálculo estima el costo sobre el total cobrado y redondea hacia arriba al peso. El costo real puede variar según el medio elegido en Wompi. La autorización contractual para trasladar el cargo debe verificarse con tu comercio.</p>
      </fieldset>
      {(Object.keys(emptyKeys) as Array<keyof typeof emptyKeys>).map(field => <label key={field} className="block">
        {{ publicKey: 'Llave pública', privateKey: 'Llave privada', integritySecret: 'Secreto de integridad', eventsSecret: 'Secreto de eventos' }[field]}
        <input className="block w-full bg-white/5 border border-white/10 rounded-lg p-3" type={field === 'publicKey' ? 'text' : 'password'}
          placeholder={{ publicKey: `pub_${environment}_…`, privateKey: `prv_${environment}_…`, integritySecret: `${environment}_integrity_…`, eventsSecret: `${environment}_events_…` }[field]}
          autoComplete="off" value={keys[field]} onChange={e => setKeys({ ...keys, [field]: e.target.value })} />
      </label>)}
      <button type="button" onClick={save} className="rounded-lg bg-primary-600 p-3">{busy ? 'Guardando…' : 'Guardar Wompi'}</button>
    </fieldset>
    <p className="text-xs text-gray-400">Webhook del ambiente: /api/wompi/events/{environment}. Configurarlo en Wompi requiere una URL HTTPS pública y validación posterior autorizada.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
