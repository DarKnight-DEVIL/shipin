import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  createNotification: vi.fn(),
  arrayUnion: vi.fn((value: unknown) => ({ __union: value })),
  arrayRemove: vi.fn((value: unknown) => ({ __remove: value })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  query: vi.fn((ref: unknown) => ({ ref })),
  where: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  updateDoc: mocks.updateDoc,
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  arrayUnion: mocks.arrayUnion,
  arrayRemove: mocks.arrayRemove,
}));
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));
vi.mock('@/features/notifications/services', () => ({
  createNotification: mocks.createNotification,
}));

import {
  approveInternationalShipment,
  getWarehouseInventory,
  removeRequestFromWarehouse,
  saveInspectionPhoto,
  saveInspectionPhotos,
  saveInspectionPhotosAlias,
  saveWarehouseInspection,
  saveWarehouseMeasurements,
  startStorageTimer,
  updateWarehouseChecklist,
} from './warehouse';

beforeEach(() => {
  mocks.getDocs.mockReset();
  mocks.getDoc
    .mockReset()
    .mockResolvedValue({ exists: () => true, data: () => ({ userId: 'user-1' }) });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  mocks.createNotification.mockReset().mockResolvedValue('n-1');
});

describe('getWarehouseInventory', () => {
  it('maps the warehouse requests', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ id: 'r-1', data: () => ({ status: 'packed' }) }],
    });

    await expect(getWarehouseInventory()).resolves.toEqual([{ id: 'r-1', status: 'packed' }]);
  });

  it('wraps read failures', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));

    await expect(getWarehouseInventory()).rejects.toBeInstanceOf(Error);
  });
});

describe('saveWarehouseInspection', () => {
  const data = { weight: 2, length: 10, width: 5, height: 4, condition: 'good' };

  it('writes the inspection and notifies the customer', async () => {
    await saveWarehouseInspection('req-1', data);

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'requests/req-1' },
      expect.objectContaining({
        'warehouse.weight': 2,
        'warehouse.condition': 'good',
        'warehouse.inspectionCompletedAt': '__SERVER_TS__',
        updatedAt: '__SERVER_TS__',
      })
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-1',
      'req-1',
      'Inspection Complete',
      'Your warehouse inspection is now available.',
      'inspection'
    );
  });

  it('skips the notification when the request has no owner', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await saveWarehouseInspection('req-1', data);

    expect(mocks.updateDoc).toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('wraps write failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(saveWarehouseInspection('req-1', data)).rejects.toBeInstanceOf(Error);
  });
});

describe('inspection photos', () => {
  it('appends the photo with an upload timestamp', async () => {
    await saveInspectionPhoto('req-1', { id: 'p1', url: 'https://img/p1.jpg', caption: 'Front' });

    expect(mocks.arrayUnion).toHaveBeenCalledWith({
      id: 'p1',
      url: 'https://img/p1.jpg',
      caption: 'Front',
      uploadedAt: '__SERVER_TS__',
    });
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'requests/req-1' },
      expect.objectContaining({ 'warehouse.inspectionPhotos': { __union: expect.any(Object) } })
    );
  });

  it('keeps the deprecated aliases pointing at the same function', async () => {
    expect(saveInspectionPhotos).toBe(saveInspectionPhoto);

    await saveInspectionPhotosAlias('req-1', { id: 'p2', url: 'https://img/p2.jpg' });

    expect(mocks.updateDoc).toHaveBeenCalled();
  });

  it('wraps failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(saveInspectionPhoto('req-1', { id: 'p', url: 'u' })).rejects.toBeInstanceOf(Error);
  });
});

describe('warehouse status helpers', () => {
  it('approves the international shipment', async () => {
    await approveInternationalShipment('req-1');

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'requests/req-1' },
      expect.objectContaining({
        status: 'ready_for_international_shipping',
        'warehouse.approvedAt': '__SERVER_TS__',
      })
    );
  });

  it('starts the storage timer', async () => {
    await startStorageTimer('req-1');

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      storage: { dailyFine: 3, accumulatedFine: 0, active: true },
    });
  });

  it('saves measurements without condition', async () => {
    await saveWarehouseMeasurements('req-1', { weight: 1, length: 2, width: 3, height: 4 });

    const update = mocks.updateDoc.mock.calls[0][1];
    expect(update).toMatchObject({ 'warehouse.weight': 1, 'warehouse.height': 4 });
    expect(update).not.toHaveProperty('warehouse.condition');
  });

  it('removes the warehouse record', async () => {
    await removeRequestFromWarehouse('req-1');

    expect(mocks.arrayRemove).toHaveBeenCalledWith({});
    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({ warehouse: { __remove: {} } });
  });

  it('wraps failures for each helper', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(approveInternationalShipment('req-1')).rejects.toBeInstanceOf(Error);
    await expect(startStorageTimer('req-1')).rejects.toBeInstanceOf(Error);
    await expect(
      saveWarehouseMeasurements('req-1', { weight: 1, length: 2, width: 3, height: 4 })
    ).rejects.toBeInstanceOf(Error);
    await expect(removeRequestFromWarehouse('req-1')).rejects.toBeInstanceOf(Error);
  });
});

describe('updateWarehouseChecklist', () => {
  it('writes one field per checked item', async () => {
    await updateWarehouseChecklist('req-1', { measured: true, photosUploaded: false });

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'requests/req-1' },
      {
        'warehouse.checklist.measured': true,
        'warehouse.checklist.photosUploaded': false,
        updatedAt: '__SERVER_TS__',
      }
    );
  });

  it('notifies the customer when the package arrives', async () => {
    await updateWarehouseChecklist('req-1', { packageReceived: true });

    expect(mocks.createNotification).toHaveBeenCalledWith(
      'user-1',
      'req-1',
      'Package Arrived',
      'Your package has been checked into our warehouse.',
      'warehouse'
    );
  });

  it('does not notify for other checklist items', async () => {
    await updateWarehouseChecklist('req-1', { packageReceived: false, measured: true });

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('skips the notification when the owner is unknown', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });

    await updateWarehouseChecklist('req-1', { packageReceived: true });

    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('wraps failures', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('offline'));

    await expect(updateWarehouseChecklist('req-1', { measured: true })).rejects.toBeInstanceOf(
      Error
    );
  });
});
