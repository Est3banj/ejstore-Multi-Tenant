import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sdk } from './sdk-boundary';
import { auth, adminAuth, db, adminDb, functions, adminFunctions, logAnalyticsEvent } from '../../src/services/firebase';
import { register, SIGNUP_BONUS } from '../../src/services/auth';
import { customCallable } from '../../src/services/apiClient';
import { getServices, getServiceById, getWholesaleServices } from '../../src/services/firestore';
import { getAvailableServiceStock, getPurchaseCredentials, processPurchase, processBulkPurchase, processDiamondOrder } from '../../src/services/marketplace';
import { useAuthStore } from '../../src/store/authStore';
import { useTenantStore } from '../../src/store/tenantStore';
import Catalogo from '../../src/pages/reseller/CatalogoMayorista';
import Product from '../../src/pages/Product';
import PurchaseResult from '../../src/pages/customer/PurchaseResult';

const tenant = { id: 't1', name: 'Synthetic tenant', isActive: true };
const subscription = { tenantId: 't1', name: 'Synthetic subscription', price: 2000, wholesalePrice: 1500, category: 'pantallas', serviceType: 'subscription', active: true, images: [] };
const customer = { uid: 'client-A', email: 'client@example.invalid', firstName: 'Client', lastName: 'A', phone: 'synthetic', balance: 10000, createdAt: { toDate: () => new Date(0) } };
const user = (uid: string, claims = {}) => ({ uid, email: `${uid}@example.invalid`, getIdToken: vi.fn(async () => `token-${uid}`), getIdTokenResult: vi.fn(async () => ({ claims })) });
const snapshot = (path: string, data: any) => ({ id: path.split('/').at(-1), exists: () => data !== undefined, data: () => data });
const defer = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
let stop: (() => void) | undefined;
let requests: Array<{ name: string; headers: any; data: any }>;
let reply: (name: string, data: any) => any;

async function sessions() {
  sdk.documents.set('customers/client-A', customer);
  sdk.emit(auth, user('client-A'));
  sdk.emit(adminAuth, user('reseller-B', { role: 'reseller', tenantId: 't1' }));
  stop = useAuthStore.getState().initialize();
  await waitFor(() => expect(useAuthStore.getState().initialized).toBe(true));
}
function mount(node: React.ReactNode, path = '/') {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={query}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>);
}
const product = () => mount(<Routes><Route path="/servicio/:id" element={<Product />} /><Route path="/compra-exitosa/:purchaseId" element={<PurchaseResult />} /></Routes>, '/servicio/svc');
const purchase = () => mount(<Routes><Route path="/compra/:purchaseId" element={<PurchaseResult />} /></Routes>, '/compra/purchased');

