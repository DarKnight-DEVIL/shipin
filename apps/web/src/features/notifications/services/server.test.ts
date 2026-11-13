import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
}));

vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { collection: () => ({ add: mocks.add }) },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: mocks.serverTimestamp },
}));

import { createNotification } from './server';

beforeEach(() => {
  mocks.add.mockReset();
  mocks.add.mockResolvedValue({ id: 'notif-1' });
});

describe('createNotification', () => {
  it('writes an unread notification and returns its id', async () => {
    await expect(
      createNotification('user-1', 'req-9', 'Quote ready', 'Open the app', 'quote')
    ).resolves.toBe('notif-1');

    expect(mocks.add).toHaveBeenCalledWith({
      userId: 'user-1',
      requestId: 'req-9',
      title: 'Quote ready',
      message: 'Open the app',
      type: 'quote',
      read: false,
      createdAt: '__SERVER_TS__',
    });
  });

  it('supports notifications without a request reference', async () => {
    await createNotification('user-1', null, 'Welcome', 'Hello', 'system');

    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null, type: 'system' })
    );
  });
});
