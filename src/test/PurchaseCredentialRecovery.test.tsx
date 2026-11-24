import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { getPurchaseCredentials } from '../services/marketplace';
import PurchaseResult from '../pages/customer/PurchaseResult';

vi.mock('../services/marketplace', () => ({ getPurchaseCredentials: vi.fn() }));
const renderResult = () => render(<MemoryRouter initialEntries={['/compra-exitosa/purchase']}><Routes>
  <Route path="/compra-exitosa/:purchaseId" element={<PurchaseResult />} />
</Routes></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); });
it('reload recovers a single-profile purchase through the private endpoint', async () => {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ accountId: 'private-parent', profileName: 'Owned profile', serviceName: 'Synthetic service' }) } as never);
  vi.mocked(getPurchaseCredentials).mockResolvedValue({ email: 'fictional@example.invalid', password: 'FICTIONAL-ONLY' });
  renderResult();
  expect(await screen.findByText('fictional@example.invalid')).toBeInTheDocument();
  expect(getPurchaseCredentials).toHaveBeenCalledWith('purchase');
  expect(getDoc).toHaveBeenCalledTimes(1); // Purchase only; no public parent lookup.
});
it('bulk purchase reload keeps inline delivery without a parent lookup', async () => {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ profiles: [{ credential: { email: 'bulk@example.invalid', password: 'FICTIONAL' } }] }) } as never);
  renderResult();
  expect(await screen.findByText('bulk@example.invalid')).toBeInTheDocument();
  expect(getPurchaseCredentials).not.toHaveBeenCalled();
});
it('reload with an empty profiles array uses recovery and keeps owned profile metadata', async () => {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ accountId: 'parent', profiles: [], profileName: 'Owned legacy profile' }) } as never);
  vi.mocked(getPurchaseCredentials).mockResolvedValue({ email: 'empty@example.invalid', password: 'FICTIONAL' });
  renderResult();
  expect(await screen.findByText('empty@example.invalid')).toBeInTheDocument();
  expect(screen.getByText('Owned legacy profile')).toBeInTheDocument();
  expect(getDoc).toHaveBeenCalledTimes(1);
});
it('denied recovery renders an error without attempting a parent SDK fallback', async () => {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => ({ accountId: 'parent' }) } as never);
  vi.mocked(getPurchaseCredentials).mockRejectedValue(new Error('not-found'));
  renderResult();
  expect(await screen.findByText('No se encontraron datos de la compra.')).toBeInTheDocument();
  expect(getDoc).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('¡Compra exitosa!')).not.toBeInTheDocument();
});
