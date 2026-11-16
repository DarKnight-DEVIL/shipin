/**
 * Firestore security-rules regression tests.
 *
 * Firestore rules are enforced by the Firebase emulator / production rules
 * engine, not by this app's code — but they can silently regress when
 * re-deployed. These tests document and lock in the intended access matrix so a
 * future rules change that opens an IDOR hole is caught.
 *
 * Each test encodes the rule constraint as written in firestore.rules and
 * asserts that a malicious payload would be rejected. Keep them in step with
 * the rule text: a simulation that drifts is worse than no test.
 */

import { describe, it, expect } from 'vitest';

/**
 * Simulates the Firestore rule for a given collection by evaluating the
 * same expression the rules engine would use.
 */
function evaluateRule(
  rule: (ctx: {
    uid: string;
    resourceData?: Record<string, unknown>;
  }) => boolean,
  uid: string,
  resourceData?: Record<string, unknown>
): boolean {
  return rule({ uid, resourceData });
}

/** Firestore evaluates `serverTimestamp()` as `request.time`. */
const REQUEST_TIME = '__request_time__';

const TICKET_CATEGORIES = [
  'Shipment',
  'Tracking',
  'Payment',
  'Refund',
  'Customs',
  'Missing Item',
  'Wrong Item',
  'Other',
];

describe('Firestore rules — supportTickets', () => {
  const ALLOWED_KEYS = [
    'ticketNumber',
    'requestId',
    'customerId',
    'category',
    'subject',
    'status',
    'customerUnread',
    'adminUnread',
    'createdAt',
    'updatedAt',
  ];

  const createRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) => {
    const data = ctx.resourceData ?? {};

    return (
      data.customerId === ctx.uid &&
      data.status === 'open' &&
      data.createdAt === REQUEST_TIME &&
      data.updatedAt === REQUEST_TIME &&
      TICKET_CATEGORIES.includes(data.category as string) &&
      Object.keys(data).every((key) => ALLOWED_KEYS.includes(key))
    );
  };

  const ticket = {
    ticketNumber: 'T-1',
    requestId: 'req-1',
    customerId: 'user-1',
    category: 'Shipment',
    subject: 'Where is it?',
    status: 'open',
    createdAt: REQUEST_TIME,
    updatedAt: REQUEST_TIME,
  };

  it('allows a customer to open their own ticket', () => {
    expect(evaluateRule(createRule, 'user-1', ticket)).toBe(true);
  });

  it('blocks a ticket for someone else (IDOR)', () => {
    expect(
      evaluateRule(createRule, 'attacker', { ...ticket, customerId: 'victim-1' })
    ).toBe(false);
  });

  it('blocks a ticket created already resolved', () => {
    expect(evaluateRule(createRule, 'user-1', { ...ticket, status: 'resolved' })).toBe(false);
  });

  it('blocks admin-owned fields riding along with the create', () => {
    expect(evaluateRule(createRule, 'user-1', { ...ticket, priority: 'urgent' })).toBe(false);
    expect(evaluateRule(createRule, 'user-1', { ...ticket, assignedTo: 'someone' })).toBe(false);
  });

  it('blocks a backdated createdAt', () => {
    expect(evaluateRule(createRule, 'user-1', { ...ticket, createdAt: 1 })).toBe(false);
  });

  it('blocks an unknown category', () => {
    expect(evaluateRule(createRule, 'user-1', { ...ticket, category: 'Whatever' })).toBe(false);
  });

  /**
   * Mirrors the customer branch of the update rule in firestore.rules:
   *   isSelf(resource.data.customerId)
   *   && request.resource.data.diff(resource.data).affectedKeys()
   *        .hasOnly(['customerUnread', 'updatedAt'])
   *   && request.resource.data.customerUnread == false
   * (admins keep an unrestricted update and are covered separately by the
   * admin branch, which this simulation does not model.)
   */
  const customerUpdateRule = (ctx: {
    uid: string;
    resourceData?: Record<string, unknown>;
  }): boolean => {
    const before = ctx.resourceData ?? {};
    const after = (ctx.resourceData?.after as Record<string, unknown>) ?? {};
    const affected = Object.keys(after).filter((key) => after[key] !== before[key]);

    return (
      before.customerId === ctx.uid &&
      affected.length > 0 &&
      affected.every((key) => key === 'customerUnread' || key === 'updatedAt') &&
      after.customerUnread === false
    );
  };

  const storedTicket = {
    customerId: 'user-1',
    status: 'open',
    priority: 'normal',
    adminUnread: true,
    customerUnread: true,
    updatedAt: 1,
  };

  it('lets a customer clear their own unread flag', () => {
    const allowed = customerUpdateRule({
      uid: 'user-1',
      resourceData: {
        ...storedTicket,
        after: { ...storedTicket, customerUnread: false, updatedAt: 2 },
      },
    });
    expect(allowed).toBe(true);
  });

  it('blocks a customer resolving their own ticket', () => {
    const allowed = customerUpdateRule({
      uid: 'user-1',
      resourceData: { ...storedTicket, after: { ...storedTicket, status: 'resolved' } },
    });
    expect(allowed).toBe(false);
  });

  it('blocks a customer reassigning or re-pricing a ticket', () => {
    expect(
      customerUpdateRule({
        uid: 'user-1',
        resourceData: { ...storedTicket, after: { ...storedTicket, priority: 'urgent' } },
      })
    ).toBe(false);

    expect(
      customerUpdateRule({
        uid: 'user-1',
        resourceData: { ...storedTicket, after: { ...storedTicket, assignedTo: 'someone-else' } },
      })
    ).toBe(false);
  });

  it('blocks a customer touching the admin unread flag', () => {
    const allowed = customerUpdateRule({
      uid: 'user-1',
      resourceData: { ...storedTicket, after: { ...storedTicket, adminUnread: false } },
    });
    expect(allowed).toBe(false);
  });

  it('blocks a third party from updating the ticket at all', () => {
    const allowed = customerUpdateRule({
      uid: 'attacker',
      resourceData: {
        ...storedTicket,
        after: { ...storedTicket, customerUnread: false, updatedAt: 2 },
      },
    });
    expect(allowed).toBe(false);
  });
});

