import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MisClientes from '../pages/reseller/MisClientes';
import VerCuenta from '../pages/public/VerCuenta';

const boundary = vi.hoisted(() => {
  const session = { getIdToken: vi.fn(async () => 'synthetic-panel-token'), getIdTokenResult: vi.fn(async () => ({ token: 'synthetic-panel-token', claims: { role: 'reseller' } })) };
  return { getDocs: vi.fn(), writes: vi.fn(), fetch: vi.fn(), auth: { currentUser: session, authStateReady: vi.fn(async () => {}) } };
});
vi.mock('../services/firebase', () => ({ db: {}, adminDb: {}, auth: boundary.auth, adminAuth: boundary.auth }));
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ adminUser: { uid: 'owner' } }) }));
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }), query: (ref: unknown) => ref,
  where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), getDocs: boundary.getDocs,
  setDoc: boundary.writes, doc: boundary.writes, serverTimestamp: boundary.writes,
}));

beforeEach(() => {
  boundary.fetch.mockReset(); boundary.getDocs.mockReset(); boundary.writes.mockClear();
  vi.stubGlobal('fetch', boundary.fetch);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reseller generates through the authenticated API with purchase/index only, never client credentials or Firestore writes', async () => {
  boundary.getDocs.mockResolvedValue({ docs: [{ id: 'purchase', data: () => ({ customerId: 'owner', serviceId: 'service',
    serviceName: 'Synthetic service', accountIds: ['account'], credentials: [{ email: 'synthetic@example.invalid', password: 'FICTIONAL' }],
    createdAt: { toDate: () => new Date('2026-11-27') }, status: 'active' }) }] });
  boundary.fetch.mockResolvedValue(new Response(JSON.stringify({ result: { token: 'a'.repeat(64) } }), { status: 200 }));
  render(<MemoryRouter><MisClientes /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Acciones'));
  fireEvent.click(screen.getByText('Ver ticket'));
  fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
  await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(1));
  const [url, options] = boundary.fetch.mock.calls[0];
  expect(url).toMatch(/\/api\/createPublicLink$/);
  expect(options.headers.Authorization).toBe('Bearer synthetic-panel-token');
  expect(JSON.parse(options.body)).toEqual({ data: { purchaseId: 'purchase', accountIndex: 0 } });
  expect(boundary.writes).not.toHaveBeenCalled();
});

it('public viewer keeps anonymous bearer-token lookup through API and displays generic rejection', async () => {
  boundary.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'not-found', message: 'Link no disponible' } }), { status: 404 }));
  // Public calls use getIdToken only if signed in; simulate an anonymous viewer.
  const previous = boundary.auth.currentUser;
  boundary.auth.currentUser = null as any;
  try {
    render(<MemoryRouter initialEntries={['/cuenta/LegacyMixedCaseToken1']}><Routes><Route path="/cuenta/:token" element={<VerCuenta />} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Caso'), { target: { value: 'netflix' } });
    fireEvent.click(screen.getByRole('button', { name: /Consultar/i }));
    await screen.findByText('Link no disponible');
    const [url, options] = boundary.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/getPublicAccount$/);
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual({ data: { token: 'LegacyMixedCaseToken1' } });
    expect(boundary.getDocs).not.toHaveBeenCalled();
    expect(boundary.writes).not.toHaveBeenCalled();
  } finally { boundary.auth.currentUser = previous; }
});

it('public viewer renders the actual metadata-only API contract without requiring copied credentials', async () => {
  boundary.auth.currentUser = null as any;
  boundary.fetch.mockResolvedValue(new Response(JSON.stringify({ result: {
    success: true, account: { serviceName: 'Synthetic service', status: 'active',
      createdAt: '2026-11-27T12:00:00Z', expiresAt: '2026-12-27T12:00:00Z' },
    lastEmail: { subject: 'Synthetic code', from: 'synthetic@example.invalid',
      date: '2026-11-27T12:00:00Z', text: 'Synthetic message', html: '', code: '123456' },
  } }), { status: 200 }));
  render(<MemoryRouter initialEntries={['/r/LegacyMixedCaseToken1']}><Routes><Route path="/r/:token" element={<VerCuenta />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Caso'), { target: { value: 'netflix' } });
  fireEvent.click(screen.getByRole('button', { name: /Consultar/i }));
  await screen.findByText('Synthetic service');
  expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  expect(screen.queryByText('Credenciales de la cuenta')).not.toBeInTheDocument();
});
