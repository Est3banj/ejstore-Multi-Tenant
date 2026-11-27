import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WompiPaymentOption } from '../components/WompiPaymentOption';
import { WompiSettings } from '../components/admin/WompiSettings';
import { RechargeModal } from '../components/RechargeModal';
import { customCallable } from '../services/apiClient';
import Recharges from '../pages/admin/Recharges';

vi.unmock('../components/RechargeModal');
// Legacy component fixtures: internal mocks here are NOT import/session contract evidence.
vi.mock('../services/apiClient', () => { const callable = vi.fn(); return { customCallable: callable, customAdminCallable: callable }; });
vi.mock('../services/firebase', () => ({ db: {}, auth: {}, functions: {}, adminFunctions: {}, logAnalyticsEvent: vi.fn() }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ tenant: { id: 'a' }, settings: { qrImage: '/fixture-qr.png', brebKey: 'SYNTHETIC-BREB' } }) }));
vi.mock('../services/firestore', () => ({ getRecharges: vi.fn(async () => [
  { id: 'wompi_pending', tenantId: 'a', status: 'pending', amount: 10000, customerName: 'Wompi Pending', createdAt: new Date() },
  { id: 'wompi_test', tenantId: 'a', status: 'sandbox_approved', amount: 10000, customerName: 'Sandbox Customer', createdAt: new Date() },
  { id: 'legacy_qr', tenantId: 'a', status: 'pending', amount: 10000, customerName: 'QR Customer', createdAt: new Date() },
]) }));
vi.mock('../store/authStore', () => {
  const state = { user: { uid: 'owner' }, customer: { uid: 'owner', phone: '3001234567', balance: 0 }, role: null };
  return { useAuthStore: () => state };
});
vi.mock('../store', () => ({ useTenantStore: (selector: (s: unknown) => unknown) => selector({ tenant: { id: 'a' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const callable = vi.mocked(customCallable);
beforeEach(() => {
  vi.clearAllMocks();
  callable.mockImplementation(async (name: string, data: any) => ({ data: name === 'getWompiAvailability' ? { enabled: true, environment: 'test' }
    : name === 'getRechargeHistory' ? { recharges: [] }
      : name === 'getWompiConfig' ? { enabled: false, environment: 'test', publicKey: '' }
        : name === 'getWompiQuote' ? { quoteHash: 'a'.repeat(64), feeQuote: { version: 1, currency: 'COP', baseAmount: 10000, processingFee: 0, totalAmount: 10000 } }
        : { checkoutUrl: `https://checkout.wompi.co/p/?public-key=pub_test_synthetic&reference=${data?.rechargeId || 'synthetic'}&amount-in-cents=1000000&currency=COP&signature:integrity=${'a'.repeat(64)}` } }) as never);
});

describe('optional tenant Wompi UI', () => {
  it('selects only one payment method, retains the amount and does not create checkout on selection', async () => {
    render(<RechargeModal onClose={() => {}} />);
    const wompi = await screen.findByRole('radio', { name: /Wompi/ });
    const transfer = screen.getByRole('radio', { name: /QR \/ BRE-B/ });
    expect(transfer).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '$20.000' }));
    expect(screen.getByLabelText('Detalle de importes de la transferencia')).toHaveTextContent('$20.000 COP');
    fireEvent.click(wompi);
    expect(wompi).toBeChecked();
    expect(transfer).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Continuar con Transferencia/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver total' })).toBeVisible();
    expect(screen.queryByText('Revisá el total antes de pagar')).toBeNull();
    const conditions = screen.getAllByText(/Consultar el total no realiza cobros/).find(element => !element.closest('[hidden]'))!;
    expect(conditions.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(conditions.closest('details')!.querySelector('summary')!);
    expect(conditions).toBeVisible();
    expect(screen.queryByLabelText('Detalle de importes Wompi')).toBeNull();
    fireEvent.click(transfer);
    expect(screen.getByLabelText('2. Seleccioná el monto')).toHaveValue(20000);
    expect(callable.mock.calls.filter(([name]) => name === 'createWompiCheckout' || name === 'createRechargeRequest')).toHaveLength(0);
    expect(screen.getAllByText('Condiciones').some(element => !element.closest('[hidden]'))).toBe(true);
  });
  it.each([0, 1512])('shows only the server quote, including a processing fee of %i, and allows returning to QR without creating a pending payment', async fee => {
    callable.mockImplementation(async (name: string) => ({ data: name === 'getWompiAvailability' ? { enabled: true, environment: 'test' }
      : name === 'getRechargeHistory' ? { recharges: [] }
        : { quoteHash: 'a'.repeat(64), checkoutUrl: `https://checkout.wompi.co/p/?public-key=pub_test_synthetic&reference=synthetic&amount-in-cents=${(20000 + fee) * 100}`,
          feeQuote: { version: 1, currency: 'COP', baseAmount: 20000, processingFee: fee, totalAmount: 20000 + fee } } }) as never);
    render(<RechargeModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('radio', { name: /Wompi/ }));
    fireEvent.click(screen.getByRole('button', { name: '$20.000' }));
    expect(screen.queryByLabelText('Detalle de importes Wompi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver total' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    expect(screen.getByLabelText('Detalle de importes Wompi')).toHaveTextContent(`$${fee.toLocaleString('es-CO')} COP`);
    fireEvent.click(screen.getByRole('radio', { name: /QR \/ BRE-B/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Wompi/ }));
    expect(screen.getByRole('button', { name: /Continuar a Wompi por/ })).toHaveTextContent(`$${(20000 + fee).toLocaleString('es-CO')} COP`);
    expect(callable.mock.calls.filter(([name]) => name === 'createWompiCheckout')).toHaveLength(0);
    fireEvent.click(screen.getByRole('radio', { name: /QR \/ BRE-B/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar con Transferencia/ }));
    expect(screen.getByAltText('QR de pago')).toBeVisible();
  });
  it('keeps transfer usable when availability fails', async () => {
    callable.mockImplementation(async (name: string) => {
      if (name === 'getWompiAvailability') throw new Error('Synthetic unavailable');
      return { data: { recharges: [] } } as never;
    });
    render(<RechargeModal onClose={() => {}} />);
    expect(await screen.findByText(/No se pudo consultar Wompi/)).toBeVisible();
    expect(screen.queryByRole('radio', { name: /Wompi/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '$20.000' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar con Transferencia/ }));
    expect(screen.getByAltText('QR de pago')).toBeVisible();
  });
  it('admin fee opt-in belongs only to selected environment; switching tenant resets to merchant default', async () => {
    const { rerender } = render(<WompiSettings tenantId="a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar Wompi' })).not.toBeDisabled());
    expect(screen.getByLabelText('Quién asume el cargo')).toHaveValue('merchant');
    fireEvent.change(screen.getByLabelText('Quién asume el cargo'), { target: { value: 'customer' } });
    fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'prod' } });
    expect(screen.getByLabelText('Quién asume el cargo')).toHaveValue('merchant');
    fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'test' } });
    expect(screen.getByLabelText('Quién asume el cargo')).toHaveValue('customer');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    await screen.findByText(/Configuración guardada/);
    expect(callable).toHaveBeenCalledWith('saveWompiConfig', expect.objectContaining({ feePolicies: {
      test: { payer: 'customer', rateBps: 265, fixedFee: 700, vatBps: 1900 },
      prod: { payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 },
    } }));
    rerender(<WompiSettings tenantId="b" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar Wompi' })).not.toBeDisabled());
    expect(screen.getByLabelText('Quién asume el cargo')).toHaveValue('merchant');
  });
  it('absent/disabled config hides Wompi while QR and BRE-B remain usable in real modal', async () => {
    callable.mockImplementation(async (name: string) => ({ data: name === 'getRechargeHistory' ? { recharges: [] } : { enabled: false } }) as never);
    render(<RechargeModal onClose={() => {}} />);
    await screen.findByRole('button', { name: /Transferencia BRE-B/ });
    expect(screen.queryByRole('button', { name: 'Ver total' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('10,000'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Transferencia BRE-B/ }));
    expect(screen.getByAltText('QR de pago')).toHaveAttribute('src', '/fixture-qr.png');
    expect(screen.getByText('SYNTHETIC-BREB')).toBeInTheDocument();
  });
  it('renders a read-only opt-in quote and never creates pending state through preview', async () => {
    render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    expect(screen.queryByRole('link')).toBeNull();
    expect(callable).toHaveBeenCalledWith('getWompiQuote', { tenantId: 'a', amount: 10000 });
    expect(callable.mock.calls.filter(([name]) => name === 'createWompiCheckout')).toHaveLength(0);
    expect(screen.getByText('Prueba')).toBeVisible();
    expect(screen.getByText(/los pagos de prueba no acreditan saldo real/).closest('details')).not.toHaveAttribute('open');
    expect(document.querySelector('script[src*="wompi"]')).toBeNull();
  });
  it('invalid amounts do not create an intent', async () => {
    render(<WompiPaymentOption amount="1000.50" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('monto válido');
    expect(callable.mock.calls.filter(([name]) => name === 'createWompiCheckout')).toHaveLength(0);
  });
  it('provider/config failures keep the UI optional, and checkout host is allowlisted', async () => {
    callable.mockImplementation(async (name: string) => ({ data: name === 'getWompiAvailability' ? { enabled: true }
      : name === 'getRechargeHistory' ? { recharges: [{ id: 'wompi_synthetic', provider: 'wompi', userId: 'owner', tenantId: 'a', status: 'pending' }] } : { checkoutUrl: 'https://evil.invalid/p/' } }) as never);
    render(<WompiPaymentOption amount="10000" tenantId="a" rechargeId="wompi_synthetic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout inválido');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('tenant switches discard old checkout and hide unavailable tenant B', async () => {
    const { rerender } = render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    callable.mockResolvedValue({ data: { enabled: false } } as never);
    rerender(<WompiPaymentOption amount="10000" tenantId="b" />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Ver total' })).toBeNull();
  });
  it('resumes pending payment with only owned recharge ID; does not accept a new browser price', async () => {
    const original = callable.getMockImplementation()!;
    callable.mockImplementation(async (name: string, data: any) => name === 'getRechargeHistory'
      ? { data: { recharges: [{ id: 'wompi_synthetic', provider: 'wompi', userId: 'owner', tenantId: 'a', status: 'pending', amount: 10000 }] } } as never
      : original(name, data));
    render(<WompiPaymentOption amount="999999" tenantId="a" rechargeId="wompi_synthetic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    await screen.findByRole('button', { name: /Continuar a Wompi por/ });
    expect(callable).toHaveBeenCalledWith('createWompiCheckout', { tenantId: 'a', rechargeId: 'wompi_synthetic' });
  });
  it('admin saves keys only through private API; fields are passwords and cleared after saving', async () => {
    render(<WompiSettings tenantId="a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar Wompi' })).not.toBeDisabled());
    expect(screen.getByLabelText('Secreto de integridad')).toHaveAttribute('placeholder', 'test_integrity_…');
    fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'prod' } });
    expect(screen.getByLabelText('Secreto de eventos')).toHaveAttribute('placeholder', 'prod_events_…');
    fireEvent.change(screen.getByLabelText('Llave pública'), { target: { value: 'pub_prod_SYNTHETIC' } });
    for (const label of ['Llave privada', 'Secreto de integridad', 'Secreto de eventos']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
    }
    const synthetic = { privateKey: 'prv_prod_SYNTHETIC', integritySecret: 'prod_integrity_SYNTHETIC', eventsSecret: 'prod_events_SYNTHETIC' };
    for (const [label, value] of [['Llave privada', synthetic.privateKey], ['Secreto de integridad', synthetic.integritySecret], ['Secreto de eventos', synthetic.eventsSecret]]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    callable.mockRejectedValueOnce(new Error('Secreto de eventos inválido para Producción.'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Secreto de eventos inválido para Producción.');
    expect(screen.getByLabelText('Llave privada')).toHaveValue(synthetic.privateKey);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    await screen.findByText(/Configuración guardada/);
    expect(callable).toHaveBeenCalledWith('saveWompiConfig', { tenantId: 'a', enabled: false, environment: 'prod', publicKey: 'pub_prod_SYNTHETIC', ...synthetic,
      feePolicies: { test: { payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 }, prod: { payer: 'merchant', rateBps: 265, fixedFee: 700, vatBps: 1900 } } });
    for (const label of ['Llave privada', 'Secreto de integridad', 'Secreto de eventos']) expect(screen.getByLabelText(label)).toHaveValue('');
  });
  it('availability failure does not offer a checkout', async () => {
    callable.mockRejectedValue(new Error('Synthetic unavailable'));
    const { rerender } = render(<WompiPaymentOption amount="10000" tenantId="a" />);
    await waitFor(() => expect(callable).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('Podés seguir usando QR');
    rerender(<WompiPaymentOption amount="20000" tenantId="a" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Podés seguir usando QR');
  });
  it('late checkout response cannot reappear after the selected amount changes', async () => {
    let resolve!: (value: unknown) => void;
    const response = new Promise(done => { resolve = done; });
    callable.mockImplementation(async (name: string) => name === 'getWompiAvailability'
      ? { data: { enabled: true } } as never : response as never);
    const { rerender } = render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver total' }));
    rerender(<WompiPaymentOption amount="20000" tenantId="a" />);
    await act(async () => { resolve({ data: { checkoutUrl: 'https://checkout.wompi.co/p/?reference=stale' } }); });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver total' })).not.toBeDisabled();
  });
  it('admin labels sandbox explicitly and keeps manual actions only on legacy QR', async () => {
    render(<Recharges />);
    await screen.findByText('Wompi Pending');
    expect(screen.getByText('Esperando confirmación Wompi')).toBeInTheDocument();
    expect(screen.getByText('PRUEBA APROBADA · SIN SALDO REAL')).toBeInTheDocument();
    expect(screen.getAllByTitle('Aprobar')).toHaveLength(1);
    expect(screen.getAllByTitle('Rechazar')).toHaveLength(1);
  });
});
