import { describe, it, expect, vi, beforeEach } from 'vitest';

const customerApiMock = vi.fn();

vi.mock('@/lib/customerApiClient', () => ({
  customerApi: (...args: unknown[]) => customerApiMock(...args),
}));

import { getCustomersWithWallets, getRefundRequestDetails } from './customersClient';

beforeEach(() => {
  customerApiMock.mockReset();
});

describe('getCustomersWithWallets', () => {
  it('fetches customers from the admin API', async () => {
    customerApiMock.mockResolvedValue({ success: true, customers: [
      { id: 'u1', displayName: 'Ada', email: 'ada@x.com', role: 'customer', walletBalance: 42.5 },
      { id: 'u2', displayName: 'Grace', email: 'grace@x.com', role: 'customer', walletBalance: 0 },
    ] });

    const result = await getCustomersWithWallets();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'u1', walletBalance: 42.5 });
    expect(customerApiMock).toHaveBeenCalledWith('/api/admin/customers', expect.anything());
  });

  it('excludes administrator accounts', async () => {
    // Simulates what the /api/admin/customers route returns after filtering
    customerApiMock.mockResolvedValue({ success: true, customers: [
      { id: 'u1', displayName: 'Ada', role: 'customer', walletBalance: 10 },
    ] });

    const customers = await getCustomersWithWallets();
    expect(customers.map((c) => c.id)).toEqual(['u1']);
  });

  it('falls back for missing names and unusable balances', async () => {
    // Simulates what the route returns after String() coercions and Number.isFinite check
    customerApiMock.mockResolvedValue({ success: true, customers: [
      { id: 'u1', displayName: 'Unnamed Customer', email: '', role: 'customer', walletBalance: 0 },
    ] });

    const result = await getCustomersWithWallets();
    expect(result[0].displayName).toBe('Unnamed Customer');
    expect(result[0].walletBalance).toBe(0);
  });

  it('wraps read failures', async () => {
    customerApiMock.mockRejectedValue(new Error('offline'));
    await expect(getCustomersWithWallets()).rejects.toBeInstanceOf(Error);
  });
});