beforeEach(() => {
  stop = undefined;
  sdk.emit(auth, null); sdk.emit(adminAuth, null);
  sdk.documents.clear(); sdk.reads.length = 0; sdk.writes.length = 0;
  sdk.documents.set('services/svc', subscription);
  sdk.documents.set('services/diamond', { ...subscription, name: 'Synthetic diamond', serviceType: 'diamond' });
  sdk.documents.set('resellers/reseller-B', { tenantId: 't1', balance: 10000, commissionPercent: 10 });
  sdk.documents.set('tenants/t1', tenant);
  sdk.getDoc.mockReset().mockImplementation(async ref => {
    sdk.reads.push(ref);
    return snapshot(ref.path, sdk.documents.get(ref.path));
  });
  sdk.getDocs.mockReset().mockImplementation(async ref => {
    sdk.reads.push(ref);
    return { docs: [...sdk.documents].filter(([path, data]) => path.startsWith(ref.path + '/') && path.split('/').length === ref.path.split('/').length + 1 && (ref.filters || []).every((f: any) => data[f.field] === f.value)).map(([path, data]) => snapshot(path, data)) };
  });
  sdk.logEvent.mockReset();
  useAuthStore.setState({ user: null, adminUser: null, customer: null, role: null, userTenantId: null, initialized: false, loading: false, isAdmin: false });
  useTenantStore.setState({ tenant: tenant as any, loading: false, error: null });
  requests = [];
  reply = name => name === 'getStockAvailability' ? { available: 3 } : name === 'getPurchaseCredentials' ? { credential: { email: 'assigned@example.invalid', password: 'synthetic-fixture' } } : { success: true };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const name = String(url).split('/').at(-1)!;
    const data = JSON.parse(options.body).data;
    requests.push({ name, headers: options.headers, data });
    const result = await reply(name, data);
    return result instanceof Response ? result : new Response(JSON.stringify({ result }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); stop?.(); vi.unstubAllGlobals(); });

describe('Real frontend contracts / external SDK and HTTP boundaries only', () => {
  it('retains both Firebase apps and legacy Functions/Firestore identities', () => {
    expect(auth).not.toBe(adminAuth);
    expect(db.app).toBe(auth.app); expect(adminDb.app).toBe(adminAuth.app);
    expect(functions.app).toBe(auth.app); expect(adminFunctions.app).toBe(adminAuth.app);
    expect(sdk.sessions.size).toBe(2);
  });
  it('uses the existing signup bonus once in the real registration write', async () => {
    await register('new@example.invalid', 'synthetic-only', 'New', 'Client', 'fixture', 't1');
    expect(SIGNUP_BONUS).toBe(1000);
    expect(sdk.writes).toHaveLength(1);
    expect(sdk.writes[0]).toMatchObject({ ref: { db, path: 'customers/registered' }, data: { balance: 1000, tenantId: 't1' } });
  });
  it('forwards analytics to the supported external SDK', async () => {
    await Promise.resolve();
    logAnalyticsEvent('purchase', { value: 2000 });
    expect(sdk.logEvent).toHaveBeenCalledWith(expect.objectContaining({ app: auth.app }), 'purchase', { value: 2000 });
  });
  it('analytics SDK failure does not break a purchase callback', () => {
    sdk.logEvent.mockImplementation(() => { throw Error('external SDK failure'); });
    expect(() => logAnalyticsEvent('purchase')).not.toThrow();
  });
  it('projects real service discriminators and excludes diamonds from wholesale', async () => {
    const all = await getServices('t1');
    expect(all.find(s => s.id === 'diamond')?.serviceType).toBe('diamond');
    expect((await getWholesaleServices('t1', adminDb)).map(s => s.id)).toEqual(['svc']);
    expect(sdk.reads.at(-1)).toMatchObject({ db: adminDb, filters: [{ field: 'tenantId', value: 't1' }] });
  });
  it('propagates wholesale SDK errors rather than fabricating empty stock', async () => {
    sdk.getDocs.mockRejectedValueOnce(Error('permission-denied'));
    await expect(getWholesaleServices('t1', adminDb)).rejects.toThrow('permission-denied');
  });
  it('keeps tenant ownership on individual service lookup', async () => {
    expect((await getServiceById('diamond', 't1'))?.serviceType).toBe('diamond');
    expect(await getServiceById('diamond', 'other-tenant')).toBeNull();
  });
  it('sends client purchases/recovery and reseller bulk calls with distinct tokens', async () => {
    await sessions();
    await processPurchase({ serviceId: 'svc', tenantId: 't1' });
    await processBulkPurchase({ serviceId: 'svc', tenantId: 't1', quantity: 1 });
    await getPurchaseCredentials('purchased');
    expect(requests.map(r => r.headers.Authorization)).toEqual(['Bearer token-client-A', 'Bearer token-reseller-B', 'Bearer token-client-A']);
  });
  it('public stock works without a session and never sends an admin token', async () => {
    sdk.emit(adminAuth, user('admin-B'));
    expect(await getAvailableServiceStock('svc', 't1')).toBe(3);
    expect(requests[0]).toMatchObject({ name: 'getStockAvailability', data: { serviceId: 'svc', tenantId: 't1' } });
    expect(requests[0].headers.Authorization).toBeUndefined();
  });
  it('does not replace a missing client token with the signed-in admin', async () => {
    sdk.emit(adminAuth, user('admin-B'));
    await expect(getPurchaseCredentials('purchased')).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
  });
  it('does not replace a missing admin token with a signed-in client', async () => {
    sdk.emit(auth, user('client-A'));
    await expect(processBulkPurchase({ serviceId: 'svc', tenantId: 't1', quantity: 1 })).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
  });
  it('surfaces token refresh failure as authentication, not anonymous HTTP', async () => {
    const client = user('client-A'); client.getIdToken.mockRejectedValueOnce(Error('expired'));
    sdk.emit(auth, client);
    await expect(getPurchaseCredentials('purchased')).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
  });
  it('rejects an empty token before fetching', async () => {
    const client = user('client-A'); client.getIdToken.mockResolvedValueOnce(''); sdk.emit(auth, client);
    await expect(customCallable('processPurchase', {})).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
  });
  it('rejects a token resolved after a client identity transition', async () => {
    const token = defer<string>(); const client = user('client-A'); client.getIdToken.mockReturnValueOnce(token.promise);
    sdk.emit(auth, client);
    const pending = getPurchaseCredentials('purchased');
    await waitFor(() => expect(client.getIdToken).toHaveBeenCalled());
    sdk.emit(auth, user('client-C')); token.resolve('token-client-A');
    await expect(pending).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
  });
  it('does not return private data from a response after logout', async () => {
    const response = defer<any>(); sdk.emit(auth, user('client-A')); reply = () => response.promise;
    const pending = getPurchaseCredentials('purchased');
    await waitFor(() => expect(requests).toHaveLength(1));
    sdk.emit(auth, null); response.resolve({ credential: { email: 'assigned@example.invalid', password: 'synthetic' } });
    await expect(pending).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  });
  it('admin processing uses the admin token and observes refreshed SDK tokens on each call', async () => {
    await sessions();
    const admin = user('admin-B', { role: 'admin', tenantId: 't1' });
    sdk.emit(adminAuth, admin);
    await processDiamondOrder({ orderId: 'order', action: 'confirm' });
    admin.getIdToken.mockResolvedValueOnce('refreshed-admin-B');
    await processDiamondOrder({ orderId: 'order', action: 'reject', reason: 'Synthetic reason' });
    expect(requests.map(r => r.headers.Authorization)).toEqual(['Bearer token-admin-B', 'Bearer refreshed-admin-B']);
    expect(auth.currentUser?.uid).toBe('client-A');
  });
  it('rejects a pending admin token after changing admin while client remains signed in', async () => {
    await sessions();
    const token = defer<string>(); const admin = user('admin-B'); admin.getIdToken.mockReturnValueOnce(token.promise);
    sdk.emit(adminAuth, admin);
    const pending = processDiamondOrder({ orderId: 'order', action: 'confirm' });
    await waitFor(() => expect(admin.getIdToken).toHaveBeenCalled());
    sdk.emit(adminAuth, user('admin-D')); token.resolve('token-admin-B');
    await expect(pending).rejects.toMatchObject({ code: 'functions/unauthenticated' });
    expect(requests).toHaveLength(0);
    expect(auth.currentUser?.uid).toBe('client-A');
  });
  it('waits for the SDK persisted session before a private request', async () => {
    const ready = defer<void>();
    const original = auth.authStateReady;
    auth.authStateReady = () => ready.promise;
    try {
      const pending = getPurchaseCredentials('purchased');
      await Promise.resolve(); expect(requests).toHaveLength(0);
      sdk.emit(auth, user('persisted-client')); ready.resolve();
      await pending;
      expect(requests[0].headers.Authorization).toBe('Bearer token-persisted-client');
    } finally { auth.authStateReady = original; }
  });
  it('preserves server permission errors and permits a subsequent valid retry', async () => {
    sdk.emit(auth, user('client-A'));
    reply = () => new Response(JSON.stringify({ error: { code: 'permission-denied', message: 'Compra ajena' } }), { status: 403 });
    await expect(getPurchaseCredentials('purchased')).rejects.toMatchObject({ code: 'functions/permission-denied', message: 'Compra ajena' });
    reply = () => ({ credential: { email: 'assigned@example.invalid', password: 'synthetic' } });
    expect((await getPurchaseCredentials('purchased')).email).toBe('assigned@example.invalid');
  });
  it('keeps client customer and panel tenant independent through admin logout', async () => {
    await sessions();
    expect(useAuthStore.getState()).toMatchObject({ user: { uid: 'client-A' }, adminUser: { uid: 'reseller-B' }, customer: { uid: 'client-A' }, role: 'reseller', userTenantId: 't1' });
    sdk.emit(adminAuth, null);
    await waitFor(() => expect(useAuthStore.getState().role).toBeNull());
    expect(useAuthStore.getState().customer?.uid).toBe('client-A');
    expect(auth.currentUser?.uid).toBe('client-A');
  });
  it('discards stale client role/customer resolution after switching identity', async () => {
    const old = defer<any>();
    sdk.getDoc.mockImplementation(async ref => ref.path === 'users/client-A' ? old.promise : snapshot(ref.path, sdk.documents.get(ref.path)));
    sdk.documents.set('customers/client-C', { ...customer, uid: 'client-C' });
    sdk.emit(auth, user('client-A')); stop = useAuthStore.getState().initialize();
    sdk.emit(auth, user('client-C'));
    await waitFor(() => expect(useAuthStore.getState().customer?.uid).toBe('client-C'));
    old.resolve(snapshot('users/client-A', undefined));
    await Promise.resolve(); await Promise.resolve();
    expect(useAuthStore.getState().customer?.uid).toBe('client-C');
  });
  it('unsubscribes both auth listeners and ignores their pending callbacks', async () => {
    const old = defer<any>(); sdk.getDoc.mockReturnValueOnce(old.promise);
    sdk.emit(auth, user('client-A')); stop = useAuthStore.getState().initialize(); stop?.(); stop = undefined;
    old.resolve(snapshot('users/client-A', { role: 'admin', tenantId: 'old' }));
    await Promise.resolve(); await Promise.resolve();
    expect([...sdk.listeners.values()].every(set => set.size === 0)).toBe(true);
    expect(useAuthStore.getState().role).toBeNull();
  });
  it('patches absolute balance idempotently without another credit/debit write', async () => {
    await sessions();
    useAuthStore.getState().patchBalance(8000);
    const patched = useAuthStore.getState().customer;
    useAuthStore.getState().patchBalance(8000); useAuthStore.getState().patchBalance(NaN);
    expect(useAuthStore.getState().customer).toBe(patched);
    expect(patched?.balance).toBe(8000); expect(sdk.writes).toHaveLength(0);
  });
  it('does not overwrite a purchase balance with a refresh started before the callback', async () => {
    await sessions();
    const remote = defer<any>(); sdk.getDoc.mockReturnValueOnce(remote.promise);
    const refreshing = useAuthStore.getState().refreshCustomer();
    useAuthStore.getState().patchBalance(8000);
    remote.resolve(snapshot('customers/client-A', customer)); await refreshing;
    expect(useAuthStore.getState().customer?.balance).toBe(8000);
    await useAuthStore.getState().refreshCustomer();
    expect(useAuthStore.getState().customer?.balance).toBe(10000);
  });
  it('renders the real catalog and buys through the panel HTTP session', async () => {
    await sessions();
    reply = name => name === 'getStockAvailability' ? { available: 3 } : { success: true, newBalance: 8500, purchaseId: 'bulk', serviceName: subscription.name, quantity: 1, credentials: [{ email: 'assigned@example.invalid', password: 'synthetic' }] };
    mount(<Catalogo />);
    fireEvent.change(await screen.findByPlaceholderText('Buscar servicio por nombre, categoría...'), { target: { value: 'Synthetic subscription' } });
    expect(await screen.findByText('Stock: 3')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic diamond')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '$1,500' }));
    fireEvent.change(await screen.findByPlaceholderText('Ej: María García'), { target: { value: 'Synthetic buyer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comprar', exact: true }));
    expect(await screen.findByText('Compra Exitosa')).toBeInTheDocument();
    expect(requests.find(r => r.name === 'processBulkPurchase')?.headers.Authorization).toBe('Bearer token-reseller-B');
    expect(sdk.reads.find(r => r.path === 'resellers/reseller-B')?.db).toBe(adminDb);
  });
  it('catalog unknown availability is an error and can recover on a new visit', async () => {
    await sessions(); reply = () => new Response('{}', { status: 503 });
    const view = mount(<Catalogo />);
    expect(await screen.findByText('Error al cargar el catálogo')).toBeInTheDocument();
    expect(screen.queryByText('Stock: 0')).not.toBeInTheDocument(); view.unmount();
    reply = () => ({ available: 2 }); mount(<Catalogo />);
    fireEvent.change(await screen.findByPlaceholderText('Buscar servicio por nombre, categoría...'), { target: { value: 'Synthetic subscription' } });
    expect(await screen.findByText('Stock: 2')).toBeInTheDocument();
  });
  it('Product disables purchase when the real HTTP stock request fails', async () => {
    await sessions(); reply = () => new Response('{}', { status: 503 }); product();
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo verificar la disponibilidad');
    expect(screen.getByRole('button', { name: /comprar con saldo/i })).toBeDisabled();
    expect(screen.queryByText('Disponible por encargo')).not.toBeInTheDocument();
  });
  it('Product purchase callback sets the server balance once and renders real credentials', async () => {
    await sessions();
    reply = name => name === 'getStockAvailability' ? { available: 2 } : { success: true, newBalance: 8000, purchaseId: 'purchased', account: { serviceName: subscription.name, credential: { email: 'assigned@example.invalid', password: 'synthetic' } } };
    product();
    fireEvent.click(await screen.findByRole('button', { name: /comprar con saldo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirmar compra/i }));
    expect(await screen.findByText('assigned@example.invalid')).toBeInTheDocument();
    expect(useAuthStore.getState().customer?.balance).toBe(8000);
    expect(requests.find(r => r.name === 'processPurchase')?.headers.Authorization).toBe('Bearer token-client-A');
    expect(sdk.writes).toHaveLength(0);
  });
  it('refreshing PurchaseResult recovers only the purchased credential through real HTTP', async () => {
    await sessions(); sdk.documents.set('purchases/purchased', { accountId: 'assigned', serviceId: 'svc', serviceName: subscription.name });
    purchase();
    expect(await screen.findByText('assigned@example.invalid')).toBeInTheDocument();
    expect(requests).toEqual([expect.objectContaining({ name: 'getPurchaseCredentials', data: { purchaseId: 'purchased' }, headers: expect.objectContaining({ Authorization: 'Bearer token-client-A' }) })]);
    expect(sdk.reads.some(r => r.path.includes('/accounts'))).toBe(false);
  });
  it('failed credential recovery shows the real error state and recovers on revisit', async () => {
    await sessions(); sdk.documents.set('purchases/purchased', { accountId: 'assigned', serviceId: 'svc' });
    reply = () => new Response('{}', { status: 403 }); const view = purchase();
    expect(await screen.findByText('No se encontraron datos de la compra.')).toBeInTheDocument();
    expect(screen.queryByText('assigned@example.invalid')).not.toBeInTheDocument(); view.unmount();
    reply = () => ({ credential: { email: 'assigned@example.invalid', password: 'synthetic' } }); purchase();
    expect(await screen.findByText('assigned@example.invalid')).toBeInTheDocument();
  });
});
