import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  getRequest: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.getRequest })) })),
  },
}));
vi.mock('@/features/notifications/services/server', () => ({
  createNotification: mocks.createNotification,
}));

import { POST } from './route';

const valid = { title: 'Quote ready', message: 'Your quote is ready.', type: 'quote' };

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/notifications', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile
    .mockReset()
    .mockResolvedValue({ profile: { uid: 'user-1', role: 'customer' } });
  mocks.getRequest.mockReset().mockResolvedValue({ exists: true, data: () => ({ userId: 'user-1' }) });
  mocks.createNotification.mockReset().mockResolvedValue('n-1');
});

describe('POST /api/notifications', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request(valid));

    expect(response.status).toBe(401);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{broken'));

    expect(response.status).toBe(400);
  });

  it('requires a title and a known type', async () => {
    const noTitle = await POST(request({ message: 'hi', type: 'quote' }));
    const badType = await POST(request({ ...valid, type: 'nope' }));

    expect(noTitle.status).toBe(400);
    expect(badType.status).toBe(400);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('creates a notification for the signed-in user', async () => {
    const response = await POST(request(valid));

    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-1',
      null,
      'Quote ready',
      'Your quote is ready.',
      'quote'
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, notificationId: 'n-1' });
  });

  it('stops a customer from notifying someone else', async () => {
    const response = await POST(request({ ...valid, userId: 'user-2' }));

    expect(response.status).toBe(400);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('lets an admin notify another customer', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue({
      profile: { uid: 'admin-1', role: 'admin' },
    });
    mocks.getRequest.mockResolvedValue({ exists: true, data: () => ({ userId: 'user-2' }) });

    const response = await POST(request({ ...valid, userId: 'user-2', requestId: 'req-1' }));

    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-2',
      'req-1',
      'Quote ready',
      'Your quote is ready.',
      'quote'
    );
    expect(response.status).toBe(201);
  });

  it('rejects a request that does not belong to the recipient', async () => {
    mocks.getRequest.mockResolvedValue({ exists: true, data: () => ({ userId: 'user-2' }) });

    const response = await POST(request({ ...valid, requestId: 'req-1' }));

    expect(response.status).toBe(400);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('rejects an unknown request', async () => {
    mocks.getRequest.mockResolvedValue({ exists: false });

    const response = await POST(request({ ...valid, requestId: 'missing' }));

    expect(response.status).toBe(400);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});
