import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

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
      where: vi.fn(() => ({ where: vi.fn(() => ({ get: mocks.get })) })),
    })),
    batch: vi.fn(() => ({ update: mocks.batchUpdate, commit: mocks.batchCommit })),
  },
}));

import { POST } from './route';

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.get.mockReset();
  mocks.batchUpdate.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/notifications/read-all', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(new Request('http://localhost/api/notifications/read-all'));

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('marks every unread notification as read', async () => {
    mocks.get.mockResolvedValue({
      empty: false,
      size: 3,
      docs: [{ ref: 'ref-1' }, { ref: 'ref-2' }, { ref: 'ref-3' }],
    });

    const response = await POST(new Request('http://localhost/api/notifications/read-all'));

    expect(mocks.batchUpdate).toHaveBeenCalledTimes(3);
    expect(mocks.batchUpdate).toHaveBeenCalledWith('ref-1', { read: true });
    expect(mocks.batchCommit).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true, count: 3 });
  });

  it('skips the batch when everything is already read', async () => {
    mocks.get.mockResolvedValue({ empty: true, size: 0, docs: [] });

    const response = await POST(new Request('http://localhost/api/notifications/read-all'));

    expect(mocks.batchCommit).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
