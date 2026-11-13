// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
  saveDashboardMetrics: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  auth: {
    currentUser: null as null | { uid: string },
    onAuthStateChanged: vi.fn(),
  },
}));

vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }));
vi.mock('@/features/users/services/userPreferences', () => ({
  getUserPreferences: mocks.getUserPreferences,
  saveDashboardMetrics: mocks.saveDashboardMetrics,
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { useDashboardMetricSettings } from './useDashboardMetricSettings';
import {
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
} from '@/features/users/services/dashboardMetrics';

beforeEach(() => {
  mocks.getUserPreferences
    .mockReset()
    .mockResolvedValue({ dashboardMetrics: DEFAULT_DASHBOARD_METRICS });
  mocks.saveDashboardMetrics.mockReset().mockResolvedValue(undefined);
  Object.values(mocks.toast).forEach((fn) => fn.mockReset());
  mocks.auth.currentUser = { uid: 'user-1' };
  mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
    void callback({ uid: 'user-1' });
    return vi.fn();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const view = renderHook(() => useDashboardMetricSettings());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useDashboardMetricSettings — loading', () => {
  it('loads the saved selection', async () => {
    const { result } = await mount();

    expect(result.current.selectedMetrics).toEqual(DEFAULT_DASHBOARD_METRICS);
  });

  it('stops loading when signed out', async () => {
    mocks.auth.onAuthStateChanged.mockImplementation((callback: (user: unknown) => unknown) => {
      void callback(null);
      return vi.fn();
    });
    const { result } = await mount();

    expect(result.current.loading).toBe(false);
    expect(mocks.getUserPreferences).not.toHaveBeenCalled();
  });

  it('falls back to defaults when loading fails', async () => {
    mocks.getUserPreferences.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    expect(result.current.selectedMetrics).toEqual(DEFAULT_DASHBOARD_METRICS);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('useDashboardMetricSettings — selection', () => {
  it('adds a metric', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggle('paid');
    });

    expect(result.current.selectedMetrics).toContain('paid');
    expect(result.current.selectedMetrics).toHaveLength(DEFAULT_DASHBOARD_METRICS.length + 1);
  });

  it('refuses to drop below the minimum', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggle('active');
    });

    expect(result.current.selectedMetrics).toHaveLength(MIN_DASHBOARD_METRICS);
    expect(result.current.selectedMetrics).toContain('active');
  });

  it('removes a metric once above the minimum', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggle('paid');
    });
    await act(async () => {
      result.current.toggle('active');
    });

    expect(result.current.selectedMetrics).not.toContain('active');
    expect(result.current.selectedMetrics).toHaveLength(MIN_DASHBOARD_METRICS);
  });

  it('restores the defaults and clears the saved flag', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.toggle('paid');
    });
    await act(async () => {
      result.current.reset();
    });

    expect(result.current.selectedMetrics).toEqual(DEFAULT_DASHBOARD_METRICS);
    expect(result.current.saved).toBe(false);
  });
});

describe('useDashboardMetricSettings — saving', () => {
  it('requires a signed-in user', async () => {
    const { result } = await mount();
    mocks.auth.currentUser = null;

    await act(async () => {
      await result.current.save();
    });

    expect(mocks.toast.warning).toHaveBeenCalledWith('Please sign in first.');
    expect(mocks.saveDashboardMetrics).not.toHaveBeenCalled();
  });

  it('saves the selection', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect(mocks.saveDashboardMetrics).toHaveBeenCalledWith('user-1', DEFAULT_DASHBOARD_METRICS);
    expect(result.current.saved).toBe(true);
    expect(mocks.toast.success).toHaveBeenCalledWith('Dashboard updated');
    expect(result.current.saving).toBe(false);
  });

  it('reports a save failure', async () => {
    mocks.saveDashboardMetrics.mockRejectedValue(new Error('offline'));
    const { result } = await mount();

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saved).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't save dashboard settings");
  });
});
