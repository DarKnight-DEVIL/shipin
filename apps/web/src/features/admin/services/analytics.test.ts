import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  getDocs: mocks.getDocs,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  getDashboardStats,
  getFinancialOverview,
  getMonthlyRevenue,
  getOperationsOverview,
  getRecentActivity,
  getStatusDistribution,
  getTopCustomers,
} from './analytics';

const day = 86_400_000;

const req = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  status: 'submitted',
  ...overrides,
});

const stamp = (ms: number) => ({
  toMillis: () => ms,
  toDate: () => new Date(ms),
});

function seed(...requests: Record<string, unknown>[]) {
  mocks.getDocs.mockResolvedValue({
    docs: requests.map((data) => ({ id: data.id, data: () => data })),
  });
}

beforeEach(() => {
  mocks.getDocs.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getDashboardStats', () => {
  it('counts each operational bucket and totals revenue', async () => {
    seed(
      req({ id: 'a', status: 'submitted' }),
      req({ id: 'b', status: 'review' }),
      req({ id: 'c', status: 'review', quoteRegenerationRequested: true }),
      req({ id: 'd', status: 'awaiting_payment', payment: { amount: 120 } }),
      req({ id: 'e', status: 'warehouse_received', quote: { breakdown: { grandTotal: 80 } } }),
      req({ id: 'f', status: 'packed' }),
      req({ id: 'g', status: 'shipped' }),
      req({ id: 'h', status: 'delivered', refundRequest: { status: 'requested' } }),
      req({ id: 'i', status: 'rejected', quoteRegenerationRequested: true })
    );

    await expect(getDashboardStats()).resolves.toEqual({
      totalRequests: 9,
      total: 9,
      submitted: 1,
      review: 2,
      quoteReady: 2,
      quoteUpdates: 1,
      refundRequested: 1,
      awaitingPayment: 1,
      warehouse: 2,
      shipped: 1,
      delivered: 1,
      revenue: 200,
    });
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getDashboardStats()).rejects.toBeInstanceOf(Error);
  });
});

describe('getMonthlyRevenue', () => {
  it('groups revenue by month name and skips untimed requests', async () => {
    const january = Date.UTC(2026, 0, 15);
    const february = Date.UTC(2026, 1, 10);
    const monthOf = (ms: number) =>
      new Date(ms).toLocaleString('default', { month: 'short' });

    seed(
      req({ id: 'a', createdAt: stamp(january), payment: { amount: 100 } }),
      req({ id: 'b', createdAt: stamp(january), payment: { amount: 50 } }),
      req({ id: 'c', createdAt: stamp(february), quote: { breakdown: { grandTotal: 25 } } }),
      req({ id: 'd' })
    );

    const points = await getMonthlyRevenue();

    expect(points).toEqual([
      { month: monthOf(january), revenue: 150 },
      { month: monthOf(february), revenue: 25 },
    ]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getMonthlyRevenue()).rejects.toBeInstanceOf(Error);
  });
});

describe('getStatusDistribution', () => {
  it('returns the fixed chart rows', async () => {
    seed(
      req({ id: 'a', status: 'submitted' }),
      req({ id: 'b', status: 'packed' }),
      req({ id: 'c', status: 'warehouse_received' }),
      req({ id: 'd', status: 'delivered' }),
      req({ id: 'e', status: 'delivered' })
    );

    await expect(getStatusDistribution()).resolves.toEqual([
      { name: 'Submitted', value: 1 },
      { name: 'Review', value: 0 },
      { name: 'Awaiting Payment', value: 0 },
      { name: 'Warehouse', value: 2 },
      { name: 'Shipped', value: 0 },
      { name: 'Delivered', value: 2 },
    ]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getStatusDistribution()).rejects.toBeInstanceOf(Error);
  });
});

