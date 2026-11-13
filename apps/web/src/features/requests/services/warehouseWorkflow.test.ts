import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  startStorageTimer: vi.fn(),
  updateShipmentStatus: vi.fn(),
}));

vi.mock('@/features/requests/services/warehouse', () => ({
  startStorageTimer: mocks.startStorageTimer,
}));
vi.mock('@/features/requests/services/shipments', () => ({
  updateShipmentStatus: mocks.updateShipmentStatus,
}));

import {
  applyWarehouseChecklistSideEffects,
  warehouseShippingPreference,
} from './warehouseWorkflow';
import type { Request } from '@/types/request';

const request = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'req-1', ...overrides }) as unknown as Request;

beforeEach(() => {
  mocks.startStorageTimer.mockReset().mockResolvedValue(undefined);
  mocks.updateShipmentStatus.mockReset().mockResolvedValue(undefined);
});

describe('warehouseShippingPreference', () => {
  it('defaults to approval when nothing is selected', () => {
    expect(warehouseShippingPreference(request())).toBe('approval');
  });

  it('returns the stored preference', () => {
    expect(
      warehouseShippingPreference(request({ serviceSelections: { shippingPreference: 'auto' } }))
    ).toBe('auto');
    expect(
      warehouseShippingPreference(request({ serviceSelections: { shippingPreference: 'hold' } }))
    ).toBe('hold');
  });
});

describe('applyWarehouseChecklistSideEffects', () => {
  it('ignores keys that trigger no side effect', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'photosUploaded', true, false);
    await applyWarehouseChecklistSideEffects(request(), 'measured', true, false);

    expect(mocks.updateShipmentStatus).not.toHaveBeenCalled();
    expect(mocks.startStorageTimer).not.toHaveBeenCalled();
  });

  it('marks the shipment received when the package arrives', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'packageReceived', true, false);

    expect(mocks.updateShipmentStatus).toHaveBeenCalledWith('req-1', 'warehouse_received');
  });

  it('does nothing when a box is unchecked', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'packageReceived', false, true);
    await applyWarehouseChecklistSideEffects(request(), 'readyForShipment', false, true);
    await applyWarehouseChecklistSideEffects(request(), 'inspectionCompleted', false, true);

    expect(mocks.updateShipmentStatus).not.toHaveBeenCalled();
    expect(mocks.startStorageTimer).not.toHaveBeenCalled();
  });

  it('starts the storage timer after inspection when shipping needs approval', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'inspectionCompleted', true, false);

    expect(mocks.startStorageTimer).toHaveBeenCalledWith('req-1');
    expect(mocks.updateShipmentStatus).not.toHaveBeenCalled();
  });

  it('skips the storage timer for automatic shipping', async () => {
    await applyWarehouseChecklistSideEffects(
      request({ serviceSelections: { shippingPreference: 'auto' } }),
      'inspectionCompleted',
      true,
      false
    );

    expect(mocks.startStorageTimer).not.toHaveBeenCalled();
  });

  it('marks the shipment ready when packing is confirmed', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'readyForShipment', true, false);

    expect(mocks.updateShipmentStatus).toHaveBeenCalledWith(
      'req-1',
      'ready_for_international_shipping'
    );
  });

  it('treats an already-ticked box as no change', async () => {
    await applyWarehouseChecklistSideEffects(request(), 'readyForShipment', true, true);

    expect(mocks.updateShipmentStatus).not.toHaveBeenCalled();
  });
});