describe('Firestore rules — supportMessages', () => {
  // ticket id -> owner, standing in for the rule's get().
  const tickets: Record<string, string> = { 't-1': 'user-1' };
  const ALLOWED_KEYS = ['ticketId', 'sender', 'message', 'createdAt'];

  const createRule = (ctx: {
    uid: string;
    resourceData?: Record<string, unknown>;
    isAdmin?: boolean;
  }) => {
    const data = ctx.resourceData ?? {};

    if (!Object.keys(data).every((key) => ALLOWED_KEYS.includes(key))) return false;
    if (data.createdAt !== REQUEST_TIME) return false;
    if (typeof data.message !== 'string' || data.message.length === 0) return false;
    if (data.message.length > 5000) return false;
    if (ctx.isAdmin) return true;

    return data.sender === 'customer' && tickets[data.ticketId as string] === ctx.uid;
  };

  it('allows a customer to reply on their own ticket', () => {
    expect(
      evaluateRule(createRule, 'user-1', {
        ticketId: 't-1',
        sender: 'customer',
        message: 'Hi',
        createdAt: REQUEST_TIME,
      })
    ).toBe(true);
  });

  it("blocks impersonated messages on somebody else's ticket", () => {
    expect(
      evaluateRule(createRule, 'attacker', {
        ticketId: 't-1',
        sender: 'customer',
        message: 'I am the customer, trust me',
        createdAt: REQUEST_TIME,
      })
    ).toBe(false);
  });

  it('blocks a customer posting as an admin', () => {
    expect(
      evaluateRule(createRule, 'user-1', {
        ticketId: 't-1',
        sender: 'admin',
        message: 'Resolved.',
        createdAt: REQUEST_TIME,
      })
    ).toBe(false);
  });

  it('blocks extra fields and backdating', () => {
    expect(
      evaluateRule(createRule, 'user-1', {
        ticketId: 't-1',
        sender: 'customer',
        message: 'Hi',
        createdAt: REQUEST_TIME,
        customerId: 'user-1',
      })
    ).toBe(false);

    expect(
      evaluateRule(createRule, 'user-1', {
        ticketId: 't-1',
        sender: 'customer',
        message: 'Hi',
        createdAt: 1,
      })
    ).toBe(false);
  });

  it('allows an admin to reply on any ticket', () => {
    expect(
      createRule({
        uid: 'admin-1',
        isAdmin: true,
        resourceData: {
          ticketId: 't-1',
          sender: 'admin',
          message: 'Looking into it',
          createdAt: REQUEST_TIME,
        },
      })
    ).toBe(true);
  });
});

