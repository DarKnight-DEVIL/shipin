/**
 * Integration test for POST /api/payment/complete-wallet.
 *
 * Exercises the full route handler (auth → body validation → service
 * delegation → response shape) with the wallet payment service and
 * auth layer mocked, so no Firebase credentials are needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireAuthWithProfile: vi.fn(),
}));

vi.mock('@/utils/errors', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

const idem = vi.hoisted(() => ({
  readKey: vi.fn(),
  readPrior: vi.fn(),
  remember: vi.fn(),
}));

// The route imports the server store, which pulls in firebase-admin; stub it so
// these tests stay about the replay behaviour.
vi.mock('@/lib/idempotency', () => ({
  readIdempotencyKey: idem.readKey,
  readIdempotentResponse: idem.readPrior,
  rememberIdempotentResponse: idem.remember,
}));

vi.mock('@/features/wallet/services/walletPayment', () => ({
  processWalletPayment: vi.fn(),
  walletPaymentErrorResponse: (error: unknown) =>
    error instanceof Error
      ? { code: error.message, message: error.message, status: 400 }
      : null,
}));

import { requireAuthWithProfile } from '@/lib/auth';
import { processWalletPayment } from '@/features/wallet/services/walletPayment';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuthWithProfile);
const mockProcess = vi.mocked(processWalletPayment);

function makeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Map(),
  } as unknown as NextRequest;
}

const AUTH = { token: { uid: 'user-1' }, profile: { uid: 'user-1', role: 'customer' } } as const;

describe('POST /api/payment/complete-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idem.readKey.mockReturnValue(null);
    idem.readPrior.mockResolvedValue(null);
    idem.remember.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json(
        { success: false, error: 'Authentication required.', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      ) as never
    );
    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10 }))) as Response;
    expect(res.status).toBe(401);
  });

  it('returns 400 when requestId is empty and amount is negative', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    const res = (await POST(makeRequest({ requestId: '', amount: -5 }))) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it('returns 400 for non-positive amount', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    const res = (await POST(makeRequest({ requestId: 'r1', amount: 0 }))) as Response;
    expect(res.status).toBe(400);
  });

  it('delegates to the wallet service with the authenticated uid', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    mockProcess.mockResolvedValue({ success: true, transactionId: 'txn-1' });

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10.5 }))) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, transactionId: 'txn-1' });
    expect(mockProcess).toHaveBeenCalledWith('r1', 10.5, 'user-1');
  });

  it('treats a non-string requestId as missing', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);

    const res = (await POST(makeRequest({ requestId: 42, amount: 10 }))) as Response;

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'Request ID is required.' });
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('returns 500 for an unrecognised service failure', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    mockProcess.mockRejectedValue('unexpected');

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10 }))) as Response;

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ success: false });
  });

  it('replays a stored result instead of charging again', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    idem.readKey.mockReturnValue('key-1');
    idem.readPrior.mockResolvedValue({
      status: 200,
      body: { success: true, transactionId: 'txn-first' },
    });

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10.5 }))) as Response;

    // A dropped response, then a retry: the customer must see the original
    // success, and the wallet must not be debited twice.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      transactionId: 'txn-first',
    });
    expect(mockProcess).not.toHaveBeenCalled();
    expect(idem.readPrior).toHaveBeenCalledWith({
      uid: 'user-1',
      scope: 'wallet.complete',
      key: 'key-1',
    });
  });

  it('records the result so the next retry can replay it', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    mockProcess.mockResolvedValue({ success: true, transactionId: 'txn-1' });
    idem.readKey.mockReturnValue('key-2');

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10.5 }))) as Response;

    expect(res.status).toBe(200);
    expect(idem.remember).toHaveBeenCalledWith(
      { uid: 'user-1', scope: 'wallet.complete', key: 'key-2' },
      { status: 200, body: { success: true, transactionId: 'txn-1' } }
    );
  });

  it('touches the store only when the caller sent a key', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    mockProcess.mockResolvedValue({ success: true, transactionId: 'txn-1' });

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10.5 }))) as Response;

    expect(res.status).toBe(200);
    expect(idem.readPrior).not.toHaveBeenCalled();
    expect(idem.remember).not.toHaveBeenCalled();
  });

  it('maps known service errors to HTTP responses', async () => {
    mockRequireAuth.mockResolvedValue(AUTH as never);
    mockProcess.mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const res = (await POST(makeRequest({ requestId: 'r1', amount: 10.5 }))) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INSUFFICIENT_BALANCE');
    expect(body.success).toBe(false);
  });
});