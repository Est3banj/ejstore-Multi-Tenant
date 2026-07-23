import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collection, doc, getDocs, addDoc, deleteDoc, query, serverTimestamp } from 'firebase/firestore';
import {
  getAccounts,
  createAccount,
  createAccountsBatch,
  deleteAccount,
  getServiceStock,
} from './marketplace';

vi.mock('./firebase', () => ({
  db: {},
  functions: {},
}));

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
    expect(addDoc).toHaveBeenCalledWith('col-ref', {
      ...input,
      serviceId: 'svc-1',
      status: 'available',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
