import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn((value: unknown) => ({ __union: value })),
  arrayRemove: vi.fn((value: unknown) => ({ __remove: value })),
}));

vi.mock('firebase/firestore', () => {
  // Refs are plain objects here; `withConverter` records the converter and
  // keeps the same path so assertions on paths stay readable.
  // Non-enumerable so refs still deep-equal plain `{ path }` in assertions.
  const refWithConverter = (path: string) =>
    Object.defineProperty({ path }, 'withConverter', {
      value: vi.fn((converter: unknown) => ({ path, converter })),
      enumerable: false,
    });

  return {
  collection: vi.fn((_db: unknown, name: string) => refWithConverter(name)),
  doc: vi.fn((_db: unknown, col: string, id: string) => refWithConverter(`${col}/${id}`)),
  query: vi.fn((ref: unknown) => ({ ref })),
  where: vi.fn(() => ({})),
  addDoc: mocks.addDoc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  updateDoc: mocks.updateDoc,
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  arrayUnion: mocks.arrayUnion,
  arrayRemove: mocks.arrayRemove,
  };
});
vi.mock('@/lib/firebaseDb', () => ({ db: {} }));

import {
  addRequestToShipment,
  createShipment,
  finalizeShipment,
  getShipment,
  getShipmentRequests,
  getUserShipments,
  markShipmentDelivered,
  markShipmentShipped,
  removeRequestFromShipment,
  saveConsolidatedPackage,
} from './shipments';

const documentSnapshot = (data?: Record<string, unknown>) => ({
  id: data?.id ?? 'doc-1',
  exists: () => data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mocks.addDoc.mockReset().mockResolvedValue({ id: 'ship-1' });
  mocks.getDoc.mockReset().mockResolvedValue(documentSnapshot({}));
  mocks.getDocs.mockReset().mockResolvedValue({ docs: [] });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
});

describe('createShipment', () => {
  it('starts an empty shipment in building state', async () => {
    await expect(createShipment('user-1')).resolves.toBe('ship-1');

    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      userId: 'user-1',
      requestIds: [],
      status: 'building',
      tracking: '',
      courier: '',
      weight: 0,
      createdAt: '__SERVER_TS__',
    });
  });
});

describe('addRequestToShipment', () => {
  it('links the request both ways', async () => {
    await addRequestToShipment('ship-1', 'req-1');

    expect(mocks.updateDoc.mock.calls[0]).toEqual([
      { path: 'shipments/ship-1' },
      { requestIds: { __union: 'req-1' }, updatedAt: '__SERVER_TS__' },
    ]);
    expect(mocks.updateDoc.mock.calls[1]).toEqual([
      { path: 'requests/req-1' },
      {
        consolidation: { enabled: true, shipmentId: 'ship-1', consolidatedAt: '__SERVER_TS__' },
      },
    ]);
  });

  it('rejects an unknown shipment', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(addRequestToShipment('ship-1', 'req-1')).rejects.toThrow('Shipment not found.');
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('getShipment', () => {
  it('returns null when the shipment does not exist', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(getShipment('ship-1')).resolves.toBeNull();
  });

  it('returns the stored shipment', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot({ id: 'ship-1', status: 'building' }));

    await expect(getShipment('ship-1')).resolves.toEqual({ id: 'ship-1', status: 'building' });
  });
});

describe('getShipmentRequests', () => {
  it('returns nothing when the shipment is missing', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(getShipmentRequests('ship-1')).resolves.toEqual([]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it('returns nothing when the shipment has no requests', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot({ requestIds: [] }));

    await expect(getShipmentRequests('ship-1')).resolves.toEqual([]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it('loads the linked requests', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot({ requestIds: ['req-1', 'req-2'] }));
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ id: 'req-1' }) }],
    });

    await expect(getShipmentRequests('ship-1')).resolves.toEqual([{ id: 'req-1' }]);
  });
});

describe('getUserShipments', () => {
  it('maps the user shipments', async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ id: 'ship-1' }) }, { data: () => ({ id: 'ship-2' }) }],
    });

    await expect(getUserShipments('user-1')).resolves.toEqual([{ id: 'ship-1' }, { id: 'ship-2' }]);
  });
});

describe('shipment status updates', () => {
  it('marks a shipment shipped', async () => {
    await markShipmentShipped('ship-1');

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'shipments/ship-1' },
      { status: 'shipped', shippedAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__' }
    );
  });

  it('marks a shipment delivered', async () => {
    await markShipmentDelivered('ship-1');

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'shipments/ship-1' },
      { status: 'delivered', deliveredAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__' }
    );
  });
});

describe('removeRequestFromShipment', () => {
  it('unlinks the request both ways', async () => {
    await removeRequestFromShipment('ship-1', 'req-1');

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({ requestIds: { __remove: 'req-1' } });
    expect(mocks.updateDoc.mock.calls[1][1]).toEqual({
      consolidation: { enabled: false, shipmentId: null, consolidatedAt: null },
    });
  });
});

describe('saveConsolidatedPackage', () => {
  it('stores the package measurements', async () => {
    await saveConsolidatedPackage('ship-1', { weight: 5, length: 10, width: 8, height: 4 });

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'shipments/ship-1' },
      { weight: 5, length: 10, width: 8, height: 4, updatedAt: '__SERVER_TS__' }
    );
  });
});

describe('finalizeShipment', () => {
  const complete = {
    requestIds: ['req-1'],
    weight: 5,
    length: 10,
    width: 8,
    height: 4,
  };

  it('marks a complete shipment ready', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(complete));

    await finalizeShipment('ship-1');

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'shipments/ship-1' },
      { status: 'ready', finalizedAt: '__SERVER_TS__', updatedAt: '__SERVER_TS__' }
    );
  });

  it('rejects an unknown shipment', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(finalizeShipment('ship-1')).rejects.toThrow('Shipment not found.');
  });

  it('rejects an empty shipment', async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot({ ...complete, requestIds: [] }));

    await expect(finalizeShipment('ship-1')).rejects.toThrow(
      'Cannot finalize an empty shipment.'
    );
  });

  it('requires every measurement', async () => {
    for (const field of ['weight', 'length', 'width', 'height']) {
      mocks.getDoc.mockResolvedValue(documentSnapshot({ ...complete, [field]: 0 }));

      await expect(finalizeShipment('ship-1')).rejects.toThrow(
        'Enter the final package weight and dimensions before finalizing.'
      );
    }
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
