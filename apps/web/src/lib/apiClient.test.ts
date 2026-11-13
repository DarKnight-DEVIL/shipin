/**
 * Tests for the shared authenticated fetch client (`apiFetch`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  currentUser: null as null | { getIdToken: () => Promise<string> },
}));

vi.mock('@/lib/firebase', () => ({
  get auth() {
    return { currentUser: state.currentUser };
  },
}));

// Imported per file instead of statically: with a shared module registry the
// first file to import apiClient decides which `@/lib/firebase` mock it binds
// to, so a static import can silently inherit another file's auth stub.
let apiFetch: typeof import('./apiClient').apiFetch;
let ApiError: typeof import('./apiClient').ApiError;

const signIn = () => {
  state.currentUser = { getIdToken: vi.fn(async () => 'id-token') };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  ({ apiFetch, ApiError } = await import('./apiClient'));
  state.currentUser = null;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authentication', () => {
  it('rejects when signed out', async () => {
    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'AUTHENTICATION_REQUIRED',
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches the bearer token and same-origin credentials', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: 1 }));

    await apiFetch('/api/thing');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer id-token');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
  });
});

describe('request shaping', () => {
  it('omits a body and content-type for GET', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/thing');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('serialises JSON bodies and merges extra headers', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing', {
      method: 'POST',
      body: { amount: 10 },
      extraHeaders: { 'X-CSRF-Token': 'abc' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"amount":10}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-CSRF-Token']).toBe('abc');
  });

  it('returns the parsed payload', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'ok' }));

    await expect(apiFetch('/api/thing')).resolves.toEqual({ success: true, value: 'ok' });
  });
});

describe('error handling', () => {
  it('normalises an error payload', async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Not enough balance', code: 'INSUFFICIENT_BALANCE' }, 400)
    );

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      message: 'Not enough balance',
      code: 'INSUFFICIENT_BALANCE',
      status: 400,
    });
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    signIn();
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }));

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      message: 'Request failed (500).',
      code: 'UNKNOWN_ERROR',
      status: 500,
    });
  });

  it('treats success:false as an error even with a 200 status', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'Nope' }, 200));

    await expect(apiFetch('/api/thing')).rejects.toBeInstanceOf(ApiError);
  });

  it('maps a thrown fetch to NETWORK_ERROR', async () => {
    signIn();
    fetchMock.mockRejectedValue(new TypeError('offline'));

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      message: 'Could not reach the server.',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('uses a custom error class when provided', async () => {
    signIn();
    class AdminApiError extends ApiError {}
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'x' }, 403));

    await expect(
      apiFetch('/api/admin/thing', { errorClass: AdminApiError })
    ).rejects.toBeInstanceOf(AdminApiError);
  });
});
