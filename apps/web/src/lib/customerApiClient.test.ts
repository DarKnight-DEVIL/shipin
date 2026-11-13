/**
 * Tests for the customer API client wrapper.
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
// first file to import customerApiClient decides which `@/lib/firebase` mock
// it binds to, so a static import can inherit another file's auth stub.
let CustomerApiError: typeof import('./customerApiClient').CustomerApiError;
let customerApi: typeof import('./customerApiClient').customerApi;

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  ({ CustomerApiError, customerApi } = await import('./customerApiClient'));
  state.currentUser = { getIdToken: vi.fn(async () => 'customer-token') };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('customerApi', () => {
  it('returns the parsed payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, requests: ['r1'] }));

    await expect(customerApi('/api/requests')).resolves.toEqual({
      success: true,
      requests: ['r1'],
    });
  });

  it('attaches the customer bearer token and method', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await customerApi('/api/requests', { method: 'PATCH', body: { note: 'hi' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer customer-token');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"note":"hi"}');
  });

  it('throws CustomerApiError with the server code and status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Not found', code: 'NOT_FOUND' }, 404)
    );

    const call = customerApi('/api/requests/missing');

    await expect(call).rejects.toBeInstanceOf(CustomerApiError);
    await expect(call).rejects.toMatchObject({
      name: 'CustomerApiError',
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('fails fast when signed out', async () => {
    state.currentUser = null;

    await expect(customerApi('/api/requests')).rejects.toMatchObject({
      name: 'CustomerApiError',
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('maps a network failure to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));

    await expect(customerApi('/api/requests')).rejects.toMatchObject({
      name: 'CustomerApiError',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });
});
