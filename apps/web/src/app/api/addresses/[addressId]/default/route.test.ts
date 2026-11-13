import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ collection: vi.fn(() => ({ get: mocks.get })) })),
    })),
    batch: vi.fn(() => ({ update: mocks.batchUpdate, commit: mocks.batchCommit })),
  },
}));

import { POST } from './route';

const call = (addressId: string) =>
  POST(new NextRequest('http://localhost/api/addresses/x/default', { method: 'POST' }), {
    params: Promise.resolve({ addressId }),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.get.mockReset();
  mocks.batchUpdate.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/addresses/[addressId]/default', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await call('addr-1');

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404s for an address the customer does not own', async () => {
    mocks.get.mockResolvedValue({ docs: [{ id: 'other' }] });

    const response = await call('addr-1');

    expect(response.status).toBe(404);
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });

  it('flags only the requested address as default', async () => {
    mocks.get.mockResolvedValue({
      docs: [{ id: 'addr-1', ref: 'ref-1' }, { id: 'addr-2', ref: 'ref-2' }],
    });

    const response = await call('addr-1');

    expect(mocks.batchUpdate).toHaveBeenCalledWith('ref-1', { isDefault: true });
    expect(mocks.batchUpdate).toHaveBeenCalledWith('ref-2', { isDefault: false });
    expect(mocks.batchCommit).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
