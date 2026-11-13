import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__SERVER_TS__' },
}));
vi.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mocks.get, update: mocks.update }) }),
  },
}));

import { saveShipmentDetails, updateShipmentStatus } from './shipments';

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ exists: true, data: () => ({}) });
  mocks.update.mockReset().mockResolvedValue(undefined);
});

describe('saveShipmentDetails', () => {
  const createdAt = new Date('2026-04-01T00:00:00Z');

  it('writes the tracking block', async () => {
    await saveShipmentDetails('req-1', {
      internalTrackingId: 'SHP-2026-000001',
      carrier: 'DHL',
      trackingNumber: 'ABC123',
      estimatedDelivery: new Date('2026-04-10T00:00:00Z'),
      trackingUrl: 'https://dhl.example/track',
      createdAt,
    });

    expect(mocks.update).toHaveBeenCalledWith({
      tracking: {
        internalTrackingId: 'SHP-2026-000001',
        carrier: 'DHL',
        trackingNumber: 'ABC123',
        estimatedDelivery: new Date('2026-04-10T00:00:00Z'),
        trackingUrl: 'https://dhl.example/track',
        createdAt,
      },
      updatedAt: '__SERVER_TS__',
    });
  });

  it('defaults the optional fields', async () => {
    await saveShipmentDetails('req-1', {
      internalTrackingId: 'SHP-2026-000002',
      carrier: 'UPS',
      trackingNumber: 'XYZ',
      createdAt,
    });

    expect(mocks.update.mock.calls[0][0].tracking).toMatchObject({
      estimatedDelivery: null,
      trackingUrl: '',
    });
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(
      saveShipmentDetails('req-1', {
        internalTrackingId: 'x',
        carrier: 'y',
        trackingNumber: 'z',
        createdAt,
      })
    ).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('updateShipmentStatus', () => {
  it('records the status and its history entry', async () => {
    await updateShipmentStatus('req-1', 'in_transit');

    expect(mocks.update).toHaveBeenCalledWith({
      status: 'in_transit',
      'statusHistory.in_transit': '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('rejects a missing request', async () => {
    mocks.get.mockResolvedValue({ exists: false });

    await expect(updateShipmentStatus('req-1', 'shipped')).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
