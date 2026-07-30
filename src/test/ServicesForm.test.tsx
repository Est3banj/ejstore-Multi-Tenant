import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Services from '../pages/admin/Services';

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    refreshServices: vi.fn(),
    tenant: { id: 'test-tenant-id' },
    userTenantId: 'test-tenant-id',
  }),
}));

vi.mock('../services/firestore', () => ({
  getAllServices: vi.fn(() => Promise.resolve([
    {
      id: 'svc-1',
      name: 'Netflix Premium',
      description: 'Acceso Netflix',
      price: 25000,
      category: 'pantallas',
      image: '',
      active: true,
      isPopular: false,
    },
  ])),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  uploadImage: vi.fn(() => Promise.resolve('https://test.url')),
}));

vi.mock('../services/marketplace', () => ({
  getAccounts: vi.fn(() => Promise.resolve([])),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  getServiceStock: vi.fn(() => Promise.resolve({ total: 0, available: 0, sold: 0 })),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderWithProviders = (component: ReactNode) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Services Form', () => {
  it('renders services list', async () => {
    renderWithProviders(<Services />);
    expect(await screen.findByText('Netflix Premium')).toBeInTheDocument();
  });

  it('opens add modal when clicking Nuevo Servicio', async () => {
    renderWithProviders(<Services />);
    const addButton = await screen.findByText('Nuevo Servicio');
    fireEvent.click(addButton);
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio')).toBeInTheDocument();
  });

  it('shows edit modal when clicking Editar', async () => {
    renderWithProviders(<Services />);
    const editButton = await screen.findByText('Editar');
    fireEvent.click(editButton);
    expect(await screen.findByDisplayValue('Netflix Premium')).toBeInTheDocument();
  });
});
