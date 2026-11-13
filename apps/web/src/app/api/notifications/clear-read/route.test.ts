import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  get: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ where: vi.fn(() => ({ get: mocks.get })) })),
    })),
    batch: vi.fn(() => ({ delete: mocks.batchDelete, commit: mocks.batchCommit })),
  },
}));

import { POST } from './route';

const unauthenticated = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.get.mockReset();
  mocks.batchDelete.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/notifications/clear-read', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(unauthenticated());

    const response = await POST(new Request('http://localhost/api/notifications/clear-read'));

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('deletes every read notification and reports the count', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [{ ref: 'ref-1' }, { ref: 'ref-2' }],
    });

    const response = await POST(new Request('http://localhost/api/notifications/clear-read'));

    expect(mocks.batchDelete).toHaveBeenCalledTimes(2);
    expect(mocks.batchDelete).toHaveBeenCalledWith('ref-1');
    expect(mocks.batchCommit).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, count: 2 });
  });

  it('does not batch when nothing is read', async () => {
    mocks.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

    const response = await POST(new Request('http://localhost/api/notifications/clear-read'));

    expect(mocks.batchCommit).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true, count: 0 });
  });
});
