import { render, screen, RenderOptions } from '@testing-library/react';
import { BrowserRouter, ReactElement } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import ServiceCard from '../components/ServiceCard';

const mockService = {
  id: '1',
  name: 'Netflix Premium',
  description: 'Acceso a Netflix premium por 1 mes',
  price: 25000,
  promotionalPrice: 19999,
  image: 'https://example.com/netflix.jpg'
};

const renderWithRouter = (component: ReactNode) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('ServiceCard', () => {
  it('renders service name', () => {
    renderWithRouter(<ServiceCard service={mockService} index={0} />);
    expect(screen.getByText('Netflix Premium')).toBeInTheDocument();
  });

  it('renders promotional price when available', () => {
    renderWithRouter(<ServiceCard service={mockService} index={0} />);
    expect(screen.getByText(/19,999/)).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  it('renders regular price when no promo', () => {
    const serviceWithoutPromo = {
      ...mockService,
      promotionalPrice: null
    };
    renderWithRouter(<ServiceCard service={serviceWithoutPromo} index={0} />);
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  it('has a link to service detail', () => {
    renderWithRouter(<ServiceCard service={mockService} index={0} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/servicio/1');
  });
});
