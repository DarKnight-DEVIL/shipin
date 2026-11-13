import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ update: mocks.update, delete: mocks.remove })),
        })),
      })),
    })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { DELETE, PATCH } from './route';

const context = { params: Promise.resolve({ addressId: 'addr-1' }) };

const request = (body?: unknown, method = 'PATCH') =>
  new NextRequest('http://localhost/api/addresses/addr-1', {
    method,
    ...(body === undefined
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

describe('PATCH /api/addresses/[addressId]', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await PATCH(request({ city: 'Paris' }), context);

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await PATCH(request('{nope'), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an empty update', async () => {
    const response = await PATCH(request({}), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid field value', async () => {
    const response = await PATCH(request({ city: '' }), context);

    expect(response.status).toBe(400);
  });

  it('applies the change', async () => {
    const response = await PATCH(request({ city: 'Paris', isDefault: true }), context);

    expect(mocks.update).toHaveBeenCalledWith({
      city: 'Paris',
      isDefault: true,
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});

describe('DELETE /api/addresses/[addressId]', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await DELETE(request(undefined, 'DELETE'), context);

    expect(response.status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('removes the address', async () => {
    const response = await DELETE(request(undefined, 'DELETE'), context);

    expect(mocks.remove).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
