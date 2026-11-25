import { useEffect, useRef, useState } from 'react';
import { customCallable, customAdminCallable } from '../services/apiClient';

interface Props { amount: string; tenantId?: string; rechargeId?: string; panel?: boolean }

export function WompiPaymentOption({ amount, tenantId, rechargeId, panel = false }: Props) {
  const [available, setAvailable] = useState(false);
  const [environment, setEnvironment] = useState('');
  const [checkout, setCheckout] = useState('');
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [loading, setLoading] = useState(false);
  const key = useRef(crypto.randomUUID());
  const attemptAmount = useRef(amount);
  const generation = useRef(0);
  const callable = panel ? customAdminCallable : customCallable;

  useEffect(() => {
    let active = true;
    setAvailable(false); setCheckout(''); setError(''); setAvailabilityError('');
    callable<{ enabled: boolean; environment?: string }>('getWompiAvailability', { tenantId, ...(rechargeId ? { rechargeId } : {}) })
      .then(result => {
        if (active) { setAvailable(result.data.enabled === true); setEnvironment(result.data.environment || ''); }
      }).catch(() => { if (active) setAvailabilityError('No se pudo consultar Wompi. Podés seguir usando QR o transferencia.'); });
    return () => { active = false; };
  }, [tenantId, rechargeId, callable]);

  useEffect(() => {
    generation.current++; setCheckout(''); setError(''); setLoading(false);
    return () => { generation.current++; };
  }, [amount, rechargeId, tenantId, panel]);
  if (!available) return availabilityError ? <p role="alert" className="text-sm text-amber-300">{availabilityError}</p> : null;

  const prepare = async () => {
    if (!rechargeId && (!/^\d+$/.test(amount.trim()) || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1000)) {
      setError('Ingresá un monto válido (mínimo $1,000 COP).'); return;
    }
    if (attemptAmount.current !== amount) { key.current = crypto.randomUUID(); attemptAmount.current = amount; }
    setLoading(true); setError('');
    const current = generation.current;
    try {
      const result = await callable<{ checkoutUrl: string }>('createWompiCheckout', {
        tenantId, ...(rechargeId ? { rechargeId } : { amount: Number(amount), idempotencyKey: key.current }),
      });
      const url = new URL(result.data.checkoutUrl);
      if (url.origin !== 'https://checkout.wompi.co' || url.pathname !== '/p/') throw new Error('Checkout inválido');
      if (generation.current === current) setCheckout(url.href);
    } catch (err) { if (generation.current === current) setError(err instanceof Error ? err.message : 'No se pudo preparar el pago.'); }
    finally { if (generation.current === current) setLoading(false); }
  };

  return <div className="space-y-2">
    {checkout ? <a className="block w-full rounded-xl border border-white/20 p-4 text-center text-white"
      href={checkout} target="_blank" rel="noopener noreferrer">Continuar al checkout de Wompi</a>
      : <button type="button" disabled={loading} onClick={prepare}
        className="w-full rounded-xl border border-white/20 p-4 text-white disabled:opacity-50">
        {loading ? 'Preparando pago…' : rechargeId ? 'Retomar pago Wompi' : 'Pagar con Wompi'}
      </button>}
    <p className="text-xs text-white/60">{environment === 'test'
      ? 'Sandbox: pago de prueba. No acredita saldo real.'
      : 'El saldo se acredita sólo después de la confirmación verificada del pago.'}</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}
