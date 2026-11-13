import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  getDocs: mocks.getDocs,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  getAdminRequestPriority,
  getAdminRequestQueue,
  getAllRequests,
  matchesAdminRequestFilter,
} from './requestQueue';
import type { Request } from '@/types/request';

const request = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'r-1', status: 'submitted', ...overrides }) as unknown as Request;

beforeEach(() => {
  mocks.getDocs.mockReset();
});

describe('getAllRequests', () => {
  it('maps documents with their ids', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { id: 'r-1', data: () => ({ status: 'submitted' }) },
        { id: 'r-2', data: () => ({ status: 'paid' }) },
      ],
    });

    await expect(getAllRequests()).resolves.toEqual([
      { id: 'r-1', status: 'submitted' },
      { id: 'r-2', status: 'paid' },
    ]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getAllRequests()).rejects.toBeInstanceOf(Error);
  });
});

describe('matchesAdminRequestFilter', () => {
  it('accepts everything without a filter', () => {
    expect(matchesAdminRequestFilter(request(), null)).toBe(true);
    expect(matchesAdminRequestFilter(request(), '')).toBe(true);
  });

  it('selects requested refunds', () => {
    expect(matchesAdminRequestFilter(request({ refundRequest: { status: 'requested' } }), 'refund_requested')).toBe(true);
    expect(matchesAdminRequestFilter(request({ refundRequest: { status: 'completed' } }), 'refund_requested')).toBe(false);
    expect(matchesAdminRequestFilter(request(), 'refund_requested')).toBe(false);
  });

  it('selects quote regeneration requests that are still open', () => {
    expect(
      matchesAdminRequestFilter(request({ quoteRegenerationRequested: true }), 'quote_requested')
    ).toBe(true);
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: true, status: 'rejected' }),
        'quote_requested'
      )
    ).toBe(false);
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: true, status: 'refunded' }),
        'quote_requested'
      )
    ).toBe(false);
    expect(
      matchesAdminRequestFilter(request({ quoteRegenerationRequested: false }), 'quote_requested')
    ).toBe(false);
  });

  it('matches a plain status', () => {
    expect(matchesAdminRequestFilter(request({ status: 'packed' }), 'packed')).toBe(true);
    expect(matchesAdminRequestFilter(request({ status: 'packed' }), 'shipped')).toBe(false);
  });
});

describe('getAdminRequestPriority', () => {
  it.each([
    [{ quoteRegenerationRequested: true }, 1],
    [{ refundRequest: { status: 'requested' } }, 2],
    [{ status: 'submitted' }, 3],
    [{ status: 'review' }, 3],
    [{ status: 'paid' }, 4],
    [{ status: 'warehouse_received' }, 5],
    [{ status: 'purchased' }, 6],
    [{ status: 'packed' }, 7],
    [{ status: 'shipped' }, 7],
    [{ status: 'awaiting_payment' }, 8],
    [{ status: 'out_for_delivery' }, 9],
    [{ status: 'delivered' }, 10],
    /* Any status not handled above reaches the refund-offer branch. */
    [{ refundOffer: { offered: true }, status: 'archived' }, 11],
    [{ status: 'refunded' }, 12],
    [{ status: 'rejected' }, 13],
  ])('ranks %j as %i', (overrides, expected) => {
    expect(getAdminRequestPriority(request(overrides))).toBe(expected);
  });

  it('ignores a rejected regeneration request', () => {
    expect(
      getAdminRequestPriority(request({ quoteRegenerationRequested: true, status: 'rejected' }))
    ).toBe(13);
  });

  it('ignores a refund offer on a refunded request', () => {
    expect(getAdminRequestPriority(request({ refundOffer: { offered: true }, status: 'refunded' }))).toBe(
      12
    );
  });

  it('ignores a refund offer on a rejected request', () => {
    expect(getAdminRequestPriority(request({ refundOffer: { offered: true }, status: 'rejected' }))).toBe(
      13
    );
  });
});

describe('getAdminRequestQueue', () => {
  it('filters and sorts by operational priority', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { id: 'delivered', data: () => ({ status: 'delivered' }) },
        { id: 'refund', data: () => ({ status: 'submitted', refundRequest: { status: 'requested' } }) },
        { id: 'regen', data: () => ({ status: 'review', quoteRegenerationRequested: true }) },
        { id: 'submitted', data: () => ({ status: 'submitted' }) },
      ],
    });

    const queue = await getAdminRequestQueue(null);

    expect(queue.map((item) => item.id)).toEqual(['regen', 'refund', 'submitted', 'delivered']);
  });

  it('applies the filter before sorting', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { id: 'delivered', data: () => ({ status: 'delivered' }) },
        { id: 'submitted', data: () => ({ status: 'submitted' }) },
      ],
    });

    const queue = await getAdminRequestQueue('delivered');

    expect(queue.map((item) => item.id)).toEqual(['delivered']);
  });
});
