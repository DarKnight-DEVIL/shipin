// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  searchRef: { value: null as string | null },
  replace: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  customerApi: vi.fn(),
  getCustomersWithWallets: vi.fn(),
  getRefundRequestDetails: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => ({ get: () => mocks.searchRef.value }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/customerApiClient', () => ({ customerApi: mocks.customerApi }));
vi.mock('@/features/admin/services/customers', () => ({
  getCustomersWithWallets: mocks.getCustomersWithWallets,
  getRefundRequestDetails: mocks.getRefundRequestDetails,
}));

import { useAdminWallet } from './useAdminWallet';
import type { AdminCustomer } from '@/features/admin/services/customers';

const customers = [
  { id: 'c1', displayName: 'Ada Lovelace', email: 'ada@example.com' },
] as unknown as AdminCustomer[];

beforeEach(() => {
  mocks.searchRef.value = null;
  mocks.replace.mockReset();
  Object.values(mocks.toast).forEach((fn) => fn.mockReset());
  mocks.customerApi.mockReset().mockResolvedValue({ success: true });
  mocks.getCustomersWithWallets.mockReset().mockResolvedValue(customers);
  mocks.getRefundRequestDetails.mockReset().mockResolvedValue({
    userId: 'c1',
    walletRefundAmount: 25.5,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useAdminWallet());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useAdminWallet — loading', () => {
  it('loads the customer list', async () => {
    const { result } = await mount();

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.errorMessage).toBe('');
  });

  it('reports a load failure', async () => {
    mocks.getCustomersWithWallets.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.errorMessage).toBe('Unable to load customers.');
    expect(result.current.loading).toBe(false);
  });
});

describe('useAdminWallet — validation', () => {
  it('requires a selected customer', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Select a customer first.');
    expect(mocks.customerApi).not.toHaveBeenCalled();
  });

  it.each(['', '0', '-5', 'abc'])('rejects the amount %j', async (amount) => {
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount(amount);
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Enter a valid amount.');
    expect(mocks.customerApi).not.toHaveBeenCalled();
  });
});

describe('useAdminWallet — crediting', () => {
  it('posts the credit and refreshes the balances', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount('12.5');
      result.current.setDescription('Goodwill');
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(mocks.customerApi).toHaveBeenCalledWith('/api/admin/wallet/credit', {
      method: 'POST',
      body: { userId: 'c1', amount: 12.5, description: 'Goodwill' },
    });
    expect(result.current.successMessage).toBe('$12.50 credited to Ada Lovelace.');
    expect(result.current.amount).toBe('');
    expect(result.current.description).toBe('');
    expect(mocks.getCustomersWithWallets).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('uses the default description when none is given', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount('5');
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(mocks.customerApi).toHaveBeenCalledWith(
      '/api/admin/wallet/credit',
      expect.objectContaining({ body: expect.objectContaining({ description: 'Admin credit' }) })
    );
  });

  it('reports an unsuccessful response', async () => {
    mocks.customerApi.mockResolvedValue({ success: false });
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount('5');
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(result.current.errorMessage).toBe('Operation failed. Please try again.');
  });

  it('reports a request failure', async () => {
    mocks.customerApi.mockRejectedValue(new Error('network'));
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount('5');
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(result.current.errorMessage).toBe('Could not complete the transaction.');
    expect(result.current.adding).toBe(false);
  });

  it('clears messages on demand', async () => {
    mocks.customerApi.mockRejectedValue(new Error('network'));
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomer(customers[0]);
      result.current.setAmount('5');
    });
    await act(async () => {
      await result.current.handleAddCredits();
    });
    await act(async () => {
      result.current.clearMessages();
    });

    expect(result.current.errorMessage).toBe('');
    expect(result.current.successMessage).toBe('');
  });
});

describe('useAdminWallet — refund mode', () => {
  it('loads the refund request from the query string', async () => {
    mocks.searchRef.value = 'req-9';
    const { result } = renderHook(() => useAdminWallet());

    await waitFor(() => expect(result.current.refundLoading).toBe(false));

    expect(mocks.getRefundRequestDetails).toHaveBeenCalledWith('req-9');
    expect(result.current.refundMode).toBe(true);
    expect(result.current.refundRequestId).toBe('req-9');
    await waitFor(() => expect(result.current.selectedCustomer?.id).toBe('c1'));
    expect(result.current.amount).toBe('25.5');
  });

  it('returns to the wallet page after a refund credit', async () => {
    mocks.searchRef.value = 'req-9';
    const { result } = renderHook(() => useAdminWallet());

    await waitFor(() => expect(result.current.amount).toBe('25.5'));
    await act(async () => {
      await result.current.handleAddCredits();
    });

    expect(result.current.successMessage).toBe('Refund of $25.50 authorized.');
    expect(mocks.replace).toHaveBeenCalledWith('/admin/wallet');
  });

  it('reports a refund load failure', async () => {
    mocks.searchRef.value = 'req-9';
    mocks.getRefundRequestDetails.mockRejectedValue(new Error('missing'));
    const { result } = renderHook(() => useAdminWallet());

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Failed to load refund request details.')
    );
    expect(result.current.refundLoading).toBe(false);
  });
});
