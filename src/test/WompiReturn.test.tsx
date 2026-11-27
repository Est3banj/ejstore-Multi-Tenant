import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sdk } from '../../tests/security-frontend/sdk-boundary';
import { auth, adminAuth } from '../services/firebase';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import HistorialRecargas from '../pages/recargas/HistorialRecargas';
import { WompiPaymentOption } from '../components/WompiPaymentOption';
import { checkoutWithReturn } from '../utils/wompiReturn';
import { loadWompiWidget, prepareWompiWidget } from '../utils/wompiWidget';
import { WompiSettings } from '../components/admin/WompiSettings';
import AdminRecharges from '../pages/admin/Recharges';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RechargeModal } from '../components/RechargeModal';

// Keep the real component -> marketplace -> API client -> Firebase init graph.
// The suite replaces only the external SDK and HTTP transport.
vi.unmock('../services/firebase');
vi.unmock('../services/auth');
const reference = `wompi_${'a'.repeat(48)}`;
const checkout = `https://checkout.wompi.co/p/?public-key=pub_test_synthetic&reference=${reference}&amount-in-cents=2000000&currency=COP&signature%3Aintegrity=${'a'.repeat(64)}`;
let widgetOpen: ReturnType<typeof vi.fn>;
let widgetConstructor: ReturnType<typeof vi.fn>;
let status: string;
let rows: any[];
let fail: boolean;
let calls: Array<{ name: string; options: any }>;
const session = (uid: string) => ({ uid, getIdToken: vi.fn(async () => `synthetic-${uid}`) });

