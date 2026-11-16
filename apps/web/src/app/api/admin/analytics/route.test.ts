/**
 * `GET /api/admin/analytics` — the dashboard's single aggregate read.
 *
 * The route derives every dashboard number from the whole `requests`
 * collection, so the tests pin the buckets (paid statuses, operations,
 * overdue, revenue) rather than the presentation. A wrong bucket here is
 * invisible in the UI until someone reconciles the numbers by hand.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: () => ({ get: mocks.get }) },
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: (error: unknown) => {
    const message = error instanceof Error ? error.message : '';

    if (message === 'AUTHENTICATION_REQUIRED') {
      return { status: 401, error: 'Authentication required.' };
    }
    if (message === 'ADMIN_ACCESS_REQUIRED') {
      return { status: 403, error: 'Administrator access required.' };
    }
    return { status: 500, error: 'Unable to verify administrator access.' };
  },
}));

import { GET } from './route';

const request = () => new NextRequest('https://shipin.test/api/admin/analytics');

const at = (date: Date) => ({ toDate: () => date });
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1', mfaVerified: true });
  mocks.get.mockReset().mockResolvedValue({ docs: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/admin/analytics', () => {
  it('aggregates every dashboard bucket', async () => {
    mocks.get.mockResolvedValue({
      docs: [
        doc('r1', {
          status: 'paid',
          userId: 'u1',
          customerName: 'Ada',
          email: 'ada@example.com',
          quote: {
            breakdown: {
              grandTotal: 100,
              serviceFee: 10,
              productsTotal: 70,
              domesticShipping: 5,
              internationalShipping: 15,
            },
          },
          createdAt: at(new Date('2026-03-15T10:00:00.000Z')),
          updatedAt: at(daysAgo(1)),
        }),
        doc('r2', {
          status: 'shipped',
          userId: 'u1',
          payment: { amount: 50 },
          createdAt: at(new Date('2026-03-20T10:00:00.000Z')),
          updatedAt: at(new Date()),
        }),
        doc('r3', { status: 'submitted', userId: 'u2', customerName: 'Grace' }),
        doc('r4', { status: 'delivered', userId: 'u2', updatedAt: at(daysAgo(90)) }),
        doc('r5', { status: 'warehouse_received', userId: 'u3', updatedAt: at(daysAgo(20)) }),
        doc('r6', { status: 'review', userId: 'u3', quoteRegenerationRequested: true }),
        doc('r7', { status: 'rejected', userId: 'u4', quoteRegenerationRequested: true }),
        doc('r8', { status: 'refunded', userId: 'u4', quoteRegenerationRequested: true }),
        doc('r9', { status: 'awaiting_payment', refundRequest: { status: 'requested' } }),
        doc('r10', { status: 'packed' }),
        doc('r11', { status: 'ready_for_international_shipping' }),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    expect(body.stats).toMatchObject({
      totalRequests: 11,
      total: 11,
      submitted: 1,
      review: 1,
      quoteReady: 1,
      // r7 (rejected) and r8 (refunded) are excluded on purpose.
      quoteUpdates: 1,
      refundRequested: 1,
      awaitingPayment: 1,
      warehouse: 2,
      shipped: 1,
      delivered: 1,
      revenue: 150,
    });

    // Paid statuses: paid (r1), shipped (r2), warehouse_received (r5),
    // packed (r10), delivered (r4). Only r1 carries a quote breakdown.
    expect(body.financials).toEqual({
      grossRevenue: 100,
      serviceFees: 10,
      productCost: 70,
      shippingCost: 20,
      paidOrders: 5,
      averageOrderValue: 20,
    });

    expect(body.operations).toEqual({
      awaitingQuote: 1,
      awaitingPayment: 1,
      warehouse: 2,
      readyToShip: 1,
      shippedToday: 1,
      // r4 is delivered (never overdue); r5 is 20 days old; r3/r10/r11 carry no
      // updatedAt, which counts as "not overdue" rather than "infinitely old".
      overdue: 1,
    });

    expect(body.statusDistribution).toEqual([
      { name: 'Submitted', value: 1 },
      { name: 'Review', value: 1 },
      { name: 'Awaiting Payment', value: 1 },
      { name: 'Warehouse', value: 2 },
      { name: 'Shipped', value: 1 },
      { name: 'Delivered', value: 1 },
    ]);

    expect(body.monthlyRevenue).toEqual([{ month: 'Mar', revenue: 150 }]);

    // u1 booked the two paid orders; ties keep insertion order.
    expect(body.topCustomers[0]).toMatchObject({ id: 'u1', revenue: 150, requests: 2 });
    // Capped at the ten most recently updated requests.
    expect(body.recentActivity).toHaveLength(10);
    expect(body.recentActivity[0].title).toBe('Request #r2');
    expect(body.recentActivity[0].description).toBe('Status changed to shipped');
  });

  it('caps recent activity and top customers at ten', async () => {
    mocks.get.mockResolvedValue({
      docs: Array.from({ length: 12 }, (_, index) =>
        doc(`r${index}`, {
          status: 'paid',
          userId: `u${index}`,
          payment: { amount: index },
          updatedAt: at(daysAgo(index)),
        })
      ),
    });

    const body = await (await GET(request())).json();

    expect(body.recentActivity).toHaveLength(10);
    expect(body.topCustomers).toHaveLength(10);
    expect(body.topCustomers[0].revenue).toBe(11);
  });

  it('reports a zero average when nothing has been paid', async () => {
    mocks.get.mockResolvedValue({
      docs: [doc('r1', { status: 'submitted' }), doc('r2', { status: 'review' })],
    });

    const body = await (await GET(request())).json();

    expect(body.financials.paidOrders).toBe(0);
    expect(body.financials.averageOrderValue).toBe(0);
    expect(body.monthlyRevenue).toEqual([]);
  });

  it('rejects an unauthenticated caller', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('AUTHENTICATION_REQUIRED'));

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('rejects a caller without the admin role', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('ADMIN_ACCESS_REQUIRED'));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns 500 when the collection read fails', async () => {
    mocks.get.mockRejectedValue(new Error('firestore down'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to load analytics.',
    });
  });
});
