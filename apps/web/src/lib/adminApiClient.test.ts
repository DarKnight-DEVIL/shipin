/**
 * Tests for the admin API client wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  currentUser: null as null | { getIdToken: () => Promise<string> },
}));

vi.mock('@/lib/firebase', () => ({
  get auth() {
    return { currentUser: state.currentUser };
  },
  db: {},
  app: {},
}));

// Imported per file instead of statically: with a shared module registry the
// first importer fixes which mocks this module binds to, so a static import
// can inherit another file's stub.
let AdminApiError: typeof import('./adminApiClient').AdminApiError;
let adminApi: typeof import('./adminApiClient').adminApi;

beforeEach(async () => {
  vi.resetModules();
  ({ AdminApiError, adminApi } = await import('./adminApiClient'));
});

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  state.currentUser = { getIdToken: vi.fn(async () => 'admin-token') };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adminApi', () => {
  it('attaches the admin bearer token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, rows: [] }));

    await adminApi('/api/admin/requests');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer admin-token');
    expect(init.method).toBe('GET');
  });

  it('sends a JSON body for writes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await adminApi('/api/admin/wallet/credit', { method: 'POST', body: { amount: 25 } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"amount":25}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws AdminApiError with the server code and status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'MFA required', code: 'MFA_REQUIRED' }, 403)
    );

    const call = adminApi('/api/admin/wallet/credit', { method: 'POST', body: {} });

    await expect(call).rejects.toBeInstanceOf(AdminApiError);
    await expect(call).rejects.toMatchObject({
      name: 'AdminApiError',
      message: 'MFA required',
      code: 'MFA_REQUIRED',
      status: 403,
    });
  });

  it('fails fast when signed out', async () => {
    state.currentUser = null;

    await expect(adminApi('/api/admin/requests')).rejects.toMatchObject({
      name: 'AdminApiError',
      code: 'AUTHENTICATION_REQUIRED',
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
