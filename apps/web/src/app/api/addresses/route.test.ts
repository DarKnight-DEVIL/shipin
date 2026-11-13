import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithProfile: vi.fn(),
  add: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuthWithProfile: mocks.requireAuthWithProfile }));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ collection: vi.fn(() => ({ add: mocks.add })) })),
    })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));

import { POST } from './route';

const valid = {
  recipientName: 'Ada Lovelace',
  phone: '+44 20 7946 0000',
  country: 'United Kingdom',
  state: 'Greater London',
  city: 'London',
  postalCode: 'SW1A 1AA',
  addressLine1: '1 Main Street',
};

const request = (body: unknown) =>
  new NextRequest('http://localhost/api/addresses', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({ profile: { uid: 'user-1' } });
  mocks.add.mockReset().mockResolvedValue({ id: 'addr-1' });
});

describe('POST /api/addresses', () => {
  it('rejects unauthenticated callers', async () => {
    mocks.requireAuthWithProfile.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await POST(request(valid));

    expect(response.status).toBe(401);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('rejects an unreadable body', async () => {
    const response = await POST(request('{nope'));

    expect(response.status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('requires the mandatory address fields', async () => {
    const response = await POST(request({ ...valid, city: '' }));

    expect(response.status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('stores the address with defaults and timestamps', async () => {
    const response = await POST(request(valid));

    expect(mocks.add).toHaveBeenCalledWith({
      ...valid,
      label: '',
      isDefault: false,
      createdAt: '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, addressId: 'addr-1' });
  });

  it('keeps an explicit label and default flag', async () => {
    await POST(request({ ...valid, label: 'Home', isDefault: true }));

    expect(mocks.add.mock.calls[0][0]).toMatchObject({ label: 'Home', isDefault: true });
  });
});
