/**
 * Tests for the shared authenticated fetch client (`apiFetch`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  appCheckToken: null as string | null,
  forcedAppCheckToken: null as string | null,
  currentUser: null as null | {
    getIdToken: () => Promise<string>;
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  },
}));

vi.mock('@/lib/firebase', () => ({
  get auth() {
    return { currentUser: state.currentUser };
  },
  // Null means App Check is not configured, which is the default here. The
  // forced variant is what the rejection retry asks for.
  getAppCheckToken: async (forceRefresh?: boolean) =>
    forceRefresh ? state.forcedAppCheckToken : state.appCheckToken,
}));

const appCheckSignal = vi.hoisted(() => ({
  notifyAppCheckFailure: vi.fn(),
  clearAppCheckFailure: vi.fn(),
}));

const retrySignal = vi.hoisted(() => ({
  beginRetryNotice: vi.fn(),
  endRetryNotice: vi.fn(),
}));

// Stubbed so the assertions can see that a backoff was published, without
// depending on module-level state shared across files.
vi.mock('@/lib/requestRetry', () => ({
  beginRetryNotice: retrySignal.beginRetryNotice,
  endRetryNotice: retrySignal.endRetryNotice,
}));

// Stubbed so the assertions below can see the banner transitions without
// depending on React state.
vi.mock('@/lib/appCheckFailure', () => ({
  notifyAppCheckFailure: appCheckSignal.notifyAppCheckFailure,
  clearAppCheckFailure: appCheckSignal.clearAppCheckFailure,
}));

// Imported per file instead of statically: with a shared module registry the
// first file to import apiClient decides which `@/lib/firebase` mock it binds
// to, so a static import can silently inherit another file's auth stub.
let apiFetch: typeof import('./apiClient').apiFetch;
let ApiError: typeof import('./apiClient').ApiError;

const signIn = () => {
  state.currentUser = {
    getIdToken: vi.fn(async () => 'id-token'),
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoURL: 'https://img/ada.png',
  };
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
  state.appCheckToken = null;
  fetchMock.mockReset();
  appCheckSignal.notifyAppCheckFailure.mockClear();
  appCheckSignal.clearAppCheckFailure.mockClear();
  retrySignal.beginRetryNotice.mockClear();
  retrySignal.endRetryNotice.mockClear();
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

  it('forwards the App Check token when one is available', async () => {
    signIn();
    state.appCheckToken = 'app-check-token';
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing');

    // The Admin SDK bypasses Firebase's own enforcement, so this header is the
    // only thing our routes can verify.
    expect(fetchMock.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe(
      'app-check-token'
    );
  });

  it('sends no App Check header when App Check is not configured', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing');

    expect(fetchMock.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBeUndefined();
  });
});

describe('idempotency keys', () => {
  it('sends the key as a header', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/wallet', { method: 'POST', body: { amount: 5 }, idempotencyKey: 'key-abc-123' });

    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('key-abc-123');
  });

  it('replays a keyed write once after a dropped connection', async () => {
    signIn();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    fetchMock.mockResolvedValue(jsonResponse({ success: true, transactionId: 'txn-1' }));

    await expect(
      apiFetch('/api/wallet', { method: 'POST', body: { amount: 5 }, idempotencyKey: 'key-abc-123' })
    ).resolves.toMatchObject({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Same key on both attempts: that is what lets the server replay instead
    // of charging again.
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('key-abc-123');
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('key-abc-123');
  });

  it('replays a keyed write after a 503', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(
      apiFetch('/api/wallet', { method: 'POST', body: {}, idempotencyKey: 'key-abc-123' })
    ).resolves.toMatchObject({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('publishes a retry notice while backing off', async () => {
    signIn();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/wallet', { method: 'POST', body: {}, idempotencyKey: 'key-abc-123' });

    // Without this the page looks frozen for the length of the backoff.
    expect(retrySignal.beginRetryNotice).toHaveBeenCalledTimes(1);
    expect(retrySignal.endRetryNotice).toHaveBeenCalledTimes(1);
  });

  it('clears the notice even when the retry fails', async () => {
    signIn();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      apiFetch('/api/wallet', { method: 'POST', body: {}, idempotencyKey: 'key-abc-123' })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(retrySignal.beginRetryNotice).toHaveBeenCalledTimes(1);
    expect(retrySignal.endRetryNotice).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing when the first attempt succeeds', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing');

    expect(retrySignal.beginRetryNotice).not.toHaveBeenCalled();
  });

  it('does not replay a write without a key', async () => {
    signIn();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      apiFetch('/api/wallet', { method: 'POST', body: { amount: 5 } })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('app check failures', () => {
  it('publishes a rejection to the retry banner', async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, code: 'APP_CHECK_FAILED', error: 'App Check verification failed.' },
        401
      )
    );

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      code: 'APP_CHECK_FAILED',
      status: 401,
    });

    expect(appCheckSignal.notifyAppCheckFailure).toHaveBeenCalledTimes(1);
  });

  it('retries once with a force-refreshed token before surfacing the rejection', async () => {
    signIn();
    state.appCheckToken = 'stale-token';
    state.forcedAppCheckToken = 'fresh-token';
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, code: 'APP_CHECK_FAILED', error: 'App Check verification failed.' },
          401
        )
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));

    await expect(apiFetch('/api/thing')).resolves.toMatchObject({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(retryHeaders['X-Firebase-AppCheck']).toBe('fresh-token');
    // The recovery worked, so the user never sees the banner.
    expect(appCheckSignal.notifyAppCheckFailure).not.toHaveBeenCalled();
    expect(appCheckSignal.clearAppCheckFailure).toHaveBeenCalledTimes(1);
  });

  it('shows the banner only when the forced-token retry is rejected too', async () => {
    signIn();
    state.appCheckToken = 'stale-token';
    state.forcedAppCheckToken = 'fresh-token';
    // A fresh Response per call: a body can only be read once, so reusing one
    // object would make the retry look like an unknown error instead.
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { success: false, code: 'APP_CHECK_FAILED', error: 'App Check verification failed.' },
        401
      )
    );

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      code: 'APP_CHECK_FAILED',
    });

    // Exactly one retry: a second rejection means the device cannot attest, and
    // a loop would only delay the banner.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(appCheckSignal.notifyAppCheckFailure).toHaveBeenCalledTimes(1);
  });

  it('does not retry when no new token can be minted', async () => {
    signIn();
    state.appCheckToken = 'stale-token';
    state.forcedAppCheckToken = null;
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, code: 'APP_CHECK_FAILED', error: 'App Check verification failed.' },
        401
      )
    );

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({
      code: 'APP_CHECK_FAILED',
    });

    // Replaying with the same stale token would just be a second rejection.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(appCheckSignal.notifyAppCheckFailure).toHaveBeenCalledTimes(1);
  });

  it('leaves other failures to page-level error handling', async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, code: 'FORBIDDEN', error: 'nope' }, 403)
    );

    await expect(apiFetch('/api/thing')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(appCheckSignal.notifyAppCheckFailure).not.toHaveBeenCalled();
  });

  it('clears the banner once a request succeeds', async () => {
    signIn();
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await apiFetch('/api/thing');

    expect(appCheckSignal.clearAppCheckFailure).toHaveBeenCalledTimes(1);
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
      extraHeaders: { 'X-Trace-Id': 'abc' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"amount":10}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Trace-Id']).toBe('abc');
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

describe('missing profile recovery', () => {
  const profileMissing = () =>
    jsonResponse(
      { success: false, error: 'User profile not found.', code: 'USER_PROFILE_NOT_FOUND' },
      403
    );

  it('creates the profile and retries the original request once', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(profileMissing())
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: 'wallet' }));

    await expect(apiFetch('/api/wallet')).resolves.toEqual({
      success: true,
      data: 'wallet',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [repairPath, repairInit] = fetchMock.mock.calls[1];
    expect(repairPath).toBe('/api/profile');
    expect(repairInit.method).toBe('POST');
    expect(repairInit.headers.Authorization).toBe('Bearer id-token');
    expect(JSON.parse(repairInit.body)).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
      photoURL: 'https://img/ada.png',
    });

    // The retry goes back to the route that failed, not to the repair path.
    expect(fetchMock.mock.calls[2][0]).toBe('/api/wallet');
  });

  it('derives a display name when the provider has none', async () => {
    state.currentUser = {
      getIdToken: vi.fn(async () => 'id-token'),
      displayName: null,
      email: 'ada@example.com',
    };
    fetchMock
      .mockResolvedValueOnce(profileMissing())
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await apiFetch('/api/wallet');

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).displayName).toBe('ada');
  });

  it('surfaces the original error when the repair fails', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(profileMissing())
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'nope' }, 500));

    await expect(apiFetch('/api/wallet')).rejects.toMatchObject({
      code: 'USER_PROFILE_NOT_FOUND',
      status: 403,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry twice when the profile is still missing', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(profileMissing())
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(profileMissing());

    await expect(apiFetch('/api/wallet')).rejects.toMatchObject({
      code: 'USER_PROFILE_NOT_FOUND',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not repair on other 403s', async () => {
    signIn();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: 'Insufficient permissions.', code: 'AUTHORIZATION_ERROR' },
        403
      )
    );

    await expect(apiFetch('/api/wallet')).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('stale verification token recovery', () => {
  const verificationRequired = () =>
    jsonResponse(
      {
        success: false,
        error: 'Please verify your email address before accessing this resource.',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      },
      403
    );

  it('forces a token refresh and retries with the new token', async () => {
    signIn();
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    state.currentUser = { ...state.currentUser!, getIdToken };

    fetchMock
      .mockResolvedValueOnce(verificationRequired())
      .mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));

    await expect(apiFetch('/api/requests')).resolves.toEqual({
      success: true,
      data: 'ok',
    });

    expect(getIdToken).toHaveBeenLastCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer fresh-token'
    );
  });

  it('surfaces the error when the refresh fails', async () => {
    signIn();
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('stale-token')
      .mockRejectedValueOnce(new Error('refresh failed'));
    state.currentUser = { ...state.currentUser!, getIdToken };
    fetchMock.mockResolvedValue(verificationRequired());

    await expect(apiFetch('/api/requests')).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      status: 403,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('transient GET retry', () => {
  it('replays a GET once after a 503 and returns the second response', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));

    await expect(apiFetch('/api/requests')).resolves.toEqual({
      success: true,
      data: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('replays a GET once after a network failure', async () => {
    signIn();
    fetchMock
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await expect(apiFetch('/api/requests')).resolves.toEqual({
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waits 300ms before the retry', async () => {
    vi.useFakeTimers();
    try {
      signIn();
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ success: true }));

      const pending = apiFetch('/api/requests');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(299);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours Retry-After instead of the base delay', async () => {
    vi.useFakeTimers();
    try {
      signIn();
      fetchMock
        .mockResolvedValueOnce(
          new Response('', { status: 503, headers: { 'Retry-After': '1' } })
        )
        .mockResolvedValueOnce(jsonResponse({ success: true }));

      const pending = apiFetch('/api/requests');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a network error when the retry itself cannot connect', async () => {
    signIn();
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('offline'));

    await expect(apiFetch('/api/requests')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the base delay for an unparseable Retry-After', async () => {
    vi.useFakeTimers();
    try {
      signIn();
      fetchMock
        .mockResolvedValueOnce(
          new Response('', { status: 503, headers: { 'Retry-After': 'soon' } })
        )
        .mockResolvedValueOnce(jsonResponse({ success: true }));

      const pending = apiFetch('/api/requests');
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(300);
      await expect(pending).resolves.toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after one retry', async () => {
    signIn();
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    await expect(apiFetch('/api/requests')).rejects.toMatchObject({
      status: 503,
      message: 'Request failed (503).',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a POST, which is not idempotent', async () => {
    signIn();
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    await expect(
      apiFetch('/api/refunds', { method: 'POST', body: { amount: 10 } })
    ).rejects.toMatchObject({ status: 503 });

    // Replaying this could refund twice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-transient 500', async () => {
    signIn();
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(apiFetch('/api/requests')).rejects.toMatchObject({
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
