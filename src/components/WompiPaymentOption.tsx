import { useEffect, useRef, useState } from 'react';
import { customCallable, customAdminCallable } from '../services/apiClient';
import { getWompiWidgetController, loadWompiWidget, openWompiWidget, prepareWompiWidget, type WompiWidgetController } from '../utils/wompiWidget';
import type { WompiCheckoutResponse } from '../types/wompi';
import { useAuthStore } from '../store/authStore';
import { auth, adminAuth } from '../services/firebase';
import { WompiAmounts, formatWompiAmount, type WompiFeeQuote } from './WompiAmounts';
import { RechargeConditions } from './RechargeConditions';
import { WompiPaymentResult, type WompiFinalStatus } from './WompiPaymentResult';
import { RechargeResultContent } from './RechargeResultContent';

type PreparedPayment = ReturnType<typeof prepareWompiWidget>;
type PaymentView = 'idle' | 'checking' | 'pending' | 'unavailable' | WompiFinalStatus;
// Ephemeral hints only: every restoration is reconciled against authenticated
// history. Weak ownership prevents a checkout leaking into another session.
const recentPayments = new WeakMap<object, Map<string, { payment: PreparedPayment; quote: WompiFeeQuote }>>();

export function hasRecentWompiPayment(uid: string | undefined, role: string | null, tenantId?: string, panel = false) {
  const firebaseSession = panel ? adminAuth : auth;
  return !!firebaseSession.currentUser && !!recentPayments.get(firebaseSession.currentUser)?.has(`${uid || ''}:${panel ? role || '' : ''}:${tenantId || ''}:${panel}`);
}

export type WompiAvailability = 'loading' | 'available' | 'disabled' | 'error';
interface Props { amount: string; tenantId?: string; rechargeId?: string; panel?: boolean; active?: boolean; hideAmounts?: boolean; onRetry?: () => void; onResolved?: (status: WompiFinalStatus, baseAmount: number) => void; onStatusChange?: (status: WompiFinalStatus) => void; onAvailabilityChange?: (status: WompiAvailability) => void }