beforeEach(() => {
  // jsdom has no native top layer. Browser coverage checks actual containment.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  widgetOpen = vi.fn();
  widgetConstructor = vi.fn(function () { return { open: widgetOpen }; });
  vi.stubGlobal('WidgetCheckout', widgetConstructor);
  status = 'pending'; fail = false; calls = []; sdk.writes.length = 0;
  rows = [{ id: reference, userId: 'owner', tenantId: 't1', provider: 'wompi', amount: 20000, createdAt: null, customerName: '' }];
  const user = session('owner');
  sdk.emit(auth, user);
  sdk.emit(adminAuth, null);
  useAuthStore.setState({ user: user as any, adminUser: null, role: null, loading: false, initialized: true, customer: { uid: 'owner', balance: 0, phone: '3001234567' } as any });
  useTenantStore.setState({ tenant: { id: 't1' } as any, loading: false });
  window.history.replaceState({}, '', `/historial-recargas?v=t1&wompi_ref=${reference}&id=UNTRUSTED&status=APPROVED`);
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const name = String(url).split('/').at(-1)!;
    calls.push({ name, options });
    if (fail && name === 'getRechargeHistory') return new Response('{}', { status: 503 });
    const result = name === 'getRechargeHistory' ? { success: true, recharges: rows.map(row => ({ ...row, status })) }
      : name === 'getWompiAvailability' ? { enabled: false } : { checkoutUrl: checkout };
    return new Response(JSON.stringify({ result }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('dual-session integration / real application imports', () => {
  function identities() {
    const client = session('customer-A'), reseller = session('reseller-B');
    sdk.emit(auth, client); sdk.emit(adminAuth, reseller);
    useAuthStore.setState({ user: client as any, adminUser: reseller as any, role: 'reseller',
      customer: { uid: client.uid, phone: '3001234567', balance: 10000 } as any });
    return { client, reseller };
  }
  function modal(panel = false) {
    sdk.getDoc.mockImplementation(async () => ({ exists: () => false }));
    sdk.getDocs.mockImplementation(async () => ({ docs: [] }));
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={query}><MemoryRouter><RechargeModal panel={panel} onClose={() => {}} /></MemoryRouter></QueryClientProvider>);
  }
  it.each([false, true])('waits for the selected persisted session before requesting Wompi (panel=%s)', async panel => {
    identities();
    const selected = panel ? adminAuth : auth;
    const original = selected.authStateReady;
    let ready!: () => void;
    selected.authStateReady = vi.fn(() => new Promise<void>(resolve => { ready = resolve; }));
    try {
      render(<WompiPaymentOption amount="20000" tenantId="t1" panel={panel} />);
      await act(async () => {});
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => ready());
      expect(calls.map(call => call.options.headers.Authorization)).toEqual([`Bearer synthetic-${panel ? 'reseller-B' : 'customer-A'}`]);
    } finally { selected.authStateReady = original; }
  });
  it.each([false, true])('does not use the other identity if its selected session is absent (panel=%s)', async panel => {
    identities();
    sdk.emit(panel ? adminAuth : auth, null);
    render(<WompiPaymentOption amount="20000" tenantId="t1" panel={panel} />);
    await screen.findByRole('alert');
    expect(fetch).not.toHaveBeenCalled();
    expect((panel ? auth : adminAuth).currentUser).not.toBeNull();
  });
  it.each([false, true])('rejects a session switch while retrieving its token, before HTTP (panel=%s)', async panel => {
    const { client, reseller } = identities();
    const selectedUser = panel ? reseller : client;
    let finish!: (token: string) => void;
    selectedUser.getIdToken.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    render(<WompiPaymentOption amount="20000" tenantId="t1" panel={panel} />);
    await act(async () => {});
    sdk.emit(panel ? adminAuth : auth, session('replacement'));
    await act(async () => finish('late-private-token'));
    await screen.findByRole('alert');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([false, true])('pending modal filters the selected owner and tenant with concurrent identities (panel=%s)', async panel => {
    identities();
    rows = [
      { ...rows[0], userId: panel ? 'customer-A' : 'reseller-B', amount: 30000 },
      { ...rows[0], userId: panel ? 'reseller-B' : 'customer-A', tenantId: 'other', amount: 40000 },
      { ...rows[0], userId: panel ? 'reseller-B' : 'customer-A', amount: 20000 },
    ];
    modal(panel);
    await screen.findByTestId('recharge-pending-view');
    expect(screen.queryByText(/30[.,]000|40[.,]000/)).toBeNull();
    expect(calls.filter(call => call.name === 'getRechargeHistory').every(call =>
      call.options.headers.Authorization === `Bearer synthetic-${panel ? 'reseller-B' : 'customer-A'}`)).toBe(true);
    expect(calls.some(call => call.name === 'createWompiCheckout')).toBe(false);
  });
  it('phone completion writes only the actual customer profile while a reseller is also signed in', async () => {
    identities();
    useAuthStore.setState({ customer: { ...useAuthStore.getState().customer!, phone: '' } });
    rows = [];
    modal();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar mi teléfono' }));
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+57 300 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await waitFor(() => expect(useAuthStore.getState().customer?.phone).toBe('+57 300 123 4567'));
    expect(sdk.writes).toEqual([{ ref: expect.objectContaining({ db: expect.objectContaining({ app: auth.app }), path: 'customers/customer-A' }), data: { phone: '+57 300 123 4567' } }]);
    expect(adminAuth.currentUser?.uid).toBe('reseller-B');
    expect(calls.some(call => call.name === 'createWompiCheckout' || call.name === 'createRechargeRequest')).toBe(false);
  });
  it('phone completion refuses a stale customer session without writing through the panel', async () => {
    identities();
    useAuthStore.setState({ customer: { ...useAuthStore.getState().customer!, phone: '' } });
    modal();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar mi teléfono' }));
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+57 300 123 4567' } });
    sdk.emit(auth, null);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await act(async () => {});
    expect(sdk.writes).toHaveLength(0);
    expect(useAuthStore.getState().customer?.phone).toBe('');
  });
  it.each([false, true])('return and history links keep the explicit surface, tenant and signed fields (panel=%s)', panel => {
    const origin = 'https://shop.example.invalid';
    const prepared = prepareWompiWidget({ checkoutUrl: checkout }, origin, 't1', panel);
    const expected = `${origin}${panel ? '/r' : ''}/historial-recargas?v=t1&wompi_ref=${reference}`;
    expect(prepared.config.redirectUrl).toBe(expected);
    expect(prepared.history).toBe(expected);
    for (const [key, value] of new URL(checkout).searchParams) expect(new URL(prepared.url).searchParams.get(key)).toBe(value);
  });
});

describe('safe checkout return', () => {
  it('late save for tenant A cannot clear tenant B keys or show a false success', async () => {
    sdk.emit(adminAuth, session('admin'));
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('saveWompiConfig')) return new Promise<Response>(resolve => { finish = resolve; });
      const tenantId = JSON.parse(options!.body as string).data.tenantId;
      return new Response(JSON.stringify({ result: { enabled: false, environment: 'test', publicKey: `pub_test_${tenantId}` } }));
    });
    const view = render(<WompiSettings tenantId="t1" />);
    await screen.findByDisplayValue('pub_test_t1');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    await act(async () => {});
    view.rerender(<WompiSettings tenantId="t2" />);
    await screen.findByDisplayValue('pub_test_t2');
    fireEvent.change(screen.getByLabelText('Llave privada'), { target: { value: 'prv_test_B' } });
    await act(async () => finish(new Response(JSON.stringify({ result: {} }))));
    expect(screen.getByLabelText('Llave privada')).toHaveValue('prv_test_B');
    expect(screen.queryByText(/Configuración guardada/)).toBeNull();
  });
  it('fee configuration uses actual panel session and exact decimal units, without exposing or writing secrets publicly', async () => {
    sdk.emit(adminAuth, session('admin'));
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      calls.push({ name: String(url).split('/').at(-1)!, options });
      return new Response(JSON.stringify({ result: { enabled: false, environment: 'test', publicKey: 'pub_test_synthetic' } }));
    });
    render(<WompiSettings tenantId="t1" />);
    await screen.findByDisplayValue('pub_test_synthetic');
    expect(screen.getByLabelText('Quién asume el cargo')).toHaveValue('merchant');
    fireEvent.change(screen.getByLabelText('Quién asume el cargo'), { target: { value: 'customer' } });
    fireEvent.change(screen.getByLabelText('Comisión porcentual (%)'), { target: { value: '4.10' } });
    fireEvent.change(screen.getByLabelText('IVA sobre la comisión (%)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    await screen.findByText(/Configuración guardada/);
    expect(calls.map(c => c.options.headers.Authorization)).toEqual(['Bearer synthetic-admin', 'Bearer synthetic-admin']);
    expect(JSON.parse(calls[1].options.body).data).toMatchObject({ tenantId: 't1', enabled: false, feePolicies: {
      test: { payer: 'customer', rateBps: 410, fixedFee: 700, vatBps: 0 },
      prod: { payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 },
    } });
    expect(sdk.writes).toHaveLength(0);
  });
  it.each([['Comisión porcentual (%)', '2.655'], ['Comisión fija (COP)', '700.5'], ['IVA sobre la comisión (%)', '-1']])('rejects invalid admin units for %s without silently rounding or sending HTTP', async (label, value) => {
    sdk.emit(adminAuth, session('admin'));
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      calls.push({ name: String(url).split('/').at(-1)!, options });
      return new Response(JSON.stringify({ result: { enabled: false, environment: 'test', publicKey: 'pub_test_synthetic' } }));
    });
    render(<WompiSettings tenantId="t1" />);
    await screen.findByDisplayValue('pub_test_synthetic');
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cargo inválido');
    expect(calls.map(c => c.name)).toEqual(['getWompiConfig']);
  });
  it('shows server base/fee/total before explicit navigation, with real API graph and no browser writes', async () => {
    const feeQuote = { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 1512, totalAmount: 21512 };
    vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ result:
      String(url).endsWith('getWompiAvailability') ? { enabled: true, environment: 'test' }
         : { quoteHash: 'a'.repeat(64), feeQuote, environment: 'test' } })));
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    const prepare = await screen.findByRole('button', { name: 'Ver total' });
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(prepare);
    await screen.findByRole('button', { name: 'Continuar a Wompi por $21.512 COP' });
    expect(screen.getByText('Saldo de recarga:').closest('p')).toHaveTextContent('$20.000 COP');
    expect(screen.getByText('Cargo de procesamiento:').closest('p')).toHaveTextContent('$1.512 COP');
    expect(screen.getByText('Total de prueba:').closest('p')).toHaveTextContent('$21.512 COP');
    expect(screen.queryByText(/Al continuar aceptás el total mostrado/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(sdk.writes).toHaveLength(0);
    expect(window.location.pathname).toBe('/historial-recargas');
    expect(useAuthStore.getState().customer?.balance).toBe(0);
  });
  it.each([
    { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 1512, totalAmount: 20000 },
    { version: 1, currency: 'COP', baseAmount: 19000, processingFee: 1000, totalAmount: 20000 },
  ])('rejects inconsistent receipt total or selected base rather than offering navigation (%j)', async feeQuote => {
    vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ result:
      String(url).endsWith('getWompiAvailability') ? { enabled: true }
         : { quoteHash: 'a'.repeat(64), feeQuote } })));
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Detalle del pago Wompi inválido');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('legacy resume derives zero fee and frozen base from signed URL, never from edited input', async () => {
    vi.mocked(fetch).mockImplementation(async url => new Response(JSON.stringify({ result:
      String(url).endsWith('getWompiAvailability') ? { enabled: true, environment: 'test' }
        : String(url).endsWith('getRechargeHistory') ? { recharges: [{ ...rows[0], status: 'pending' }] } : { checkoutUrl: checkout } })));
    render(<WompiPaymentOption amount="999999" tenantId="t1" rechargeId={reference} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    await screen.findByRole('button', { name: 'Continuar a Wompi por $20.000 COP' });
    expect(screen.getByText('Saldo de recarga:').closest('p')).toHaveTextContent('$20.000 COP');
    expect(screen.getByText('Cargo de procesamiento:').closest('p')).toHaveTextContent('$0 COP');
    expect(screen.queryByText(/999.999/)).toBeNull();
  });
  it('encodes the fixed same-origin tenant route once without changing signed fields', () => {
    const url = new URL(checkoutWithReturn(checkout, 'https://shop.example.invalid', 'tenant & two'));
    expect(url.searchParams.get('redirect-url')).toBe(`https://shop.example.invalid/historial-recargas?v=tenant+%26+two&wompi_ref=${reference}`);
    for (const [key, value] of new URL(checkout).searchParams) expect(url.searchParams.get(key)).toBe(value);
    expect(url.searchParams.getAll('redirect-url')).toHaveLength(1);
  });
  it.each(['javascript:alert(1)', 'https://evil.example.invalid/p/', 'https://checkout.wompi.co.evil.invalid/p/', 'https://x@checkout.wompi.co/p/'])('rejects injected checkout %s', value => {
    expect(() => checkoutWithReturn(value, 'https://shop.example.invalid', 't1')).toThrow();
  });
  it.each(['javascript:alert(1)', 'http://shop.example.invalid', 'https://shop.example.invalid/other', 'https://u:p@shop.example.invalid'])('rejects invalid return origin %s', value => {
    expect(() => checkoutWithReturn(checkout, value, 't1')).toThrow();
  });
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'https://localhost:3000', 'https://127.0.0.1:3000', 'http://[::1]:3000'])('omits blocked loopback return only for DEV sandbox: %s', origin => {
    vi.stubEnv('DEV', true);
    const url = new URL(checkoutWithReturn(`${checkout}&redirect-url=https://evil.invalid`, origin, 't1'));
    expect(url.searchParams.has('redirect-url')).toBe(false);
    for (const [key, value] of new URL(checkout).searchParams) expect(url.searchParams.get(key)).toBe(value);
    expect(() => checkoutWithReturn(checkout.replace('pub_test_', 'pub_prod_'), origin, 't1')).toThrow();
    expect(() => checkoutWithReturn(checkout.replace('public-key=pub_test_synthetic&', ''), origin, 't1')).toThrow();
    vi.stubEnv('DEV', false);
    expect(() => checkoutWithReturn(checkout, origin, 't1')).toThrow();
    expect(() => checkoutWithReturn(checkout, 'https://shop.example.invalid', undefined)).toThrow();
  });
  it('overwrites an existing arbitrary redirect rather than accepting it', () => {
    const url = new URL(checkoutWithReturn(`${checkout}&redirect-url=https://evil.invalid`, 'https://shop.example.invalid', 't1'));
    expect(url.searchParams.get('redirect-url')).toContain('https://shop.example.invalid/historial-recargas?');
  });
  it('actual component opens official sandbox widget without a blocked localhost return', async () => {
    vi.stubEnv('DEV', true);
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      calls.push({ name: String(url).split('/').at(-1)!, options });
      return new Response(JSON.stringify({ result: String(url).endsWith('getWompiAvailability') ? { enabled: true }
        : String(url).endsWith('getRechargeHistory') ? { recharges: [{ ...rows[0], status: 'pending' }] } : { checkoutUrl: checkout } }));
    });
    render(<WompiPaymentOption amount="20000" tenantId="t1" rechargeId={reference} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    expect(widgetConstructor).toHaveBeenCalledWith({ publicKey: 'pub_test_synthetic', reference, currency: 'COP', amountInCents: 2000000, signature: { integrity: 'a'.repeat(64) } });
    expect(screen.queryByRole('link', { name: /checkout externo/ })).toBeNull();
    expect(calls.map(c => c.name)).toEqual(['getWompiAvailability', 'getRechargeHistory', 'createWompiCheckout', 'reconcileWompiPayment', 'getRechargeHistory', 'reconcileWompiPayment', 'getRechargeHistory']);
  });
});

