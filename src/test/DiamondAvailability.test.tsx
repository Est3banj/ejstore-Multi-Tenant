import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Product from '../pages/Product';
import Home from '../pages/Home';
import ServiceCard from '../components/ServiceCard';
import { getServiceById } from '../services/firestore';
import { getAvailableServiceStock } from '../services/marketplace';
import { customCallable } from '../services/apiClient';

// Estado compartido para los mocks de contexto/auth (los factories de vi.mock se elevan)
const h = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  auth: {} as Record<string, unknown>,
}));

vi.mock('../services/apiClient', () => ({
  customCallable: vi.fn(),
}));

vi.mock('../services/firestore', () => ({
  getServiceById: vi.fn(),
}));

vi.mock('../services/marketplace', () => ({
  getAvailableServiceStock: vi.fn(),
  processPurchase: vi.fn(),
  createDiamondOrder: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => h.app,
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(h.auth) : h.auth,
}));

// Home sólo necesita la grilla: stub de slider y ruleta
vi.mock('../components/BannerSlider', () => ({ default: () => null }));
vi.mock('../components/Roulette', () => ({ default: () => null }));

const diamondService = {
  id: 'svc-diamond',
  tenantId: 't1',
  name: 'Diamantes 100',
  description: 'Paquete de diamantes Free Fire',
  price: 15000,
  category: 'diamantes',
  serviceType: 'diamond',
  images: [],
  image: '',
  isActive: true,
};

const subscriptionService = {
  id: 'svc-netflix',
  tenantId: 't1',
  name: 'Netflix Premium',
  description: 'Cuenta compartida 1 mes',
  price: 25000,
  category: 'pantallas',
  serviceType: 'subscription',
  images: [],
  image: '',
  isActive: true,
};

const renderProduct = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/servicio/${id}`]}>
      <Routes>
        <Route path="/servicio/:id" element={<Product />} />
      </Routes>
    </MemoryRouter>
  );

describe('Disponibilidad de diamantes vs. stock de suscripciones', () => {
  beforeEach(() => {
    vi.mocked(getServiceById).mockReset();
    vi.mocked(getAvailableServiceStock).mockReset();
    vi.mocked(customCallable).mockReset();
    // Home usa useQuery (getPublicStats) — proveer client por defecto
    vi.mocked(customCallable).mockResolvedValue({
      data: { rechargesThisMonth: 0 },
    } as never);
    h.app = {
      settings: { primaryColor: '#E50914', whatsappNumber: '3100000000' },
      tenant: { id: 't1' },
      services: [],
      refreshServices: vi.fn(),
    };
    h.auth = {
      user: { uid: 'u1' },
      customer: { uid: 'u1', email: 'cliente@test.com', balance: 50000 },
    };
  });

  it('Product: diamante muestra "Disponible" y CTA habilitado, sin query de stock', async () => {
    // Aunque el stock devuelva 0, un diamante nunca consulta cuentas
    vi.mocked(getServiceById).mockResolvedValue(diamondService as never);
    vi.mocked(getAvailableServiceStock).mockResolvedValue(0);

    renderProduct('svc-diamond');

    expect(await screen.findByText('Disponible')).toBeInTheDocument();
    expect(screen.queryByText('Agotado')).toBeNull();
    expect(screen.getByRole('button', { name: /Comprar con saldo/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Comprar por WhatsApp/i })).toBeEnabled();
    expect(getAvailableServiceStock).not.toHaveBeenCalled();
  });

  it('Product: suscripción con stock 0 muestra "Disponible por encargo" (ámbar), nunca "Agotado"', async () => {
    vi.mocked(getServiceById).mockResolvedValue(subscriptionService as never);
    vi.mocked(getAvailableServiceStock).mockResolvedValue(0);

    renderProduct('svc-netflix');

    expect(await screen.findByText('Disponible por encargo')).toBeInTheDocument();
    expect(screen.queryByText('Agotado')).toBeNull();
    expect(screen.queryByText('Disponible')).toBeNull();
    expect(getAvailableServiceStock).toHaveBeenCalledWith('svc-netflix', 't1');
  });

  it('ServiceCard: diamante con stock 0 muestra "Disponible", nunca "Agotado"', () => {
    render(
      <BrowserRouter>
        <ServiceCard service={diamondService as never} index={0} stock={0} />
      </BrowserRouter>
    );

    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.queryByText('Agotado')).toBeNull();
  });

  it('ServiceCard: suscripción con stock 0 muestra ámbar "Por encargo", nunca "Agotado"', () => {
    render(
      <BrowserRouter>
        <ServiceCard service={subscriptionService as never} index={0} stock={0} />
      </BrowserRouter>
    );

    expect(screen.getByText('Por encargo')).toBeInTheDocument();
    expect(screen.queryByText('Agotado')).toBeNull();
    expect(screen.queryByText('Disponible')).toBeNull();
  });

  it('Home: saltea la query de stock de diamantes y el card muestra "Disponible"', async () => {
    h.app.services = [diamondService, subscriptionService];
    vi.mocked(getAvailableServiceStock).mockResolvedValue(0);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Home />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Espera a que termine la carga de stock de la suscripción
    expect(await screen.findByText('Por encargo')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();

    expect(getAvailableServiceStock).toHaveBeenCalledTimes(1);
    expect(getAvailableServiceStock).toHaveBeenCalledWith('svc-netflix', 't1');
    expect(getAvailableServiceStock).not.toHaveBeenCalledWith('svc-diamond', 't1');
  });
});
