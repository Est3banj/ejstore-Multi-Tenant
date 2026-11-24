import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collection, doc, getDocs, addDoc, deleteDoc, query } from 'firebase/firestore';
import { customCallable } from './apiClient';
import {
  getAccounts,
  createAccount,
  createAccountsBatch,
  deleteAccount,
  getServiceStock,
  getAvailableServiceStock,
  getPurchases,
} from './marketplace';

vi.mock('./firebase', () => ({
  db: {},
  functions: {},
}));
vi.mock('./apiClient', () => ({ customCallable: vi.fn() }));

const mockAccountData = {
  label: 'Account 1',
  status: 'available',
  serviceId: 'svc-1',
  credential: { email: 'test@test.com', password: 'pass123' },
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockDocs = [
  { id: 'acc-1', data: () => ({ ...mockAccountData }) },
  { id: 'acc-2', data: () => ({ ...mockAccountData, label: 'Account 2', status: 'sold' }) },
  { id: 'acc-3', data: () => ({ ...mockAccountData, label: 'Account 3', status: 'expired' }) },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAccounts', () => {
  it('returns accounts when Firestore has data', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: mockDocs } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');
    vi.mocked(query as any).mockReturnValue('query-ref');

    const result = await getAccounts('svc-1');

    expect(collection).toHaveBeenCalledWith({}, 'services', 'svc-1', 'accounts');
    expect(query).toHaveBeenCalledWith('col-ref');
    expect(getDocs).toHaveBeenCalledWith('query-ref');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'acc-1', label: 'Account 1', status: 'available' });
    expect(result[1]).toMatchObject({ id: 'acc-2', label: 'Account 2', status: 'sold' });
  });

  it('returns empty array when no accounts', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');
    vi.mocked(query as any).mockReturnValue('query-ref');

    const result = await getAccounts('svc-1');

    expect(result).toEqual([]);
  });

  it('throws when serviceId is empty', async () => {
    await expect(getAccounts('')).rejects.toThrow('serviceId required');
  });
});

describe('createAccount', () => {
  it('creates document with correct data', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-acc-id' } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');

    const input = {
      label: 'New Account',
      credential: { email: 'new@test.com', password: 'pass456' },
      extras: ['extra1', 'extra2'],
    };

    const result = await createAccount('svc-1', input);

    expect(collection).toHaveBeenCalledWith({}, 'services', 'svc-1', 'accounts');
    expect(addDoc).toHaveBeenCalledWith('col-ref', expect.objectContaining({
      ...input,
      serviceId: 'svc-1',
      status: 'available',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
    expect(result).toBe('new-acc-id');
  });

  it('throws when serviceId is empty', async () => {
    await expect(
      createAccount('', { label: '', credential: { email: '', password: '' } })
    ).rejects.toThrow('serviceId required');
  });
});

describe('createAccountsBatch', () => {
  it('parses lines correctly and creates accounts', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-acc-id' } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');

    const lines = [
      'email1@test.com:pass1:Label1:ext1,ext2',
      'email2@test.com:pass2:Label2',
      'email3@test.com:pass3',
    ];

    const result = await createAccountsBatch('svc-1', lines);

    expect(result.created).toBe(3);
    expect(result.failed).toHaveLength(0);
    expect(addDoc).toHaveBeenCalledTimes(3);
  });

  it('reports failures for malformed lines', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-acc-id' } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');

    const lines = [
      'email1@test.com:pass1:Label1',
      'malformed',
      'email3@test.com:pass3',
      '',
    ];

    const result = await createAccountsBatch('svc-1', lines);

    expect(result.created).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('Formato inválido');
  });

  it('supports pipe delimiter', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-acc-id' } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');

    const lines = ['email1@test.com|pass1|Label1'];

    const result = await createAccountsBatch('svc-1', lines);

    expect(result.created).toBe(1);
    expect(result.failed).toHaveLength(0);
  });

  it('skips empty lines', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-acc-id' } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');

    const lines = ['email1@test.com:pass1', '', '  ', 'email2@test.com:pass2'];

    const result = await createAccountsBatch('svc-1', lines);

    expect(result.created).toBe(2);
  });
});

describe('deleteAccount', () => {
  it('deletes the correct document', async () => {
    vi.mocked(doc as any).mockReturnValue('doc-ref');
    vi.mocked(deleteDoc).mockResolvedValue(undefined);

    await deleteAccount('svc-1', 'acc-1');

    expect(doc).toHaveBeenCalledWith({}, 'services', 'svc-1', 'accounts', 'acc-1');
    expect(deleteDoc).toHaveBeenCalledWith('doc-ref');
  });

  it('throws when serviceId is empty', async () => {
    await expect(deleteAccount('', 'acc-1')).rejects.toThrow('serviceId required');
  });
});