describe('read-only preview and explicit final handoff (real API graph)', () => {
  const feeQuote = { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 0, totalAmount: 20000 };
  const preview = { feeQuote, quoteHash: 'b'.repeat(64), environment: 'test' };
  function transport(final: () => Promise<Response> = async () => new Response(JSON.stringify({ result: { checkoutUrl: checkout, feeQuote } }))) {
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      const name = String(url).split('/').at(-1)!;
      calls.push({ name, options });
      if (name === 'createWompiCheckout') return final();
      return new Response(JSON.stringify({ result: name === 'getWompiAvailability' ? { enabled: true, environment: 'test' }
        : name === 'getRechargeHistory' ? { recharges: rows.map(row => ({ ...row, status })) } : preview }));
    });
  }
  it('lost webhook: sends only callback locator to authenticated backend and displays re-read server result', async () => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/reconcileWompiPayment')) {
        calls.push({ name: 'reconcileWompiPayment', options });
        expect(options!.headers).toMatchObject({ Authorization: 'Bearer synthetic-owner' });
        expect(JSON.parse(options!.body as string).data).toEqual({ tenantId: 't1', rechargeId: reference, transactionId: 'provider-locator' });
        status = 'sandbox_approved';
        return new Response(JSON.stringify({ result: { reference, status, environment: 'test', providerChecked: true } }));
      }
      return original(url, options);
    });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { id: 'provider-locator', status: 'DECLINED' } }));
    expect(await screen.findByRole('dialog', { name: 'Prueba aprobada' })).toHaveTextContent('Sin saldo real');
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    expect(sdk.writes).toHaveLength(0);
  });
  it('previews without a create, then a deferred double-click creates and opens the widget exactly once', async () => {
    let finish!: (value: Response) => void;
    transport(() => new Promise(resolve => { finish = resolve; }));
    const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    const next = await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    expect(calls.map(call => call.name)).toEqual(['getWompiAvailability', 'getWompiQuote']);
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(next); fireEvent.click(next);
    await act(async () => {});
    const creates = calls.filter(call => call.name === 'createWompiCheckout');
    expect(creates).toHaveLength(1);
    expect(JSON.parse(creates[0].options.body).data).toEqual({ tenantId: 't1', amount: 20000, expectedQuoteHash: preview.quoteHash, idempotencyKey: expect.any(String) });
    expect(creates[0].options.headers.Authorization).toBe('Bearer synthetic-owner');
    expect(assign).not.toHaveBeenCalled();
    await act(async () => finish(new Response(JSON.stringify({ result: { checkoutUrl: checkout, feeQuote } }))));
    expect(assign).not.toHaveBeenCalled();
    expect(widgetOpen).toHaveBeenCalledTimes(1);
    expect(widgetConstructor.mock.calls[0][0].amountInCents).toBe(2000000);
    expect(sdk.writes).toHaveLength(0);
  });
  it('tariff rejection clears the old preview and requires another review without navigating', async () => {
    transport(async () => new Response(JSON.stringify({ error: { code: 'failed-precondition', message: 'El total cambió. Revisalo antes de continuar con Wompi.' } }), { status: 409 }));
    const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El total cambió');
    expect(screen.getByRole('button', { name: 'Ver total' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Continuar a Wompi por/ })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
  it.each(['https://evil.invalid/p/', checkout.replace('2000000', '2100000')])('rejects an invalid final checkout without navigating: %s', async checkoutUrl => {
    transport(async () => new Response(JSON.stringify({ result: { checkoutUrl, feeQuote } })));
    const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await screen.findByRole('alert');
    expect(assign).not.toHaveBeenCalled(); expect(screen.queryByRole('link')).toBeNull();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('reseller preview and final confirmation use only the current authorized panel session', async () => {
    const reseller = session('reseller-panel');
    sdk.emit(adminAuth, reseller);
    useAuthStore.setState({ adminUser: reseller as any, role: 'reseller' });
    rows = [{ ...rows[0], userId: reseller.uid }];
    transport(); const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    render(<WompiPaymentOption amount="20000" tenantId="t1" panel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    expect(calls.map(call => call.name)).toEqual(['getWompiAvailability', 'getWompiQuote', 'createWompiCheckout', 'reconcileWompiPayment', 'getRechargeHistory']);
    expect(calls.every(call => call.options.headers.Authorization === 'Bearer synthetic-reseller-panel')).toBe(true);
    expect(assign).not.toHaveBeenCalled(); expect(widgetOpen).toHaveBeenCalledTimes(1);
  });
  it('SDK failure preserves the committed checkout as an explicit fallback and does not navigate automatically', async () => {
    transport(); const assign = vi.fn(() => { throw new Error('Synthetic blocked navigation'); });
    vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    widgetConstructor.mockImplementation(() => { throw new Error('Synthetic SDK failure'); });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu recarga quedó pendiente');
    expect(await screen.findByRole('link', { name: /Abrir checkout externo/ })).toHaveAttribute('href', checkout);
    expect(assign).not.toHaveBeenCalled();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('an uncertain HTTP failure retries the same idempotency key and accepted quote', async () => {
    let attempts = 0;
    transport(async () => { if (++attempts === 1) throw new Error('Synthetic lost response'); return new Response(JSON.stringify({ result: { checkoutUrl: checkout, feeQuote } })); });
    const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    const bodies = calls.filter(call => call.name === 'createWompiCheckout').map(call => JSON.parse(call.options.body).data);
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(assign).not.toHaveBeenCalled(); expect(widgetOpen).toHaveBeenCalledTimes(1);
  });
  it.each(['method', 'amount', 'close'])('discards late preview after %s change without creating or navigating', async change => {
    let finish!: (value: Response) => void;
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).endsWith('getWompiQuote')
      ? new Promise<Response>(resolve => { finish = resolve; }) : original(url, options));
    const assign = vi.fn(); vi.stubGlobal('location', { origin: 'http://localhost:3000', assign });
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    await act(async () => {});
    if (change === 'close') view.unmount();
    else view.rerender(<WompiPaymentOption amount={change === 'amount' ? '30000' : '20000'} tenantId="t1" active={change !== 'method'} />);
    await act(async () => finish(new Response(JSON.stringify({ result: preview }))));
    if (change === 'method') view.rerender(<WompiPaymentOption amount="20000" tenantId="t1" />);
    expect(screen.queryByRole('button', { name: /Continuar a Wompi por/ })).toBeNull();
    expect(calls.some(call => call.name === 'createWompiCheckout')).toBe(false); expect(assign).not.toHaveBeenCalled();
  });
  it('editing the base invalidates a completed quote; the new preview and confirmation use the new base', async () => {
    transport();
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    view.rerender(<WompiPaymentOption amount="30000" tenantId="t1" />);
    expect(screen.queryByRole('button', { name: /Continuar a Wompi por/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver total' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Detalle del pago Wompi inválido');
    expect(JSON.parse(calls.at(-1)!.options.body).data.amount).toBe(30000);
    expect(calls.some(call => call.name === 'createWompiCheckout')).toBe(false);
  });
  it.each(['close', 'method', 'amount', 'tenant', 'session', 'role'])('does not open a committed late response after %s changes', async change => {
    let finish!: (response: Response) => void;
    transport(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    if (change === 'close') view.unmount();
    else if (change === 'session') sdk.emit(auth, session('another-owner'));
    else if (change === 'role') view.rerender(<WompiPaymentOption amount="20000" tenantId="t1" panel />);
    else view.rerender(<WompiPaymentOption amount={change === 'amount' ? '30000' : '20000'} tenantId={change === 'tenant' ? 't2' : 't1'} active={change !== 'method'} />);
    await act(async () => finish(new Response(JSON.stringify({ result: { checkoutUrl: checkout, feeQuote } }))));
    expect(widgetOpen).not.toHaveBeenCalled();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('callback APPROVED is untrusted: authenticated history remains pending, then sandbox success never changes balance', async () => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let serverStatus = 'pending';
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('getRechargeHistory')) {
        calls.push({ name: 'getRechargeHistory', options });
        return new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: serverStatus }] } }));
      }
      return original(url, options);
    });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { id: 'FORGED', status: 'APPROVED' } }));
    expect(await screen.findByRole('status')).toHaveTextContent('Esperando confirmación Wompi');
    expect(calls.at(-1)!.options.headers.Authorization).toBe('Bearer synthetic-owner');
    expect(JSON.parse(calls.at(-1)!.options.body).data).toEqual({});
    serverStatus = 'sandbox_approved';
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await screen.findByText('Prueba aprobada sin saldo real');
    expect(screen.queryByRole('button', { name: /Continuar a Wompi por/ })).toBeNull();
    expect(sdk.writes).toHaveLength(0); expect(useAuthStore.getState().customer?.balance).toBe(0);
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('a callback received after the authenticated session changes cannot query or display the previous payment', async () => {
    transport();
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    const queriesBeforeSessionChange = calls.length;
    sdk.emit(auth, session('another-owner'));
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { id: 'FORGED', status: 'APPROVED' } }));
    expect(calls).toHaveLength(queriesBeforeSessionChange);
    expect(calls.at(-1)!.name).toBe('getRechargeHistory');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(sdk.writes).toHaveLength(0);
  });
  it('pending callback polls only the read-only authenticated history, stops after six retries and never creates another payment', async () => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('getRechargeHistory')) {
        calls.push({ name: 'getRechargeHistory', options });
        return new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'pending' }] } }));
      }
      return original(url, options);
    });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    vi.useFakeTimers();
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { status: 'PENDING' } }));
    for (const delay of [3000, 6000, 12000, 15000, 15000, 15000, 60000]) await act(async () => vi.advanceTimersByTimeAsync(delay));
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(8);
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    expect(sdk.writes).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Esperando confirmación Wompi');
  });
  it('closing the SDK dialog releases the open guard and reopens only the same frozen payment without a second create', async () => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('getRechargeHistory')) {
        calls.push({ name: 'getRechargeHistory', options });
        return new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'pending' }] } }));
      }
      return original(url, options);
    });
    const dialog = document.createElement('div'); dialog.className = 'waybox-modal';
    widgetOpen.mockImplementation(() => { dialog.removeAttribute('hidden'); document.body.appendChild(dialog); });
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
      fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
      await screen.findByRole('button', { name: 'Wompi abierto' });
      expect(screen.getByRole('button', { name: 'Wompi abierto' })).toBeDisabled();
      await act(async () => dialog.setAttribute('hidden', ''));
      fireEvent.click(await screen.findByRole('button', { name: /Volver a Wompi/ }));
      await act(async () => {});
      expect(widgetOpen).toHaveBeenCalledTimes(2);
      expect(widgetConstructor).toHaveBeenCalledTimes(1);
      expect(widgetConstructor.mock.calls[0][0].reference).toBe(reference);
      expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    } finally { view.unmount(); await act(async () => dialog.remove()); }
  });
  it('invalid typed fields or environment cannot override signed legacy fields; redirect stays same-origin', () => {
    const prepared = prepareWompiWidget({ checkoutUrl: checkout }, 'https://shop.example.invalid', 't1');
    for (const change of [{ amountInCents: 1 }, { publicKey: 'pub_prod_wrong' }, { reference: 'wrong' },
      { currency: 'USD' }, { signature: { integrity: 'b'.repeat(64) } }]) {
      expect(() => prepareWompiWidget({ checkoutUrl: checkout, widgetConfig: { ...prepared.config, ...change } as any }, 'https://shop.example.invalid', 't1')).toThrow('Detalle del pago');
    }
    expect(() => prepareWompiWidget({ checkoutUrl: checkout, environment: 'prod' }, 'https://shop.example.invalid', 't1')).toThrow();
    expect(() => prepareWompiWidget({ checkoutUrl: checkout, rechargeId: 'another' }, 'https://shop.example.invalid', 't1')).toThrow();
    expect(() => prepareWompiWidget({ checkoutUrl: checkout, reference: 'another' }, 'https://shop.example.invalid', 't1')).toThrow();
    const result = prepareWompiWidget({ checkoutUrl: checkout, widgetConfig: { ...prepared.config, redirectUrl: 'https://evil.invalid' } }, 'https://shop.example.invalid', 't1');
    expect(result.config.redirectUrl).toBe(result.history);
    expect(result.config).not.toHaveProperty('integritySignature');
  });
  async function startPayment() {
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
  }
  async function startWithoutCallback() {
    vi.useFakeTimers(); transport();
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Ver total' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    return view;
  }
  it.each(['sandbox_approved', 'rejected'])('polls from the final handoff and displays server %s even when no SDK callback arrives', async terminal => {
    const view = await startWithoutCallback();
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(1);
    status = terminal;
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByRole('dialog', { name: terminal === 'rejected' ? 'Pago rechazado' : 'Prueba aprobada' })).toBeVisible();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    expect(sdk.writes).toHaveLength(0);
    view.unmount(); await act(async () => vi.advanceTimersByTimeAsync(0)); expect(vi.getTimerCount()).toBe(0);
  });
  it('ends a callback-free pending poll with a recoverable pending modal, then accepts a later server result', async () => {
    const view = await startWithoutCallback();
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(screen.getByRole('dialog', { name: 'Pago pendiente' })).toHaveTextContent('No repitas el pago');
    expect(screen.queryByRole('button', { name: 'Volver a intentar' })).toBeNull();
    const queries = calls.filter(call => call.name === 'getRechargeHistory');
    expect(queries).toHaveLength(7);
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    status = 'sandbox_approved';
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    expect(sdk.writes).toHaveLength(0); view.unmount();
  });
  it.each([undefined, null, { transaction: null }])('ignores malformed SDK callback %j and shares overlapping status requests', async payload => {
    await startWithoutCallback();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (!String(url).endsWith('getRechargeHistory')) return original(url, options);
      calls.push({ name: 'getRechargeHistory', options });
      return new Promise(resolve => { finish = resolve; });
    });
    await act(async () => {
      widgetOpen.mock.calls[0][0](payload);
      widgetOpen.mock.calls[0][0](payload);
      window.dispatchEvent(new Event('focus'));
    });
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(2);
    await act(async () => finish(new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'pending' }] } }))));
    expect(screen.queryByRole('dialog')).toBeNull();
    status = 'sandbox_approved'; vi.mocked(fetch).mockImplementation(original);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    expect(sdk.writes).toHaveLength(0);
  });
  it('bounds the wait while a later HTTP request stalls, without overlapping it or losing a late terminal answer', async () => {
    const view = await startWithoutCallback();
    let finish!: (response: Response) => void;
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (!String(url).endsWith('getRechargeHistory')) return original(url, options);
      calls.push({ name: 'getRechargeHistory', options });
      return new Promise(resolve => { finish = resolve; });
    });
    await act(async () => vi.advanceTimersByTimeAsync(75000));
    expect(screen.getByRole('dialog', { name: 'Pago pendiente' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(2);
    await act(async () => finish(new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'sandbox_approved' }] } }))));
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    view.unmount(); await act(async () => vi.advanceTimersByTimeAsync(0)); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not invent pending or success when the first status request never answers', async () => {
    vi.useFakeTimers(); transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).endsWith('getRechargeHistory')
      ? new Promise(resolve => { finish = resolve; }) : original(url, options));
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Ver total' })); await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /Continuar a Wompi por/ })); await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(75000));
    expect(screen.getByRole('status')).toHaveTextContent('No pudimos consultar el estado');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    view.unmount();
    await act(async () => finish(new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'sandbox_approved' }] } }))));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it('refreshes before resume: server approval beats a DECLINED callback and prevents reopening the widget', async () => {
    transport();
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    await act(async () => widgetOpen.mock.calls[0][0](undefined));
    expect(screen.getByRole('button', { name: 'Volver a Wompi' })).toBeEnabled();
    status = 'sandbox_approved';
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Wompi' }));
    expect(await screen.findByRole('dialog', { name: 'Prueba aprobada' })).toHaveTextContent('Sin saldo real');
    expect(widgetOpen).toHaveBeenCalledTimes(1);
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    expect(sdk.writes).toHaveLength(0);
  });
  it('production approval credits only the frozen base in the result; a declined client callback has no authority', async () => {
    vi.stubGlobal('location', { origin: 'https://shop.example.invalid' });
    const receipt = { ...feeQuote, processingFee: 1512, totalAmount: 21512 };
    transport(async () => new Response(JSON.stringify({ result: { checkoutUrl: checkout.replace('pub_test_', 'pub_prod_').replace('2000000', '2151200'), feeQuote: receipt } })));
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).endsWith('getWompiQuote')
      ? new Response(JSON.stringify({ result: { ...preview, feeQuote: receipt } })) : original(url, options));
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    status = 'approved';
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { status: 'DECLINED' } }));
    const result = screen.getByRole('dialog', { name: 'Pago aprobado' });
    expect(result).toHaveTextContent('Se acreditaron $20.000 COP de saldo.');
    expect(result).not.toHaveTextContent('21.512');
    expect(useAuthStore.getState().customer?.balance).toBe(0);
    expect(sdk.writes).toHaveLength(0);
  });
  it('server rejection offers an explicit read-only retry, with no automatic new intent', async () => {
    transport();
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment(); status = 'rejected';
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { status: 'APPROVED' } }));
    expect(screen.getByRole('dialog', { name: 'Pago rechazado' })).toHaveTextContent('El pago no fue aprobado');
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver total' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('checking is announced, serializes refreshes, and reduced motion has a static fallback', async () => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (!String(url).endsWith('getRechargeHistory')) return original(url, options);
      calls.push({ name: 'getRechargeHistory', options });
      return new Promise(resolve => { finish = resolve; });
    });
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    await act(async () => widgetOpen.mock.calls[0][0](undefined));
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Estamos verificando tu pago…');
    expect(screen.getByRole('status').querySelector('[aria-hidden]')).toHaveClass('motion-reduce:animate-none');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    fireEvent.focus(window);
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(1);
    view.unmount();
    await act(async () => finish(new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'approved' }] } }))));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each(['missing', 'other-owner', 'wrong-tenant', 'network'])('unavailable status (%s) never rejects or reopens a payment', async reason => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (!String(url).endsWith('getRechargeHistory')) return original(url, options);
      if (reason === 'network') return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ result: { recharges: reason === 'missing' ? [] : [{ ...rows[0], status: 'approved',
        ...(reason === 'other-owner' ? { userId: 'other' } : { tenantId: 'other' }) }] } }));
    });
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { status: 'APPROVED' } }));
    expect(screen.getByRole('status')).toHaveTextContent('No pudimos consultar el estado');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Wompi' }));
    await act(async () => {});
    expect(widgetOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('restores a committed reference after closing the parent, then displays a late approval exactly once', async () => {
    transport();
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    view.unmount(); status = 'sandbox_approved';
    const reopened = render(<WompiPaymentOption amount="" tenantId="t1" />);
    await screen.findByRole('dialog', { name: 'Prueba aprobada' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    reopened.unmount();
    render(<WompiPaymentOption amount="" tenantId="t1" />);
    await screen.findByRole('button', { name: 'Ver total' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it.each(['approved', 'sandbox_approved', 'rejected'])('reload resume sees server %s before requesting a signed checkout', async terminal => {
    transport(); status = terminal;
    rows[0].environment = terminal === 'approved' ? 'prod' : 'test';
    render(<WompiPaymentOption amount="999999" tenantId="t1" rechargeId={reference} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    const result = await screen.findByRole('dialog', { name: terminal === 'approved' ? 'Pago aprobado' : terminal === 'sandbox_approved' ? 'Prueba aprobada' : 'Pago rechazado' });
    if (terminal === 'approved') expect(result).toHaveTextContent('$20.000 COP');
    expect(calls.map(call => call.name)).toEqual(['getWompiAvailability', 'getRechargeHistory']);
    expect(widgetOpen).not.toHaveBeenCalled();
    if (terminal === 'rejected') {
      fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
      await screen.findByRole('button', { name: 'Ver total' });
      expect(calls.some(call => call.name === 'createWompiCheckout')).toBe(false);
    }
  });
  it.each(['method', 'amount', 'tenant', 'session', 'role'])('discards a late status after %s changes', async change => {
    transport();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).endsWith('getRechargeHistory')
      ? new Promise(resolve => { finish = resolve; }) : original(url, options));
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    await act(async () => widgetOpen.mock.calls[0][0](undefined));
    if (change === 'session') sdk.emit(auth, session('another-owner'));
    else if (change === 'role') view.rerender(<WompiPaymentOption amount="20000" tenantId="t1" panel />);
    else view.rerender(<WompiPaymentOption amount={change === 'amount' ? '30000' : '20000'} tenantId={change === 'tenant' ? 't2' : 't1'} active={change !== 'method'} />);
    await act(async () => finish(new Response(JSON.stringify({ result: { recharges: [{ ...rows[0], status: 'approved' }] } }))));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Pago aprobado')).toBeNull();
    expect(sdk.writes).toHaveLength(0);
  });
  it('refreshes the mounted payment on return focus even after the bounded poll has ended', async () => {
    transport();
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    await startPayment();
    vi.useFakeTimers();
    await act(async () => widgetOpen.mock.calls[0][0](undefined));
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    status = 'sandbox_approved';
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('ignores focus caused by its pending modal but still reconciles on a visible-tab return', async () => {
    await startWithoutCallback();
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    const count = calls.filter(call => call.name === 'getRechargeHistory').length;
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(count);
    expect(screen.getByRole('dialog', { name: 'Pago pendiente' })).toBeVisible();
    status = 'sandbox_approved';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
  });
  it('removes an already displayed result when the owner changes, without notifying the next owner', async () => {
    transport(); const onStatusChange = vi.fn();
    render(<WompiPaymentOption amount="20000" tenantId="t1" onStatusChange={onStatusChange} />);
    await startPayment(); status = 'sandbox_approved';
    await act(async () => widgetOpen.mock.calls[0][0](undefined));
    expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBeVisible();
    onStatusChange.mockClear();
    const next = session('another-owner'); sdk.emit(auth, next);
    act(() => useAuthStore.setState({ user: next as any }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Prueba aprobada sin saldo real')).toBeNull();
    expect(onStatusChange).not.toHaveBeenCalled();
  });
  it.each(['hide', 'remove'])('keeps a callback-free verified result inert below Wompi until provider %s', async close => {
    transport();
    const provider = document.createElement('div'); provider.className = 'waybox-modal';
    const input = document.createElement('input'); provider.appendChild(input);
    widgetOpen.mockImplementation(() => { document.body.appendChild(provider); input.focus(); });
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const view = await startWithoutCallback();
    try {
      status = 'sandbox_approved';
      await act(async () => vi.advanceTimersByTimeAsync(3000));
      const result = document.querySelector('dialog[data-wompi-result]')!;
      expect(result).toHaveTextContent('Prueba aprobada');
      expect(result.parentElement).toBe(document.body);
      expect(result).toHaveAttribute('open');
      expect(result).toHaveAttribute('inert');
      expect(result).toHaveAttribute('aria-hidden', 'true');
      expect(result).toHaveAttribute('aria-modal', 'false');
      expect(showModal).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input);
      expect(provider).not.toHaveAttribute('hidden');
      fireEvent(result, new Event('cancel', { bubbles: false, cancelable: true }));
      expect(result.isConnected).toBe(true);
      await act(async () => close === 'hide' ? provider.setAttribute('hidden', '') : provider.remove());
      expect(showModal).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog', { name: 'Prueba aprobada' })).toBe(result);
      expect(result).not.toHaveAttribute('inert');
      expect(result).not.toHaveAttribute('aria-hidden');
      fireEvent(result, new Event('cancel', { bubbles: false, cancelable: true }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
      expect(sdk.writes).toHaveLength(0);
    } finally { view.unmount(); provider.remove(); showModal.mockRestore(); }
  });
  it.each(['approved', 'sandbox_approved', 'rejected'])('closes only its captured provider through SDK Escape after server %s, then hands off to the QR parent', async terminal => {
    transport();
    const onResolved = vi.fn();
    const unrelated = document.createElement('div'); unrelated.className = 'waybox-modal';
    const unrelatedKey = vi.fn(); unrelated.addEventListener('keydown', unrelatedKey);
    document.body.appendChild(unrelated);
    const provider = document.createElement('div'); provider.className = 'waybox-modal';
    const escape = vi.fn((event: KeyboardEvent) => {
      if (event.keyCode === 27) setTimeout(() => provider.setAttribute('hidden', ''), 1000);
    });
    provider.addEventListener('keydown', escape);
    widgetOpen.mockImplementation(() => document.body.appendChild(provider));
    const view = render(<WompiPaymentOption amount="20000" tenantId="t1" onResolved={onResolved} />);
    try {
      await startPayment(); vi.useFakeTimers();
      // Callback alone cannot close a pending checkout or claim approval.
      await act(async () => widgetOpen.mock.calls[0][0]({ transaction: { status: 'APPROVED' } }));
      expect(escape).not.toHaveBeenCalled(); expect(onResolved).not.toHaveBeenCalled();
      status = terminal;
      await act(async () => vi.advanceTimersByTimeAsync(3000));
      expect(escape).toHaveBeenCalledTimes(1);
      expect(unrelatedKey).not.toHaveBeenCalled();
      expect(provider).not.toHaveAttribute('hidden');
      expect(onResolved).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(1000));
      expect(provider).toHaveAttribute('hidden');
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(onResolved).toHaveBeenCalledWith(terminal === 'approved' ? 'sandbox_approved' : terminal, 20000);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.filter(call => call.name === 'createWompiCheckout')).toHaveLength(1);
      expect(sdk.writes).toHaveLength(0);
    } finally { view.unmount(); provider.remove(); unrelated.remove(); }
  });
  it('script load is singleton, fails without navigating, and can be retried; session change during loading prevents opening', async () => {
    vi.stubGlobal('WidgetCheckout', undefined);
    const first = loadWompiWidget(); const second = loadWompiWidget();
    expect(first).toBe(second);
    const script = document.querySelector<HTMLScriptElement>('script[src="https://checkout.wompi.co/widget.js"]')!;
    expect(script).not.toBeNull();
    const failure = expect(first).rejects.toThrow('No se pudo cargar Wompi');
    script.dispatchEvent(new Event('error')); await failure;
    expect(document.querySelector('script[src*="wompi"]')).toBeNull();
    transport();
    render(<WompiPaymentOption amount="20000" tenantId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    fireEvent.click(await screen.findByRole('button', { name: /Continuar a Wompi por/ }));
    await act(async () => {});
    const retry = document.querySelector<HTMLScriptElement>('script[src="https://checkout.wompi.co/widget.js"]')!;
    expect(retry).not.toBeNull();
    sdk.emit(auth, session('changed-during-script-load'));
    vi.stubGlobal('WidgetCheckout', widgetConstructor);
    await act(async () => retry.dispatchEvent(new Event('load')));
    expect(widgetOpen).not.toHaveBeenCalled(); expect(sdk.writes).toHaveLength(0);
    retry.remove();
  });
});

describe('server-authoritative history on return', () => {
  it('redirect locator recovers a lost webhook through backend, then re-reads the authenticated receipt', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/reconcileWompiPayment')) {
        expect(JSON.parse(options!.body as string).data).toEqual({ tenantId: 't1', rechargeId: reference, transactionId: 'UNTRUSTED' });
        status = 'sandbox_approved';
        return new Response(JSON.stringify({ result: { reference, status, environment: 'test', providerChecked: true } }));
      }
      return original(url, options);
    });
    render(<HistorialRecargas />);
    expect(await screen.findByText('Pago de prueba confirmado. No acredita saldo real.')).toBeInTheDocument();
    expect(calls.filter(call => call.name === 'getRechargeHistory')).toHaveLength(2);
    expect(sdk.writes).toHaveLength(0);
  });
  it('actual admin history shows credited base separately from paid total and preserves Wompi manual guards', async () => {
    const feeQuote = { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 1512, totalAmount: 21512 };
    sdk.getDoc.mockResolvedValue({ exists: () => false });
    sdk.getDocs.mockImplementation(async ref => ({ docs: ref.path === 'recharges' ? [{ id: reference, data: () => ({ ...rows[0], feeQuote, status: 'approved', environment: 'prod', createdAt: { toDate: () => new Date(0) } }) }] : [] }));
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={query}><AdminRecharges /></QueryClientProvider>);
    expect((await screen.findByText('Saldo de recarga:')).closest('p')).toHaveTextContent('$20.000 COP');
    expect(screen.getByText('Cargo de procesamiento:').closest('p')).toHaveTextContent('$1.512 COP');
    expect(screen.getByText('Total pagado:').closest('p')).toHaveTextContent('$21.512 COP');
    expect(screen.queryByTitle('Aprobar')).toBeNull();
    expect(screen.queryByTitle('Rechazar')).toBeNull();
    expect(sdk.writes).toHaveLength(0);
  });
  it.each(['approved', 'sandbox_approved', 'pending'])('history displays frozen fee receipt for %s', async current => {
    status = current;
    rows[0].feeQuote = { version: 1, currency: 'COP', baseAmount: 20000, processingFee: 1512, totalAmount: 21512 };
    rows[0].environment = current === 'sandbox_approved' ? 'test' : 'prod';
    render(<HistorialRecargas />);
    expect((await screen.findByText('Saldo de recarga:')).closest('p')).toHaveTextContent('$20.000 COP');
    expect(screen.getByText('Cargo de procesamiento:').closest('p')).toHaveTextContent('$1.512 COP');
    expect(screen.getByText(current === 'approved' ? 'Total pagado:' : current === 'pending' ? 'Total a pagar:' : 'Total de prueba:').closest('p')).toHaveTextContent('$21.512 COP');
    expect(sdk.writes).toHaveLength(0);
  });
  it.each(['sandbox_approved', 'approved', 'rejected'])('updates pending to server %s without approval calls or balance writes', async finalStatus => {
    vi.useFakeTimers();
    render(<HistorialRecargas />);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Estamos confirmando');
    status = finalStatus;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('status')).toHaveTextContent(finalStatus === 'sandbox_approved' ? 'No acredita saldo real' : finalStatus === 'approved' ? 'Pago confirmado por el servidor' : 'El pago no fue aprobado');
    expect(calls.every(c => ['getRechargeHistory', 'getWompiAvailability', 'reconcileWompiPayment'].includes(c.name))).toBe(true);
    expect(calls.filter(c => c.name === 'reconcileWompiPayment').every(c =>
      JSON.parse(c.options.body).data.transactionId === 'UNTRUSTED' && c.options.headers.Authorization === 'Bearer synthetic-owner')).toBe(true);
    expect(calls.filter(c => c.name === 'getRechargeHistory').every(c => c.options.body === JSON.stringify({ data: {} }) && c.options.headers.Authorization === 'Bearer synthetic-owner')).toBe(true);
    expect(sdk.writes).toHaveLength(0);
    expect(useAuthStore.getState().customer?.balance).toBe(0);
  });
  it('restores auth first, then allows login in place without losing the tenant/return route', async () => {
    sdk.emit(auth, null);
    useAuthStore.setState({ user: null, initialized: false, loading: true });
    const view = render(<HistorialRecargas />);
    expect(screen.getByRole('status')).toHaveTextContent('Restaurando sesión');
    expect(calls).toHaveLength(0);
    act(() => useAuthStore.setState({ initialized: true, loading: false }));
    const loginEvent = vi.fn(); window.addEventListener('openAuthModal', loginEvent);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión para ver mi recarga' }));
    expect(loginEvent).toHaveBeenCalledOnce();
    window.removeEventListener('openAuthModal', loginEvent);
    expect(window.location.search).toContain('v=t1&wompi_ref=');
    const user = session('owner'); sdk.emit(auth, user);
    act(() => useAuthStore.setState({ user: user as any }));
    await screen.findByText(/Estamos confirmando/);
    view.unmount();
  });
  it('unknown, wrong-tenant and other-owner references cannot show a confirmation', async () => {
    status = 'approved';
    rows = [{ ...rows[0], userId: 'other' }, { ...rows[0], tenantId: 'other' }];
    render(<HistorialRecargas />);
    expect(await screen.findByText(/Consultá tus recargas en esta cuenta y tienda/)).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('Pago confirmado');
    expect(calls.filter(c => c.name === 'getRechargeHistory')[0].options.body).toBe('{"data":{}}');
  });
  it('missing reference gives normal history, ignoring forged provider id/status', async () => {
    window.history.replaceState({}, '', '/historial-recargas?v=t1&id=forged&status=APPROVED');
    render(<HistorialRecargas />);
    await screen.findByText('Pendiente');
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('retrieval failures are not payment rejections', async () => {
    fail = true; render(<HistorialRecargas />);
    expect(await screen.findByText(/No pudimos consultar la confirmación/)).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('no fue aprobado');
  });
  it('stops polling after six serial retries and cleans up on unmount', async () => {
    vi.useFakeTimers(); const view = render(<HistorialRecargas />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    const count = calls.filter(c => c.name === 'getRechargeHistory').length;
    expect(count).toBe(7);
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(calls.filter(c => c.name === 'getRechargeHistory')).toHaveLength(count);
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('hides old history immediately on account change and discards late responses', async () => {
    status = 'sandbox_approved'; const view = render(<HistorialRecargas />);
    await screen.findByText('Pago de prueba confirmado. No acredita saldo real.');
    const replies: Array<(value: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise(done => { replies.push(done); }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })));
    const next = session('next'); sdk.emit(auth, next);
    await act(async () => useAuthStore.setState({ user: next as any }));
    expect(screen.queryByText('Pago de prueba confirmado. No acredita saldo real.')).toBeNull();
    expect(replies).toHaveLength(2);
    await act(async () => replies[0](new Response(JSON.stringify({ result: { success: true, recharges: rows.map(row => ({ ...row, status })) } }))));
    expect(screen.queryByText('Pago de prueba confirmado. No acredita saldo real.')).toBeNull();
    await act(async () => replies[1](new Response(JSON.stringify({ result: { success: true, recharges: [] } }))));
    expect(screen.getByRole('status')).toHaveTextContent('Consultá tus recargas en esta cuenta y tienda');
    view.unmount();
  });
});
