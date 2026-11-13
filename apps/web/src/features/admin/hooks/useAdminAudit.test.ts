// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getCustomersWithWallets: vi.fn(),
  getAllRequests: vi.fn(),
}));

vi.mock('@/features/admin/services/customers', () => ({
  getCustomersWithWallets: mocks.getCustomersWithWallets,
}));
vi.mock('@/features/admin/services/requestQueue', () => ({
  getAllRequests: mocks.getAllRequests,
}));

import { useAdminAudit } from './useAdminAudit';
import type { AdminCustomer } from '@/features/admin/services/customers';
import type { Request } from '@/types/request';

const customers = [
  { id: 'c1', displayName: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'c2', displayName: 'Grace Hopper', email: 'grace@example.com' },
] as unknown as AdminCustomer[];

const request = (overrides: Record<string, unknown>) =>
  ({ userId: 'c1', ...overrides }) as unknown as Request;

const requests = [
  request({ id: 'r1', createdAt: { toMillis: () => 100 } }),
  request({ id: 'r2', createdAt: { toMillis: () => 50 }, updatedAt: { toMillis: () => 300 } }),
  request({ id: 'r3', userId: 'c2', createdAt: { toMillis: () => 900 } }),
];

beforeEach(() => {
  mocks.getCustomersWithWallets.mockReset().mockResolvedValue(customers);
  mocks.getAllRequests.mockReset().mockResolvedValue(requests);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useAdminAudit());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useAdminAudit — loading', () => {
  it('loads customers and requests, selecting the first customer', async () => {
    const { result } = await mount();

    expect(result.current.customers).toHaveLength(2);
    expect(result.current.requests).toHaveLength(3);
    expect(result.current.selectedCustomerId).toBe('c1');
    expect(result.current.selectedCustomer?.displayName).toBe('Ada Lovelace');
  });

  it('leaves no selection when there are no customers', async () => {
    mocks.getCustomersWithWallets.mockResolvedValue([]);
    const { result } = await mount();

    expect(result.current.selectedCustomerId).toBeNull();
    expect(result.current.selectedCustomer).toBeNull();
    expect(result.current.customerRequests).toEqual([]);
  });

  it('stops loading when the fetch fails', async () => {
    mocks.getAllRequests.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(result.current.customers).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('refreshes on demand', async () => {
    const { result } = await mount();
    mocks.getCustomersWithWallets.mockResolvedValue([customers[0]]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });
});

describe('useAdminAudit — search', () => {
  it('returns everyone for an empty query', async () => {
    const { result } = await mount();

    expect(result.current.filteredCustomers).toHaveLength(2);
  });

  it('matches by name, email and id, ignoring case and whitespace', async () => {
    const { result } = await mount();

    const cases: [string, string[]][] = [
      ['  grace ', ['c2']],
      ['ADA@EXAMPLE', ['c1']],
      ['c2', ['c2']],
    ];

    for (const [query, expected] of cases) {
      await act(async () => {
        result.current.setSearch(query);
      });
      expect(result.current.filteredCustomers.map((customer) => customer.id)).toEqual(expected);
    }
  });

  it('can filter everything out', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setSearch('zzz');
    });

    expect(result.current.filteredCustomers).toEqual([]);
  });
});

describe('useAdminAudit — customer requests', () => {
  it('shows only the selected customer, newest update first', async () => {
    const { result } = await mount();

    expect(result.current.customerRequests.map((item) => item.id)).toEqual(['r2', 'r1']);
  });

  it('reacts to a selection change', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.setSelectedCustomerId('c2');
    });

    expect(result.current.customerRequests.map((item) => item.id)).toEqual(['r3']);
  });

  it('sorts by creation time when updates are missing', async () => {
    mocks.getAllRequests.mockResolvedValue([
      request({ id: 'old', createdAt: { toMillis: () => 1 } }),
      request({ id: 'new', createdAt: { toMillis: () => 2 } }),
      request({ id: 'none' }),
    ]);
    const { result } = await mount();

    expect(result.current.customerRequests.map((item) => item.id)).toEqual(['new', 'old', 'none']);
  });
});
