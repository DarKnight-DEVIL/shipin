import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: mocks.get, update: mocks.update })) })),
  },
}));

import { PATCH } from './route';

const context = (requestId = 'req-1') => ({ params: Promise.resolve({ requestId }) });

const request = (body: unknown = { additionalItemRequests: [] }) =>
  new NextRequest('http://localhost/api/admin/requests/req-1/additional-items', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: 'admin-1' });
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({}) });
  mocks.update.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/admin/requests/[requestId]/additional-items', () => {
  it('requires an administrator', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Administrator access required.'));

    const response = await PATCH(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Administrator access required.',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires a request id', async () => {
    const response = await PATCH(request(), context(''));

    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('404s for an unknown request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stores the additional item list', async () => {
    const items = [{ id: 'item-1', status: 'pending' }];

    const response = await PATCH(request({ additionalItemRequests: items }), context());

    expect(mocks.update).toHaveBeenCalledWith({
      additionalItemRequests: items,
      updatedAt: expect.any(Date),
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('also advances the request status when supplied', async () => {
    await PATCH(request({ additionalItemRequests: [], status: 'awaiting_payment' }), context());

    expect(mocks.update.mock.calls[0][0]).toMatchObject({ status: 'awaiting_payment' });
  });

  it('reports an unreadable body as a failure', async () => {
    const response = await PATCH(request('{broken'), context());

    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});
