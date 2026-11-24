import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Product from '../pages/Product';
import Home from '../pages/Home';
import ServiceCard from '../components/ServiceCard';
import Catalogo from '../pages/reseller/CatalogoMayorista';
import { getAvailableServiceStock } from '../services/marketplace';
import { getServiceById, getWholesaleServices } from '../services/firestore';

const h = vi.hoisted(() => ({ app: {} as any, auth: {} as any }));
vi.mock('../context/AppContext', () => ({ useApp: () => h.app }));
vi.mock('../store/authStore', () => ({ useAuthStore: (selector?: any) => selector ? selector(h.auth) : h.auth }));
vi.mock('../store', () => ({ useEffectiveTenantId: () => 't1' }));
vi.mock('../services/apiClient', () => ({ customCallable: vi.fn().mockResolvedValue({ data: {} }) }));
vi.mock('../services/marketplace', () => ({
  getAvailableServiceStock: vi.fn(), processPurchase: vi.fn(), createDiamondOrder: vi.fn(),
  processBulkPurchase: vi.fn(), getResellerById: vi.fn().mockResolvedValue({ balance: 100000 }),
}));
vi.mock('../services/firestore', () => ({ getServiceById: vi.fn(), getWholesaleServices: vi.fn() }));
vi.mock('../components/BannerSlider', () => ({ default: () => null }));
vi.mock('../components/Roulette', () => ({ default: () => null }));
vi.mock('../pages/reseller/ResellerPurchaseSuccessModal', () => ({ default: () => null }));
vi.mock('../pages/reseller/ResellerPurchaseConfirmModal', () => ({ default: () => null }));

const service = { id: 'svc', tenantId: 't1', name: 'Synthetic subscription', price: 2000, category: 'pantallas', serviceType: 'subscription' };
const renderProduct = () => render(<MemoryRouter initialEntries={['/servicio/svc']}><Routes>
  <Route path="/servicio/:id" element={<Product />} />
</Routes></MemoryRouter>);
beforeEach(() => {
  vi.mocked(getAvailableServiceStock).mockReset();
  vi.mocked(getServiceById).mockResolvedValue(service as never);
  vi.mocked(getWholesaleServices).mockResolvedValue([service] as never);
  h.app = { settings: { whatsappNumber: '3100000000' }, tenant: { id: 't1' }, services: [service] };
  h.auth = { adminUser: { uid: 'reseller' }, user: { uid: 'owner' }, customer: { uid: 'owner', balance: 100000 } };
});

describe('Unknown availability is not zero or by-order', () => {
  it('Product displays an error and disables balance purchase on stock failure', async () => {
    vi.mocked(getAvailableServiceStock).mockRejectedValue(new Error('unavailable'));
    renderProduct();
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo verificar la disponibilidad');
    expect(screen.queryByText('Disponible por encargo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comprar con saldo/i })).toBeDisabled();
    expect(getAvailableServiceStock).toHaveBeenCalledWith('svc', 't1');
  });
  it('Product preserves real stock-zero by-order flow', async () => {
    vi.mocked(getAvailableServiceStock).mockResolvedValue(0);
    renderProduct();
    expect(await screen.findByText('Disponible por encargo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comprar con saldo/i })).toBeDisabled();
  });
  it('ServiceCard does not call unknown availability by-order', () => {
    render(<MemoryRouter><ServiceCard service={service as never} index={0} /></MemoryRouter>);
    expect(screen.queryByText('Por encargo')).not.toBeInTheDocument();
    expect(screen.queryByText('0 disp.')).not.toBeInTheDocument();
  });
  it('Home sends tenant scope and does not fabricate stock-zero on failure', async () => {
    vi.mocked(getAvailableServiceStock).mockRejectedValue(new Error('unavailable'));
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(getAvailableServiceStock).toHaveBeenCalledWith('svc', 't1'));
    expect(screen.queryByText('Por encargo')).not.toBeInTheDocument();
  });
  it('Reseller catalog reports failed availability instead of rendering zero stock', async () => {
    vi.mocked(getAvailableServiceStock).mockRejectedValue(new Error('unavailable'));
    render(<MemoryRouter><Catalogo /></MemoryRouter>);
    expect(await screen.findByText('Error al cargar el catálogo')).toBeInTheDocument();
    expect(screen.queryByText('Stock: 0')).not.toBeInTheDocument();
    expect(getAvailableServiceStock).toHaveBeenCalledWith('svc', 't1');
  });
});
