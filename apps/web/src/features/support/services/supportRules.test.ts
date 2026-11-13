import { describe, it, expect, vi, afterEach } from 'vitest';

import { canCreateSupportTicket } from './supportRules';

type Request = Parameters<typeof canCreateSupportTicket>[0];

function request(overrides: Partial<Request>): Request {
  return { status: 'purchase', ...overrides } as Request;
}

function deliveredAt(date: Date) {
  return { toDate: () => date } as unknown as NonNullable<
    Request['statusHistory']
  >['delivered'];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('canCreateSupportTicket', () => {
  it('never allows a refunded request', () => {
    expect(canCreateSupportTicket(request({ status: 'refunded' }))).toBe(false);
  });

  it('allows requests that are not delivered yet', () => {
    for (const status of ['purchased', 'warehouse_received', 'shipped'] as const) {
      expect(canCreateSupportTicket(request({ status }))).toBe(true);
    }
  });

  it('allows a delivered request with no delivery timestamp', () => {
    expect(canCreateSupportTicket(request({ status: 'delivered' }))).toBe(true);
  });

  it('allows a delivered request inside the 72 hour window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));

    expect(
      canCreateSupportTicket(
        request({
          status: 'delivered',
          statusHistory: { delivered: deliveredAt(new Date('2026-01-09T12:00:00Z')) },
        })
      )
    ).toBe(true);
  });

  it('closes the window after 72 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-13T12:00:01Z'));

    expect(
      canCreateSupportTicket(
        request({
          status: 'delivered',
          statusHistory: { delivered: deliveredAt(new Date('2026-01-10T12:00:00Z')) },
        })
      )
    ).toBe(false);
  });
});
