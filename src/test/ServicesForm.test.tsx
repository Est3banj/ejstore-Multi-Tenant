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
      hasCodeExtraction: true,
    },
  ])),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  uploadImage: vi.fn(() => Promise.resolve('https://test.url')),
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

describe('Services Form - Code Extraction', () => {
  it('includes hasCodeExtraction in serviceData when submitting', async () => {
    const { createService } = await import('../services/firestore');
    renderWithProviders(<Services />);

    const addButton = await screen.findByText('Nuevo Servicio');
    fireEvent.click(addButton);

    const nameInput = await screen.findByLabelText('Nombre');
    fireEvent.change(nameInput, { target: { value: 'Test Service' } });

    const priceInput = screen.getByLabelText('Precio');
    fireEvent.change(priceInput, { target: { value: '10000' } });

    const extractionCheckbox = screen.getByLabelText('Extracción de Código (Gmail)');
    fireEvent.click(extractionCheckbox);

    const submitButton = screen.getByText('Crear');
    fireEvent.click(submitButton);

    await vi.waitFor(() => {
      expect(createService).toHaveBeenCalledWith(
        expect.objectContaining({
          hasCodeExtraction: true,
        }),
        expect.any(String)
      );
    });
  });

  it('populates hasCodeExtraction from existing service on edit', async () => {
    renderWithProviders(<Services />);

    const editButton = await screen.findByText('Editar');
    fireEvent.click(editButton);

    const extractionCheckbox = await screen.findByLabelText('Extracción de Código (Gmail)');
    expect(extractionCheckbox).toBeChecked();
  });
});
