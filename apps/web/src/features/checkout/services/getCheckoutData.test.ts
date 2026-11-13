import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { uid: string },
  getRequestById: vi.fn(),
  getWallet: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  get auth() {
    return { currentUser: mocks.currentUser };
  },
  db: {},
}));

vi.mock('@/features/requests/services/requests', () => ({
  getRequestById: mocks.getRequestById,
}));

vi.mock('@/features/wallet/services/wallet', () => ({
  getWallet: mocks.getWallet,
}));

import { getCheckoutData } from './getCheckoutData';

beforeEach(() => {
  mocks.currentUser = { uid: 'user-1' };
  mocks.getRequestById.mockReset();
  mocks.getWallet.mockReset();
  mocks.getRequestById.mockResolvedValue({ id: 'req-1' });
  mocks.getWallet.mockResolvedValue({ balance: 75, currency: 'USD' });
});

describe('getCheckoutData', () => {
  it('returns null for a missing request', async () => {
    mocks.getRequestById.mockResolvedValue(null);

    await expect(getCheckoutData('missing')).resolves.toBeNull();
    expect(mocks.getWallet).not.toHaveBeenCalled();
  });

  it('loads the request with the signed-in wallet balance', async () => {
    await expect(getCheckoutData('req-1')).resolves.toEqual({
      request: { id: 'req-1' },
      walletBalance: 75,
    });
    expect(mocks.getWallet).toHaveBeenCalledWith('user-1');
  });

  it('reports a zero balance when signed out', async () => {
    mocks.currentUser = null;

    await expect(getCheckoutData('req-1')).resolves.toEqual({
      request: { id: 'req-1' },
      walletBalance: 0,
    });
    expect(mocks.getWallet).not.toHaveBeenCalled();
  });
});