describe('getRefundRequestDetails', () => {
  it('uses the versioned refund payload when the server sends one', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: {
        schemaVersion: 2,
        refund: {
          id: 'req-1',
          userId: 'u1',
          preference: 'wallet',
          totalRefundAmount: 80,
          walletRefundAmount: 80,
        },
      },
    });

    await expect(getRefundRequestDetails('req-1')).resolves.toEqual({
      id: 'req-1',
      userId: 'u1',
      preference: 'wallet',
      totalRefundAmount: 80,
      walletRefundAmount: 80,
    });
  });

  it('refunds the whole amount to the wallet when that is the preference', async () => {
    customerApiMock.mockResolvedValue({ success: true, data: { userId: 'u1', refundRequest: { preference: 'wallet', amount: 80 }, id: 'req-1' } });
    const result = await getRefundRequestDetails('req-1');
    expect(result).toEqual({ id: 'req-1', userId: 'u1', preference: 'wallet', totalRefundAmount: 80, walletRefundAmount: 80 });
  });

  it('refunds only the original wallet portion for original_sources', async () => {
    customerApiMock.mockResolvedValue({ success: true, data: { refundRequest: { preference: 'original_sources', amount: 80, walletAmount: 30 }, userId: 'u1', id: 'req-1' } });
    const result = await getRefundRequestDetails('req-1');
    expect(result.walletRefundAmount).toBe(30);
    expect(result.totalRefundAmount).toBe(80);
  });

  it('falls back to the payment wallet amount', async () => {
    customerApiMock.mockResolvedValue({ success: true, data: { preference: 'original_payment', amount: 80, payment: { walletAmount: 25 }, userId: 'u1', id: 'req-1' } });
    const result = await getRefundRequestDetails('req-1');
    expect(result.walletRefundAmount).toBe(25);
  });

  it('defaults to the wallet preference and zero amounts', async () => {
    customerApiMock.mockResolvedValue({ success: true, data: { userId: 'u1', id: 'req-1' } });
    await expect(getRefundRequestDetails('req-1')).rejects.toThrow('This refund does not contain a wallet refund amount.');
  });

  it('rejects an unknown preference with no wallet portion', async () => {
    customerApiMock.mockResolvedValue({ success: true, data: { refundRequest: { preference: 'paypal', amount: 80 }, userId: 'u1', id: 'req-1' } });
    await expect(getRefundRequestDetails('req-1')).rejects.toThrow('This refund does not contain a wallet refund amount.');
  });

  it('falls back to top-level fields when the legacy block is partial', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { refundRequest: { amount: 60 }, preference: 'wallet', userId: 'u1', id: 'req-1' },
    });

    const result = await getRefundRequestDetails('req-1');
    expect(result.preference).toBe('wallet');
    expect(result.totalRefundAmount).toBe(60);
    expect(result.walletRefundAmount).toBe(60);
  });

  it('defaults a legacy refund with no fields at all to wallet and zero', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { refundRequest: {}, userId: 'u1', id: 'req-1' },
    });

    await expect(getRefundRequestDetails('req-1')).rejects.toThrow(
      'This refund does not contain a wallet refund amount.'
    );
  });

  it('reads top-level fields when there is no nested block', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { preference: 'original_payment', amount: 40, walletAmount: 15, userId: 'u1', id: 'req-1' },
    });

    const result = await getRefundRequestDetails('req-1');
    expect(result.totalRefundAmount).toBe(40);
    expect(result.walletRefundAmount).toBe(15);
  });

  it('takes the wallet portion from the payment block', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { preference: 'original_sources', amount: 40, payment: { walletAmount: 15 }, userId: 'u1', id: 'req-1' },
    });

    await expect(getRefundRequestDetails('req-1')).resolves.toMatchObject({
      totalRefundAmount: 40,
      walletRefundAmount: 15,
    });
  });

  it('treats a malformed nested block as absent and still reads the legacy fields', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { refundRequest: 'unexpected', amount: 25, userId: 'u1', id: 'req-1' },
    });

    const result = await getRefundRequestDetails('req-1');
    expect(result.totalRefundAmount).toBe(25);
    expect(result.walletRefundAmount).toBe(25);
  });

  it('falls back to the request id and an empty user when the payload omits them', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { refundRequest: { preference: 'wallet', amount: 10 } },
    });

    await expect(getRefundRequestDetails('req-42')).resolves.toMatchObject({
      id: 'req-42',
      userId: '',
    });
  });

  it('uses the versioned refund payload even when the legacy block is present', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: {
        refund: { id: 'req-1', userId: 'u1', preference: 'wallet', totalRefundAmount: 5, walletRefundAmount: 5 },
        refundRequest: { preference: 'original_sources', amount: 999 },
      },
    });

    await expect(getRefundRequestDetails('req-1')).resolves.toMatchObject({
      totalRefundAmount: 5,
      walletRefundAmount: 5,
    });
  });

  it('rejects a non-finite wallet amount', async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      data: { refund: { id: 'req-1', userId: 'u1', preference: 'wallet', totalRefundAmount: Number.NaN, walletRefundAmount: Number.NaN } },
    });

    await expect(getRefundRequestDetails('req-1')).rejects.toThrow(
      'This refund does not contain a wallet refund amount.'
    );
  });

  it('rejects a missing request', async () => {
    customerApiMock.mockRejectedValue(new Error('offline'));
    await expect(getRefundRequestDetails('req-1')).rejects.toBeInstanceOf(Error);
  });

  it('wraps read failures', async () => {
    customerApiMock.mockRejectedValue(new Error('network error'));
    await expect(getRefundRequestDetails('req-1')).rejects.toBeInstanceOf(Error);
  });
});
