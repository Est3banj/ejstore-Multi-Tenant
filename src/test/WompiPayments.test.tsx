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
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: { uid: 'owner' }, customer: { phone: '3001234567', balance: 0 }, role: 'client' }) }));
vi.mock('../store', () => ({ useTenantStore: (selector: (s: unknown) => unknown) => selector({ tenant: { id: 'a' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const callable = vi.mocked(customCallable);
beforeEach(() => {
  vi.clearAllMocks();
  callable.mockImplementation(async (name: string) => ({ data: name === 'getWompiAvailability' ? { enabled: true, environment: 'test' }
    : name === 'getRechargeHistory' ? { recharges: [] }
      : name === 'getWompiConfig' ? { enabled: false, environment: 'test', publicKey: '' }
        : { checkoutUrl: 'https://checkout.wompi.co/p/?reference=synthetic' } }) as never);
});

describe('optional tenant Wompi UI', () => {
  it('absent/disabled config hides Wompi while QR and BRE-B remain usable in real modal', async () => {
    callable.mockImplementation(async (name: string) => ({ data: name === 'getRechargeHistory' ? { recharges: [] } : { enabled: false } }) as never);
    render(<RechargeModal onClose={() => {}} />);
    await screen.findByRole('button', { name: /Transferencia BRE-B/ });
    expect(screen.queryByRole('button', { name: 'Pagar con Wompi' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('10,000'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Transferencia BRE-B/ }));
    expect(screen.getByAltText('QR de pago')).toHaveAttribute('src', '/fixture-qr.png');
    expect(screen.getByText('SYNTHETIC-BREB')).toBeInTheDocument();
  });
  it('renders real opt-in checkout, passes amount to backend, and never credits via browser callback', async () => {
    render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar con Wompi' }));
    const link = await screen.findByRole('link', { name: 'Continuar al checkout de Wompi' });
    expect(link).toHaveAttribute('href', 'https://checkout.wompi.co/p/?reference=synthetic');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(callable).toHaveBeenCalledWith('createWompiCheckout', expect.objectContaining({ tenantId: 'a', amount: 10000, idempotencyKey: expect.any(String) }));
    expect(screen.getByText(/No acredita saldo real/)).toBeInTheDocument();
    expect(document.querySelector('script[src*="wompi"]')).toBeNull();
  });
  it('invalid amounts do not create an intent', async () => {
    render(<WompiPaymentOption amount="1000.50" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar con Wompi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('monto válido');
    expect(callable.mock.calls.filter(([name]) => name === 'createWompiCheckout')).toHaveLength(0);
  });
  it('provider/config failures keep the UI optional, and checkout host is allowlisted', async () => {
    callable.mockImplementation(async (name: string) => ({ data: name === 'getWompiAvailability' ? { enabled: true } : { checkoutUrl: 'https://evil.invalid/p/' } }) as never);
    render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar con Wompi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout inválido');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('tenant switches discard old checkout and hide unavailable tenant B', async () => {
    const { rerender } = render(<WompiPaymentOption amount="10000" tenantId="a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar con Wompi' }));
    await screen.findByRole('link');
    callable.mockResolvedValue({ data: { enabled: false } } as never);
    rerender(<WompiPaymentOption amount="10000" tenantId="b" />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Pagar con Wompi' })).toBeNull();
  });
  it('resumes pending payment with only owned recharge ID; does not accept a new browser price', async () => {
    render(<WompiPaymentOption amount="999999" tenantId="a" rechargeId="wompi_synthetic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar pago Wompi' }));
    await screen.findByRole('link');
    expect(callable).toHaveBeenCalledWith('createWompiCheckout', { tenantId: 'a', rechargeId: 'wompi_synthetic' });
  });
  it('admin saves keys only through private API; fields are passwords and cleared after saving', async () => {
    render(<WompiSettings tenantId="a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar Wompi' })).not.toBeDisabled());
    for (const label of ['Llave privada', 'Secreto de integridad', 'Secreto de eventos']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'SYNTHETIC' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Wompi' }));
    await screen.findByText(/Configuración guardada/);
    expect(callable).toHaveBeenCalledWith('saveWompiConfig', expect.objectContaining({ tenantId: 'a', enabled: false, privateKey: 'SYNTHETIC' }));
    expect(screen.getByLabelText('Llave privada')).toHaveValue('');
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
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar con Wompi' }));
    rerender(<WompiPaymentOption amount="20000" tenantId="a" />);
    await act(async () => { resolve({ data: { checkoutUrl: 'https://checkout.wompi.co/p/?reference=stale' } }); });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pagar con Wompi' })).not.toBeDisabled();
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