export function WompiPaymentOption({ amount, tenantId, rechargeId: existingRechargeId, panel = false, active = true, hideAmounts = false, onRetry, onResolved, onStatusChange, onAvailabilityChange }: Props) {
  const [newFlow, setNewFlow] = useState(false);
  const rechargeId = newFlow ? undefined : existingRechargeId;
  const [available, setAvailable] = useState(false);
  const [environment, setEnvironment] = useState('');
  const [checkout, setCheckout] = useState('');
  const [quote, setQuote] = useState<WompiFeeQuote | null>(null);
  const [quoteHash, setQuoteHash] = useState('');
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<ReturnType<typeof prepareWompiWidget> | null>(null);
  const [fallback, setFallback] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const widgetController = useRef<WompiWidgetController>();
  const providerDialogOpen = widgetOpen && !!widgetController.current?.isOpen();
  const [view, setView] = useState<PaymentView>('idle');
  const [dismissed, setDismissed] = useState(false);
  const [pendingNotice, setPendingNotice] = useState(false);
  const paymentFinal = ['approved', 'sandbox_approved', 'rejected'].includes(view);
  const { user: clientUser, adminUser, role } = useAuthStore();
  // The caller's explicit surface chooses the identity. A concurrently signed-in
  // panel must never turn a customer checkout into a reseller checkout.
  const user = panel ? adminUser : clientUser;
  const firebaseSession = panel ? adminAuth : auth;
  const session = `${user?.uid || ''}:${panel ? role || '' : ''}`;
  const liveSession = useRef(session); liveSession.current = session;
  const context = `${session}:${tenantId}:${panel}:${amount}:${active}:${rechargeId}`;
  const liveContext = useRef(context); liveContext.current = context;
  const [stateContext, setStateContext] = useState(context);
  // Hide an old account/tenant's view during the render before reset effects
  // run, including an already-approved result (not only late HTTP responses).
  useEffect(() => { setStateContext(context); }, [context]);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  const deadlineTimer = useRef<ReturnType<typeof setTimeout>>();
  const pollExpired = useRef(false);
  const lastStatus = useRef<string>();
  const statusRequest = useRef(0);
  const inFlight = useRef<{ generation: number; promise: Promise<string | undefined> }>();
  const key = useRef(crypto.randomUUID());
  const attemptAmount = useRef(amount);
  const generation = useRef(0);
  const busy = useRef(false);
  const callable = panel ? customAdminCallable : customCallable;
  const scope = `${session}:${tenantId || ''}:${panel}`;
  const remember = (prepared: PreparedPayment, receipt: WompiFeeQuote) => {
    if (!firebaseSession.currentUser) return;
    let entries = recentPayments.get(firebaseSession.currentUser);
    if (!entries) { entries = new Map(); recentPayments.set(firebaseSession.currentUser, entries); }
    entries.set(scope, { payment: prepared, quote: receipt });
  };

  useEffect(() => {
    let active = true;
    onAvailabilityChange?.('loading');
    setAvailable(false); setCheckout(''); setQuote(null); setError(''); setAvailabilityError('');
    callable<{ enabled: boolean; environment?: string }>('getWompiAvailability', { tenantId, ...(rechargeId ? { rechargeId } : {}) })
      .then(result => {
        if (active) { setAvailable(result.data.enabled === true); setEnvironment(result.data.environment || ''); onAvailabilityChange?.(result.data.enabled === true ? 'available' : 'disabled'); }
      }).catch(() => { if (active) { setAvailabilityError('No se pudo consultar Wompi. Podés seguir usando QR o transferencia.'); onAvailabilityChange?.('error'); } });
    return () => { active = false; };
  }, [tenantId, rechargeId, callable, onAvailabilityChange, session]);

  useEffect(() => {
    generation.current++; busy.current = false;
    widgetController.current = undefined;
    setCheckout(''); setPayment(null); setFallback(false); setWidgetOpen(false); setView('idle'); setDismissed(false); setPendingNotice(false); lastStatus.current = undefined;
    setQuote(null); setQuoteHash(''); setError(''); setLoading(false);
    key.current = crypto.randomUUID();
    return () => { generation.current++; clearTimeout(pollTimer.current); clearTimeout(deadlineTimer.current); };
  }, [amount, rechargeId, tenantId, panel, session]);
  useEffect(() => {
    // Switching to QR invalidates only outstanding UI work. It never cancels a
    // committed payment or writes a synthetic cancellation on browser events.
    if (!active) { generation.current++; busy.current = false; setLoading(false); setView('idle'); setPendingNotice(false); lastStatus.current = undefined; clearTimeout(pollTimer.current); clearTimeout(deadlineTimer.current); }
  }, [active]);

  useEffect(() => {
    if (!available || !active) return;
    const remembered = firebaseSession.currentUser && recentPayments.get(firebaseSession.currentUser)?.get(scope);
    const prepared = payment || remembered?.payment;
    if (!prepared || (rechargeId && prepared.config.reference !== rechargeId)) return;
    widgetController.current = getWompiWidgetController(prepared.config);
    setWidgetOpen(!!widgetController.current?.isOpen());
    if (!payment && remembered) {
      setPayment(prepared); setQuote(remembered.quote); setCheckout(prepared.url); setEnvironment(prepared.environment);
    }
    const valid = guard();
    void readStatus(prepared, valid);
    return widgetController.current?.onClosed(() => {
      if (valid()) { setWidgetOpen(false); void readStatus(prepared, valid); }
    });
    // Reconcile on activation/restoration; callback and explicit refresh handle an
    // already mounted payment. Never restart a poll because its view changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, active, scope]);

  useEffect(() => {
    if (!active || !available || !payment) return;
    const valid = guard();
    const refresh = (event: Event) => {
      // Moving focus out of a cross-origin iframe into our native result also
      // focuses the window. It is not a return from an external authorization.
      if (document.visibilityState === 'visible' && !(event.type === 'focus' && document.querySelector('dialog[data-wompi-result][open]')) && valid()) void readStatus(payment, valid);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, available, payment, context]);

  useEffect(() => {
    if (paymentFinal && active && stateContext === context) onStatusChange?.(view as WompiFinalStatus);
  }, [paymentFinal, active, view, onStatusChange, stateContext, context]);

  useEffect(() => {
    if (!paymentFinal || !active || stateContext !== context) return;
    if (widgetController.current?.isOpen()) { widgetController.current.close(); return; }
    if (quote && !widgetOpen && onResolved) {
      if (firebaseSession.currentUser) recentPayments.get(firebaseSession.currentUser)?.delete(scope);
      onResolved(view as WompiFinalStatus, quote.baseAmount);
    }
  }, [paymentFinal, active, stateContext, context, widgetOpen, view, quote, onResolved, scope]);

  const guard = () => {
    const current = generation.current, owner = liveSession.current, firebaseUser = firebaseSession.currentUser, capturedContext = context;
    return () => generation.current === current && liveSession.current === owner && liveContext.current === capturedContext && firebaseSession.currentUser === firebaseUser;
  };

  const readStatus = async (prepared: NonNullable<typeof payment>, valid: () => boolean, attempt = 0) => {
    if (!valid()) return;
    if (lastStatus.current && ['approved', 'sandbox_approved', 'rejected'].includes(lastStatus.current)) return lastStatus.current;
    if (inFlight.current?.generation === generation.current) return inFlight.current.promise;
    clearTimeout(pollTimer.current);
    if (attempt === 0) {
      clearTimeout(deadlineTimer.current); pollExpired.current = false;
      // Bound the UI wait independently of SDK callbacks and HTTP latency.
      // A missing answer is unavailable, never an invented payment outcome.
      deadlineTimer.current = setTimeout(() => {
        if (!valid()) return;
        pollExpired.current = true; clearTimeout(pollTimer.current);
        setView(previous => ['approved', 'sandbox_approved', 'rejected'].includes(previous) ? previous : lastStatus.current === 'pending' ? 'pending' : 'unavailable');
        if (lastStatus.current === 'pending') setPendingNotice(true);
      }, 75000);
    }
    const request = ++statusRequest.current;
    setView(previous => ['approved', 'sandbox_approved', 'rejected', 'pending'].includes(previous) ? previous : 'checking');
    const promise = (async () => { try {
      // An SDK id is only a locator. Only the backend can verify its merchant,
      // frozen total and reference and invoke the same settlement as a webhook.
      {
        try {
          await callable('reconcileWompiPayment', { tenantId, rechargeId: prepared.config.reference,
            ...(prepared.transactionId ? { transactionId: prepared.transactionId } : {}) });
          if (!valid()) return;
          setError('');
        } catch {
          if (!valid()) return;
          setError('No pudimos verificar con Wompi. Conservamos tu pago; volvé a actualizar el estado.');
        }
      }
      const response = await callable<{ recharges: Array<{ id: string; status: string; userId?: string; tenantId?: string; provider?: string }> }>('getRechargeHistory', {});
      if (!valid() || request !== statusRequest.current) return;
      const row = response.data.recharges?.find(row => row.id === prepared.config.reference && row.provider === 'wompi' && row.tenantId === tenantId && row.userId === user?.uid);
      const status = row?.status;
      if (!status || !['pending', 'approved', 'sandbox_approved', 'rejected'].includes(status)) { lastStatus.current = undefined; clearTimeout(deadlineTimer.current); setView('unavailable'); return; }
      lastStatus.current = status;
      // A test checkout can never claim real credit, even with an inconsistent
      // older server projection. Its signed environment remains frozen.
      setView(status === 'approved' && prepared.environment === 'test' ? 'sandbox_approved' : status as PaymentView);
      if (status !== 'pending') { clearTimeout(deadlineTimer.current); setPendingNotice(false); }
      else if (!pollExpired.current && attempt < 6) {
        pollTimer.current = setTimeout(() => { if (valid()) void readStatus(prepared, valid, attempt + 1); }, [3000, 6000, 12000, 15000, 15000, 15000][attempt]);
      } else {
        clearTimeout(deadlineTimer.current); setPendingNotice(true);
      }
      return status;
    } catch { if (valid() && request === statusRequest.current) { clearTimeout(deadlineTimer.current); lastStatus.current = undefined; setView('unavailable'); } }
    finally { if (request === statusRequest.current) inFlight.current = undefined; }
    })();
    inFlight.current = { generation: generation.current, promise };
    return promise;
  };

  const launch = async (prepared: NonNullable<typeof payment>, valid: () => boolean) => {
    // Reconcile at handoff even if the SDK never calls back or its iframe fails.
    void readStatus(prepared, valid);
    try {
      await loadWompiWidget();
      if (!valid()) return;
      if (lastStatus.current && ['approved', 'sandbox_approved', 'rejected'].includes(lastStatus.current)) return;
      setFallback(false); setWidgetOpen(true);
      widgetController.current = openWompiWidget(prepared.config, result => {
        if (valid()) {
          const transaction = result?.transaction;
          if (typeof transaction?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(transaction.id)) prepared.transactionId = transaction.id;
          if (!widgetController.current?.isOpen()) setWidgetOpen(false);
          void readStatus(prepared, valid);
        }
      }, () => {
        if (valid()) { setWidgetOpen(false); void readStatus(prepared, valid).then(status => { if (valid() && status === 'pending') setPendingNotice(true); }); }
      });
      setWidgetOpen(widgetController.current.isOpen());
    } catch {
      if (valid()) { setWidgetOpen(false); setFallback(true); throw new Error('No se pudo abrir Wompi. Tu recarga quedó pendiente; podés retomarla desde acá o desde el historial.'); }
    }
  };

  const reopen = async () => {
    if (!payment || paymentFinal || busy.current || widgetOpen || !active) return;
    busy.current = true; setLoading(true); setError('');
    const valid = guard();
    try { if (await readStatus(payment, valid) === 'pending' && valid()) await launch(payment, valid); }
    catch (error) { if (valid()) setError(error instanceof Error ? error.message : 'No se pudo abrir Wompi.'); }
    finally { if (valid()) { busy.current = false; setLoading(false); } }
  };

  const prepare = async () => {
    if (busy.current || !active) return;
    if (!rechargeId && (!/^\d+$/.test(amount.trim()) || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1000)) {
      setError('Ingresá un monto válido (mínimo $1,000 COP).'); return;
    }
    if (attemptAmount.current !== amount) { key.current = crypto.randomUUID(); attemptAmount.current = amount; }
    busy.current = true; setLoading(true); setError('');
    const valid = guard();
    try {
      if (rechargeId) {
        // A page reload has no signed checkout in memory. Read the owned row
        // BEFORE asking for its frozen configuration: the webhook may have won.
        setView('checking');
        const history = await callable<{ recharges: Array<{ id: string; userId?: string; tenantId?: string; provider?: string; status: string; amount: number; environment?: string; feeQuote?: WompiFeeQuote }> }>('getRechargeHistory', {});
        if (!valid()) return;
        const row = history.data.recharges?.find(row => row.id === rechargeId && row.userId === user?.uid && row.tenantId === tenantId && row.provider === 'wompi');
        if (!row || !['pending', 'approved', 'sandbox_approved', 'rejected'].includes(row.status)) { setView('unavailable'); return; }
        if (row.status !== 'pending') {
          const receipt = row.feeQuote || { version: 1, currency: 'COP', baseAmount: row.amount, processingFee: 0, totalAmount: row.amount };
          if (!Number.isSafeInteger(receipt.baseAmount) || receipt.baseAmount < 1000 || (row.status === 'approved' && !['test', 'prod'].includes(row.environment || ''))) { setView('unavailable'); return; }
          setQuote(receipt); setEnvironment(row.environment || '');
          setView(row.status === 'approved' && row.environment === 'test' ? 'sandbox_approved' : row.status as WompiFinalStatus);
          return;
        }
        setView('idle');
      }
      const result = await callable<WompiCheckoutResponse & { quoteHash?: string }>(rechargeId ? 'createWompiCheckout' : 'getWompiQuote', {
        tenantId, ...(rechargeId ? { rechargeId } : { amount: Number(amount) }),
      });
      if (!valid()) return;
      const prepared = rechargeId ? prepareWompiWidget(result.data, window.location.origin, tenantId, panel) : null;
      if (prepared && prepared.config.reference !== rechargeId) throw new Error('Detalle del pago Wompi inválido.');
      const url = prepared?.url || '';
      const cents = url ? Number(new URL(url).searchParams.get('amount-in-cents')) : (result.data.feeQuote?.totalAmount ?? NaN) * 100;
      // Old API compatibility derives the legacy total from the signed URL,
      // never from the editable input (especially when resuming).
      const received = result.data.feeQuote ?? (rechargeId ? { version: 1, currency: 'COP', baseAmount: cents / 100, processingFee: 0, totalAmount: cents / 100 } : null);
      if (!received || (!rechargeId && !/^[a-f0-9]{64}$/.test(result.data.quoteHash || '')) || received.version !== 1 || received.currency !== 'COP' ||
          !Number.isSafeInteger(received.baseAmount) || received.baseAmount < 1000 ||
          (!rechargeId && received.baseAmount !== Number(amount)) ||
          !Number.isSafeInteger(received.processingFee) || received.processingFee < 0 ||
          !Number.isSafeInteger(cents) || cents !== received.totalAmount * 100 ||
          received.totalAmount !== received.baseAmount + received.processingFee) throw new Error('Detalle del pago Wompi inválido.');
      if (valid()) {
        setQuote(received); setQuoteHash(result.data.quoteHash || ''); setCheckout(url);
        setPayment(prepared);
        if (prepared) remember(prepared, received);
        if (result.data.environment) setEnvironment(result.data.environment);
      }
    } catch (err) { if (valid()) { if (rechargeId) setView('unavailable'); setError(err instanceof Error ? err.message : 'No se pudo preparar el pago.'); } }
    finally { if (valid()) { busy.current = false; setLoading(false); } }
  };

  const continueCheckout = async () => {
    if (busy.current || !active || !quote || !quoteHash || quote.baseAmount !== Number(amount)) return;
    busy.current = true; setLoading(true); setError('');
    const valid = guard();
    try {
      // The ONLY new-intent write is this explicit final click. Keep the key
      // across uncertain network errors so a retry cannot duplicate the intent.
      const result = await callable<WompiCheckoutResponse>('createWompiCheckout', {
        tenantId, amount: quote.baseAmount, idempotencyKey: key.current, expectedQuoteHash: quoteHash,
      });
      if (!valid()) return;
      const prepared = prepareWompiWidget(result.data, window.location.origin, tenantId, panel);
      const url = prepared.url;
      if (result.data.feeQuote?.version !== quote.version || result.data.feeQuote?.currency !== quote.currency ||
          result.data.feeQuote?.baseAmount !== quote.baseAmount || result.data.feeQuote?.processingFee !== quote.processingFee || result.data.feeQuote?.totalAmount !== quote.totalAmount ||
          Number(new URL(url).searchParams.get('amount-in-cents')) !== quote.totalAmount * 100) throw new Error('Detalle del pago Wompi inválido. Revisá tu pendiente en el historial.');
      setCheckout(url);
      setPayment(prepared); setEnvironment(prepared.environment);
      remember(prepared, quote);
      await launch(prepared, valid);
    } catch (err) {
      if (valid()) {
        const message = err instanceof Error ? err.message : 'No se pudo continuar con Wompi. Revisá el historial antes de reintentar.';
        setError(message);
        if (message.includes('El total cambió')) { setQuote(null); setQuoteHash(''); }
      }
    } finally { if (valid()) { busy.current = false; setLoading(false); } }
  };

  const retry = () => {
    if (firebaseSession.currentUser) recentPayments.get(firebaseSession.currentUser)?.delete(scope);
    generation.current++; clearTimeout(pollTimer.current); clearTimeout(deadlineTimer.current); busy.current = false;
    key.current = crypto.randomUUID();
    setPayment(null); setQuote(null); setQuoteHash(''); setCheckout(''); setView('idle'); setDismissed(false); setPendingNotice(false); lastStatus.current = undefined; setError(''); setLoading(false); setFallback(false);
    setNewFlow(true);
    onRetry?.();
  };
  const dismissResult = () => { setDismissed(true); if (firebaseSession.currentUser) recentPayments.get(firebaseSession.currentUser)?.delete(scope); };
  if (stateContext !== context) return null;
  if (!available) return availabilityError && !onAvailabilityChange ? <p role="alert" className="text-sm text-amber-300">{availabilityError}</p> : null;
  return <div className="space-y-3">
    {environment === 'test' && <span className="inline-block rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-300">Prueba</span>}
    {quote && !hideAmounts && <WompiAmounts amount={quote.baseAmount} feeQuote={quote} environment={environment} status={view} />}
    <RechargeConditions />
    {onResolved && view === 'pending' && pendingNotice && !providerDialogOpen ? <RechargeResultContent success={false} pending title="Recarga en proceso" message="El servidor aún no confirmó el pago. Consultá el estado en el historial. No repitas el pago.">{null}</RechargeResultContent> : view !== 'idle' && <div role="status" aria-hidden={providerDialogOpen || undefined} aria-live={providerDialogOpen ? 'off' : 'polite'} aria-busy={view === 'checking'} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
      {view === 'checking' && !widgetOpen && <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400 motion-reduce:animate-none" />}
      <span>{view === 'checking' ? 'Estamos verificando tu pago…' : view === 'pending' ? 'Esperando confirmación Wompi. Podés cerrar y volver después.' : view === 'unavailable' ? 'No pudimos consultar el estado. Actualizá antes de continuar.' : view === 'sandbox_approved' ? 'Prueba aprobada sin saldo real' : view === 'approved' ? 'Pago aprobado' : 'Pago rechazado'}</span>
    </div>}
    {paymentFinal ? null : payment && quote ? <button type="button" disabled={loading || widgetOpen || view === 'checking'} onClick={reopen}
      className="block w-full touch-manipulation select-none rounded-xl bg-primary-600 p-4 text-center font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 active:bg-primary-700 disabled:opacity-50">
      {view === 'checking' ? 'Verificando…' : loading ? 'Abriendo Wompi…' : widgetOpen ? 'Wompi abierto' : view === 'idle' ? `Continuar a Wompi por ${formatWompiAmount(quote.totalAmount)}` : 'Volver a Wompi'}</button>
      : quote ? <button type="button" disabled={loading} onClick={continueCheckout}
        className="w-full touch-manipulation select-none rounded-xl bg-primary-600 p-4 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 active:bg-primary-700 disabled:opacity-50">
        {loading ? 'Abriendo Wompi…' : `Continuar a Wompi por ${formatWompiAmount(quote.totalAmount)}`}
      </button>
      : <button type="button" disabled={loading} onClick={prepare}
        className="w-full touch-manipulation select-none rounded-xl bg-primary-600 p-4 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 active:bg-primary-700 disabled:opacity-50">
        {loading ? 'Consultando total…' : rechargeId ? 'Retomar pago Wompi' : 'Ver total'}
      </button>}
    {payment && <div className="flex flex-wrap items-center gap-3 text-sm">
      <a className="touch-manipulation rounded p-2 text-primary-300 underline focus-visible:outline" href={payment.history}>Ver estado en historial</a>
      <button type="button" data-wompi-status-refresh className="touch-manipulation select-none rounded p-2 text-gray-300 focus-visible:outline active:bg-white/10" onClick={() => { void readStatus(payment, guard()); }}>Actualizar estado</button>
    </div>}
    {quote && active && !onResolved && ((paymentFinal && !dismissed) || (view === 'pending' && pendingNotice)) && <WompiPaymentResult key={view} status={view as WompiFinalStatus | 'pending'} baseAmount={quote.baseAmount} onClose={paymentFinal ? dismissResult : () => setPendingNotice(false)} onRetry={retry} canRetry={!widgetOpen} providerOpen={providerDialogOpen} />}
    {view === 'rejected' && dismissed && <button type="button" disabled={widgetOpen} onClick={retry} className="min-h-[44px] w-full touch-manipulation select-none rounded-xl bg-primary-600 p-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 active:bg-primary-700 disabled:opacity-50">Volver a intentar</button>}
    {fallback && !paymentFinal && checkout && <a className="block touch-manipulation p-2 text-sm text-primary-300 underline" href={checkout} rel="noopener noreferrer"
      onClick={async event => {
        event.preventDefault();
        if (!payment || busy.current || !active) return;
        busy.current = true; setLoading(true);
        const valid = guard();
        try { if (await readStatus(payment, valid) === 'pending' && valid()) window.location.assign(checkout); }
        finally { if (valid()) { busy.current = false; setLoading(false); } }
      }}>Abrir checkout externo</a>}
    {import.meta.env.DEV && fallback && checkout && !new URL(checkout).searchParams.has('redirect-url') &&
      <p className="text-xs text-amber-300">Sandbox local: Wompi bloquea el retorno a localhost. Al terminar, volvé con Atrás al historial y tocá Actualizar. No crees otra recarga.</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}