describe('getServiceStock', () => {
  it('returns correct counts for each status', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: mockDocs } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');
    vi.mocked(query as any).mockReturnValue('query-ref');

    const result = await getServiceStock('svc-1');

    expect(result).toEqual({
      total: 3,
      available: 1,
      sold: 1,
      expired: 1,
    });
  });

  it('returns zeros when no accounts', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
    vi.mocked(collection as any).mockReturnValue('col-ref');
    vi.mocked(query as any).mockReturnValue('query-ref');

    const result = await getServiceStock('svc-1');

    expect(result).toEqual({
      total: 0,
      available: 0,
      sold: 0,
      expired: 0,
    });
  });
});

describe('getAvailableServiceStock', () => {
  it('requests only tenant/service aggregate; never reads account documents', async () => {
    vi.mocked(customCallable).mockResolvedValue({ data: { available: 2 } });
    expect(await getAvailableServiceStock('svc-1', 'tenant-a')).toBe(2);
    expect(customCallable).toHaveBeenCalledWith('getStockAvailability', { serviceId: 'svc-1', tenantId: 'tenant-a' });
    expect(collection).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it('propagates endpoint failure rather than returning zero', async () => {
    vi.mocked(customCallable).mockRejectedValue(new Error('unavailable'));
    await expect(getAvailableServiceStock('svc-1', 'tenant-a')).rejects.toThrow('unavailable');
    expect(getDocs).not.toHaveBeenCalled();
  });
  it('accepts real zero and rejects malformed aggregate responses', async () => {
    vi.mocked(customCallable).mockResolvedValue({ data: { available: 0 } });
    expect(await getAvailableServiceStock('svc-1', 'tenant-a')).toBe(0);
    for (const available of [-1, 0.5, '3', undefined]) {
      vi.mocked(customCallable).mockResolvedValue({ data: { available } });
      await expect(getAvailableServiceStock('svc-1', 'tenant-a')).rejects.toThrow('disponibilidad inválida');
    }
  });
  it('requires service and tenant', async () => {
    await expect(getAvailableServiceStock('', 'tenant-a')).rejects.toThrow('serviceId required');
    await expect(getAvailableServiceStock('svc-1', '')).rejects.toThrow('tenantId required');
  });
});

describe('purchase credential recovery', () => {
  it('recovers single purchases with an empty historical profiles array', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: 'single-empty', data: () => ({ serviceId: 'svc-1', accountId: 'parent', profiles: [] }) }] } as never);
    vi.mocked(customCallable).mockResolvedValue({ data: { credential: { email: 'empty@example.invalid', password: 'FICTIONAL' } } });
    const purchases = await getPurchases('owner');
    expect(customCallable).toHaveBeenCalledWith('getPurchaseCredentials', { purchaseId: 'single-empty' });
    expect(purchases[0].credential?.email).toBe('empty@example.invalid');
    expect(collection).toHaveBeenCalledTimes(1);
  });
  it('keeps history metadata when recovery fails or a stale backend returns a malformed envelope', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: 'single', data: () => ({ serviceId: 'svc-1', accountId: 'parent' }) }] } as never);
    for (const response of [{}, { data: {} }, { data: { credential: { email: 3, password: 'FICTIONAL' } } }]) {
      vi.mocked(customCallable).mockResolvedValue(response as never);
      const purchases = await getPurchases('owner');
      expect(purchases).toHaveLength(1);
      expect(purchases[0].credential).toBeUndefined();
    }
    vi.mocked(customCallable).mockRejectedValue(new Error('unavailable'));
    expect((await getPurchases('owner'))[0].credential).toBeUndefined();
  });
  it('hydrates historical single purchases with a private purchase-scoped request', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: 'purchase-1', data: () => ({ customerId: 'owner', serviceId: 'svc-1', accountId: 'parent', profileId: 'profile', profileName: 'Owned profile' }) }] } as never);
    vi.mocked(customCallable).mockResolvedValue({ data: { credential: { email: 'fictional@example.invalid', password: 'FICTIONAL' } } });
    const purchases = await getPurchases('owner');
    expect(customCallable).toHaveBeenCalledWith('getPurchaseCredentials', { purchaseId: 'purchase-1' });
    expect(purchases[0].credential).toEqual({ email: 'fictional@example.invalid', password: 'FICTIONAL' });
    expect(purchases[0].profileName).toBe('Owned profile');
    expect(collection).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledWith({}, 'purchases');
  });
  it('keeps bulk inline credentials without requesting parent access', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: 'bulk', data: () => ({ profiles: [{ credential: { email: 'fictional@example.invalid', password: 'FICTIONAL' } }] }) }] } as never);
    await getPurchases('owner');
    expect(customCallable).not.toHaveBeenCalled();
  });
});
