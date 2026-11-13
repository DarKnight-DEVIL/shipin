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