// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getRequests: vi.fn(),
  getUserPreferences: vi.fn(),
  auth: {
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('@/features/requests/services/requests', () => ({ getRequests: mocks.getRequests }));
vi.mock('@/features/users/services/userPreferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
}));

import { useDashboardOverview } from './useDashboardOverview';
import { DEFAULT_DASHBOARD_METRICS } from '@/features/users/services/dashboardMetrics';
import type { Request } from '@/types/request';

const request = (overrides: Record<string, unknown>) =>
  ({ id: `r-${Math.random().toString(36).slice(2, 7)}`, ...overrides }) as unknown as Request;

const fixtures = [
  request({ status: 'submitted', createdAt: { seconds: 300 } }),
  request({ status: 'review', createdAt: { seconds: 100 } }),
  request({ status: 'awaiting_payment', createdAt: { seconds: 200 } }),
  request({ status: 'awaiting_payment', payment: { status: 'completed' }, createdAt: { seconds: 50 } }),
  request({
    status: 'shipped',
    additionalItemRequests: [{ status: 'awaiting_payment' }],
    createdAt: { seconds: 400 },
  }),
  request({ status: 'delivered', tracking: { internalTrackingId: 'SHP-2026-000001' } }),
  request({ status: 'refunded' }),
];

let signedInUser: Record<string, unknown> | null;

beforeEach(() => {
  signedInUser = { uid: 'user-1', displayName: 'Ada Lovelace', email: 'ada@example.com' };
  mocks.getRequests.mockReset().mockResolvedValue({ requests: fixtures });
  mocks.getUserPreferences
    .mockReset()
    .mockResolvedValue({ dashboardMetrics: DEFAULT_DASHBOARD_METRICS });
  mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
    void callback(signedInUser);
    return vi.fn();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useDashboardOverview());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useDashboardOverview — loading', () => {
  it('clears requests when signed out', async () => {
    signedInUser = null;
    const { result } = await mount();

    expect(result.current.requests).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mocks.getRequests).not.toHaveBeenCalled();
  });

  it('sorts requests newest first', async () => {
    const { result } = await mount();

    const seconds = result.current.requests.map((item) => item.createdAt?.seconds ?? 0);
    expect(seconds).toEqual([...seconds].sort((a, b) => b - a));
  });

  it('stops loading when the fetch fails', async () => {
    mocks.getRequests.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(result.current.requests).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('useDashboardOverview — greeting', () => {
  it('uses the first name', async () => {
    const { result } = await mount();

    expect(result.current.userName).toBe('Ada');
  });

  it('falls back to the email prefix', async () => {
    signedInUser = { uid: 'user-1', displayName: null, email: 'grace@example.com' };
    const { result } = await mount();

    expect(result.current.userName).toBe('grace');
  });

  it('falls back to a neutral greeting', async () => {
    signedInUser = { uid: 'user-1' };
    const { result } = await mount();

    expect(result.current.userName).toBe('there');
  });
});

describe('useDashboardOverview — metrics', () => {
  it('counts every status bucket', async () => {
    const { result } = await mount();

    expect(result.current.metricValues).toMatchObject({
      active: 5,
      submitted: 1,
      quote_ready: 1,
      awaiting_payment: 2,
      paid: 0,
      purchased: 0,
      warehouse_received: 0,
      ready_for_international_shipping: 0,
      packed: 0,
      shipped: 1,
      in_transit: 1,
      out_for_delivery: 0,
      delivered: 1,
      refunded: 1,
    });
  });

  it('shows only the selected metrics', async () => {
    const { result } = await mount();

    expect(result.current.visibleMetrics.map((metric) => metric.id)).toEqual(
      DEFAULT_DASHBOARD_METRICS
    );
  });

  it('drops unknown metric ids from saved preferences', async () => {
    mocks.getUserPreferences.mockResolvedValue({
      dashboardMetrics: ['active', 'not-a-metric'],
    });
    const { result } = await mount();

    expect(result.current.visibleMetrics.map((metric) => metric.id)).toEqual(['active']);
  });
});

describe('useDashboardOverview — derived lists', () => {
  it('flags quotes and payments that need attention', async () => {
    const { result } = await mount();

    expect(result.current.attentionRequired).toHaveLength(3);
    /* The hook sorts newest first, and the attention list preserves that order. */
    expect(result.current.attentionRequired.map((item) => item.status)).toEqual([
      'shipped',
      'awaiting_payment',
      'review',
    ]);
  });

  it('caps the recent list at five', async () => {
    const { result } = await mount();

    expect(result.current.recentRequests).toHaveLength(5);
  });

  it('picks the first request with a tracking id', async () => {
    const { result } = await mount();

    expect(result.current.latestShipment?.tracking?.internalTrackingId).toBe('SHP-2026-000001');
  });

  it('reports no shipment when nothing is tracked', async () => {
    mocks.getRequests.mockResolvedValue({ requests: fixtures.slice(0, 5) });
    const { result } = await mount();

    expect(result.current.latestShipment).toBeUndefined();
  });
});
