/**
 * Tests for the international shipping label.
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
    line(...args: unknown[]) {
      calls.push({ type: 'line', args });
    }
    save(...args: unknown[]) {
      calls.push({ type: 'save', args });
    }
  }
  return { calls, FakeJsPDF };
});

vi.mock('jspdf', () => ({ default: mocks.FakeJsPDF }));

import { generateShippingLabel } from './shippingLabel';

const texts = () =>
  mocks.calls.filter((c) => c.type === 'text').map((c) => String(c.args[0]));

const fullAddress = {
  recipientName: 'Ada Lovelace',
  addressLine1: '1 Analytical Way',
  addressLine2: 'Flat 2',
  city: 'London',
  state: 'ENG',
  postalCode: 'N1 1AA',
  country: 'United Kingdom',
  phone: '+44 20 7946 0000',
};

beforeEach(() => {
  mocks.calls.length = 0;
});

describe('generateShippingLabel', () => {
  it('refuses to generate without a delivery address', () => {
    expect(generateShippingLabel({ id: 'req-1' } as never)).toBe(false);
    expect(mocks.calls.some((c) => c.type === 'save')).toBe(false);
  });

  it('prints the full destination block', () => {
    expect(
      generateShippingLabel({
        id: 'abcdef123456',
        shippingAddress: fullAddress,
        tracking: { internalTrackingId: 'SHP-77', carrier: 'DHL' },
      } as never)
    ).toBe(true);

    expect(texts()).toEqual(
      expect.arrayContaining([
        'ShipIN',
        'INTERNATIONAL SHIPPING LABEL',
        'SHIP TO',
        'Ada Lovelace',
        '1 Analytical Way',
        'Flat 2',
        'London, ENG',
        'N1 1AA',
        'United Kingdom',
        'Phone: +44 20 7946 0000',
        'SHP-77',
        'Request: #ABCDEF12',
        'Carrier: DHL',
        'ShipIN Package Forwarding',
      ])
    );
    expect(mocks.calls.at(-1)).toEqual({
      type: 'save',
      args: ['shipping-label-SHP-77.pdf'],
    });
  });

  it('falls back to placeholder values for a sparse address', () => {
    generateShippingLabel({
      id: 'req-2',
      shippingAddress: { addressLine1: 'Somewhere', city: 'Mumbai' },
    } as never);

    expect(texts()).toEqual(
      expect.arrayContaining(['Customer', 'Mumbai', 'NOT ASSIGNED'])
    );
    expect(texts().join(' ')).not.toContain('Phone:');
    expect(texts().join(' ')).not.toContain('Carrier:');
    expect(mocks.calls.at(-1)).toEqual({
      type: 'save',
      args: ['shipping-label-req-2.pdf'],
    });
  });

  it('never prints the external carrier tracking number', () => {
    generateShippingLabel({
      id: 'req-3',
      shippingAddress: fullAddress,
      tracking: {
        internalTrackingId: 'SHP-1',
        carrier: 'DHL',
        trackingNumber: 'EXTERNAL-SECRET-999',
      },
    } as never);

    expect(texts().join(' ')).not.toContain('EXTERNAL-SECRET-999');
  });
});
