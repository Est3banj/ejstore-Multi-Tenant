import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockNotifyPrizeWon, mockExecuteServerSpin } = vi.hoisted(() => ({
  mockNotifyPrizeWon: vi.fn(),
  mockExecuteServerSpin: vi.fn(),
}));

vi.mock('../../hooks/useRoulette', () => ({
  executeServerSpin: mockExecuteServerSpin,
  notifyPrizeWon: mockNotifyPrizeWon,
  fetchRouletteConfig: vi.fn(),
  fetchSpinData: vi.fn(),
}));

import { notifyPrizeWon } from '../../hooks/useRoulette';

describe('Roulette notifyPrizeWon await', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call notifyPrizeWon with transactionId', async () => {
    mockNotifyPrizeWon.mockResolvedValue(true);

    const result = await notifyPrizeWon('txn-123');

    expect(result).toBe(true);
    expect(mockNotifyPrizeWon).toHaveBeenCalledWith('txn-123');
  });

  it('should handle notifyPrizeWon rejection gracefully', async () => {
    mockNotifyPrizeWon.mockRejectedValue(new Error('Network error'));

    await expect(notifyPrizeWon('txn-456')).rejects.toThrow('Network error');
  });
});
