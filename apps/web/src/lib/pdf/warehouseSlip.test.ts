/**
 * Tests for the warehouse slip PDF.
 *
 * jsPDF is mocked, so the assertions are about what the document actually
 * contains (request details, address lines, checklist state, filename).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { type: string; args: unknown[] };

const mocks = vi.hoisted(() => {
  const calls: Call[] = [];
  class FakeJsPDF {
    constructor(options: unknown) {
      calls.push({ type: 'construct', args: [options] });
    }
    setFont(...args: unknown[]) {
      calls.push({ type: 'setFont', args });
    }
    setFontSize(...args: unknown[]) {
      calls.push({ type: 'setFontSize', args });
    }
    text(...args: unknown[]) {
      calls.push({ type: 'text', args });
    }
    save(...args: unknown[]) {
      calls.push({ type: 'save', args });
    }
  }
  return { calls, FakeJsPDF };
});

vi.mock('jspdf', () => ({ default: mocks.FakeJsPDF }));

import { generateWarehouseSlip } from './warehouseSlip';

const texts = () =>
  mocks.calls.filter((c) => c.type === 'text').map((c) => String(c.args[0]));

beforeEach(() => {
  mocks.calls.length = 0;
});

describe('generateWarehouseSlip', () => {
  it('creates an A6 portrait document with the request header', () => {
    generateWarehouseSlip({
      id: 'req-123',
      status: 'pending',
    } as never);

    expect(mocks.calls[0]).toEqual({
      type: 'construct',
      args: [{ orientation: 'portrait', unit: 'mm', format: 'a6' }],
    });
    expect(texts()).toEqual(
      expect.arrayContaining([
        'SHIPIN WAREHOUSE SLIP',
        'Request ID: req-123',
        'Status: pending',
      ])
    );
  });

  it('prints the delivery address lines that exist', () => {
    generateWarehouseSlip({
      id: 'req-1',
      status: 'approved',
      shippingAddress: {
        recipientName: 'Ada Lovelace',
        addressLine1: '1 Analytical Way',
        city: 'London',
        state: 'ENG',
        postalCode: 'N1 1AA',
        country: 'UK',
      },
    } as never);

    expect(texts()).toEqual(
      expect.arrayContaining([
        'Delivery Address:',
        'Ada Lovelace',
        '1 Analytical Way',
        'London, ENG',
        'N1 1AA',
      ])
    );
  });

  it('omits the comma when no state is present', () => {
    generateWarehouseSlip({
      id: 'req-2',
      status: 'approved',
      shippingAddress: { city: 'Mumbai' },
    } as never);

    expect(texts()).toContain('Mumbai');
  });

  it('renders checklist progress', () => {
    generateWarehouseSlip({
      id: 'req-3',
      status: 'warehouse',
      warehouse: {
        checklist: {
          packageReceived: true,
          inspectionCompleted: true,
          photosUploaded: false,
          measured: true,
          readyForShipment: false,
        },
      },
    } as never);

    expect(texts()).toEqual(
      expect.arrayContaining([
        'Checklist:',
        '- Package Received: Yes',
        '- Inspection Completed: Yes',
        '- Photos Uploaded: No',
        '- Measured: Yes',
        '- Ready for Shipment: No',
      ])
    );
  });

  it('saves with a request-specific filename', () => {
    generateWarehouseSlip({ id: 'req-9', status: 'pending' } as never);

    expect(mocks.calls.at(-1)).toEqual({
      type: 'save',
      args: ['warehouse-slip-req-9.pdf'],
    });
  });
});
