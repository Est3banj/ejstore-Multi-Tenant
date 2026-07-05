import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServiceCard from '../components/ServiceCard';

// Mock useApp hook to avoid requiring full TanStack Query + Store setup
vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    settings: {
      primaryColor: '#E50914',
      secondaryColor: '#1A1A1A',
    },
  }),
}));

const mockService = {
  id: '1',
  name: 'Netflix Premium',
  description: 'Acceso a Netflix premium por 1 mes',
  price: 25000,
  promotionalPrice: 19999,
  image: 'https://example.com/netflix.jpg'
};

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

describe('ServiceCard', () => {
  it('renders service name', () => {
    renderWithProviders(<ServiceCard service={mockService} index={0} />);
    expect(screen.getByText('Netflix Premium')).toBeInTheDocument();
  });

  it('renders promotional price when available', () => {
    renderWithProviders(<ServiceCard service={mockService} index={0} />);
    expect(screen.getByText(/19,999/)).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  it('renders regular price when no promo', () => {
    const serviceWithoutPromo = {
      ...mockService,
      promotionalPrice: null
    };
    renderWithProviders(<ServiceCard service={serviceWithoutPromo} index={0} />);
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  it('has a link to service detail', () => {
    renderWithProviders(<ServiceCard service={mockService} index={0} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/servicio/1');
  });
});