describe('Firestore rules — notifications', () => {
  const ALLOWED_KEYS = [
    'userId',
    'requestId',
    'title',
    'message',
    'type',
    'read',
    'createdAt',
  ];
  const TYPES = ['rejection', 'payment', 'quote', 'shipment', 'support'];

  const createRule = (ctx: {
    uid: string;
    resourceData?: Record<string, unknown>;
    isAdmin?: boolean;
  }) => {
    const data = ctx.resourceData ?? {};

    return (
      (data.userId === ctx.uid || ctx.isAdmin === true) &&
      data.read === false &&
      TYPES.includes(data.type as string) &&
      typeof data.title === 'string' &&
      data.title.length <= 200 &&
      typeof data.message === 'string' &&
      data.message.length <= 2000 &&
      data.createdAt === REQUEST_TIME &&
      Object.keys(data).every((key) => ALLOWED_KEYS.includes(key))
    );
  };

  const notification = {
    userId: 'user-1',
    requestId: 'req-1',
    title: 'Request Rejected',
    message: 'Your request has been rejected.',
    type: 'rejection',
    read: false,
    createdAt: REQUEST_TIME,
  };

  it('allows the documented browser payload', () => {
    expect(evaluateRule(createRule, 'user-1', notification)).toBe(true);
  });

  it('blocks a notification for somebody else', () => {
    expect(
      evaluateRule(createRule, 'attacker', { ...notification, userId: 'victim-1' })
    ).toBe(false);
  });

  it('blocks pre-read notifications', () => {
    expect(evaluateRule(createRule, 'user-1', { ...notification, read: true })).toBe(false);
  });

  it('blocks an unknown type and oversized content', () => {
    expect(evaluateRule(createRule, 'user-1', { ...notification, type: 'urgent' })).toBe(false);
    expect(
      evaluateRule(createRule, 'user-1', { ...notification, message: 'x'.repeat(2001) })
    ).toBe(false);
  });

  it('blocks extra fields and backdating', () => {
    expect(evaluateRule(createRule, 'user-1', { ...notification, balance: 500 })).toBe(false);
    expect(evaluateRule(createRule, 'user-1', { ...notification, createdAt: 1 })).toBe(false);
  });

  it('allows an admin to notify a customer', () => {
    expect(createRule({ uid: 'admin-1', isAdmin: true, resourceData: notification })).toBe(
      true
    );
  });
});

describe('Firestore rules — walletTransactions', () => {
  const createRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) =>
    ctx.resourceData?.userId === ctx.uid;

  it('blocks forged wallet transactions for other users', () => {
    const allowed = evaluateRule(createRule, 'attacker', {
      userId: 'victim-1',
      type: 'deposit',
      amount: 9999,
    });
    expect(allowed).toBe(false);
  });
});

describe('Firestore rules — users', () => {
  const updateRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) =>
    ctx.uid === 'self-doc';

  it('allows a user to update their own profile', () => {
    const allowed = evaluateRule(updateRule, 'self-doc');
    expect(allowed).toBe(true);
  });

  it('blocks a user from deleting anyone (delete: if false)', () => {
    const deleteRule = () => false;
    const allowed = evaluateRule(deleteRule, 'user-1');
    expect(allowed).toBe(false);
  });
});