describe('getRecentActivity', () => {
  it('lists the ten most recently updated requests', async () => {
    seed(
      ...Array.from({ length: 12 }, (_, index) =>
        req({ id: `req-${index}`, status: 'paid', updatedAt: stamp(index * day) })
      )
    );

    const activity = await getRecentActivity();

    expect(activity).toHaveLength(10);
    expect(activity[0].id).toBe('req-11');
    expect(activity[0].title).toBe('Request #req-11');
    expect(activity[0].description).toBe('Status changed to paid');
    expect(activity[0].createdAt).toEqual(new Date(11 * day));
  });

  it('leaves the timestamp undefined when the request was never updated', async () => {
    seed(req({ id: 'fresh' }));

    const [entry] = await getRecentActivity();

    expect(entry.createdAt).toBeUndefined();
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getRecentActivity()).rejects.toBeInstanceOf(Error);
  });
});

describe('getTopCustomers', () => {
  it('aggregates spend per customer and sorts by revenue', async () => {
    seed(
      req({ id: 'a', userId: 'u1', customerName: 'Ada', email: 'ada@x.com', payment: { amount: 50 } }),
      req({ id: 'b', userId: 'u1', customerName: 'Ada', email: 'ada@x.com', payment: { amount: 25 } }),
      req({ id: 'c', userId: 'u2', customerName: 'Grace', email: 'grace@x.com', payment: { amount: 200 } })
    );

    await expect(getTopCustomers()).resolves.toEqual([
      { id: 'u2', name: 'Grace', email: 'grace@x.com', requests: 1, revenue: 200 },
      { id: 'u1', name: 'Ada', email: 'ada@x.com', requests: 2, revenue: 75 },
    ]);
  });

  it('falls back for anonymous requests', async () => {
    seed(req({ id: 'a' }));

    await expect(getTopCustomers()).resolves.toEqual([
      { id: 'unknown', name: 'Unknown', email: '-', requests: 1, revenue: 0 },
    ]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getTopCustomers()).rejects.toBeInstanceOf(Error);
  });
});

describe('getOperationsOverview', () => {
  it('counts today’s shipments and overdue work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const now = Date.now();

    seed(
      req({ id: 'a', status: 'review' }),
      req({ id: 'b', status: 'awaiting_payment' }),
      req({ id: 'c', status: 'packed' }),
      req({ id: 'd', status: 'ready_for_international_shipping' }),
      req({ id: 'e', status: 'shipped', updatedAt: stamp(now) }),
      req({ id: 'f', status: 'shipped', updatedAt: stamp(now - 20 * day) }),
      req({ id: 'g', status: 'submitted', updatedAt: stamp(now - 20 * day) }),
      req({ id: 'h', status: 'delivered', updatedAt: stamp(now - 40 * day) }),
      req({ id: 'i', status: 'submitted' })
    );

    await expect(getOperationsOverview()).resolves.toEqual({
      awaitingQuote: 1,
      awaitingPayment: 1,
      warehouse: 1,
      readyToShip: 1,
      shippedToday: 1,
      overdue: 2,
    });

    vi.useRealTimers();
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getOperationsOverview()).rejects.toBeInstanceOf(Error);
  });
});

describe('getFinancialOverview', () => {
  it('sums the paid orders only', async () => {
    const breakdown = {
      grandTotal: 120,
      serviceFee: 10,
      productsTotal: 80,
      domesticShipping: 5,
      internationalShipping: 25,
    };

    seed(
      req({ id: 'a', status: 'delivered', quote: { breakdown } }),
      req({ id: 'b', status: 'paid', quote: { breakdown: { ...breakdown, grandTotal: 80 } } }),
      req({ id: 'c', status: 'submitted', quote: { breakdown } }),
      req({ id: 'd', status: 'paid' })
    );

    await expect(getFinancialOverview()).resolves.toEqual({
      grossRevenue: 200,
      serviceFees: 20,
      productCost: 160,
      shippingCost: 60,
      paidOrders: 3,
      averageOrderValue: 200 / 3,
    });
  });

  it('avoids dividing by zero', async () => {
    seed(req({ id: 'a', status: 'review' }));

    await expect(getFinancialOverview()).resolves.toMatchObject({
      paidOrders: 0,
      averageOrderValue: 0,
    });
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getFinancialOverview()).rejects.toBeInstanceOf(Error);
  });
});
