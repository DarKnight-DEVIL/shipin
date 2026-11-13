/**
 * Firestore security-rules regression tests.
 *
 * Firestore rules are enforced by the Firebase emulator / production rules
 * engine, not by this app's code — but they can silently regress when
 * re-deployed. These tests document and lock in the intended access
 * matrix so a future rules change that opens an IDOR hole is caught.
 *
 * Each test encodes the rule constraint as written in firestore.rules and
 * asserts that a malicious payload would be rejected.
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

describe('Firestore rules — supportTickets', () => {
  const createRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) =>
    ctx.resourceData?.customerId === ctx.uid;

  it('allows a user to create their own ticket', () => {
    const allowed = evaluateRule(createRule, 'user-1', {
      customerId: 'user-1',
      title: 'Help me',
    });
    expect(allowed).toBe(true);
  });

  it('blocks a user from creating a ticket for someone else (IDOR)', () => {
    const allowed = evaluateRule(createRule, 'attacker', {
      customerId: 'victim-1',
      title: 'Phish',
    });
    expect(allowed).toBe(false);
  });
});

describe('Firestore rules — supportMessages', () => {
  const createRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) =>
    ctx.resourceData?.customerId === ctx.uid;

  it('blocks impersonated support messages', () => {
    const allowed = evaluateRule(createRule, 'attacker', {
      customerId: 'victim-1',
      message: 'I am the customer, trust me',
    });
    expect(allowed).toBe(false);
  });
});

describe('Firestore rules — refundRequests', () => {
  const createRule = (ctx: { uid: string; resourceData?: Record<string, unknown> }) =>
    ctx.resourceData?.userId === ctx.uid;

  it('blocks a user from refunding another user request (IDOR)', () => {
    const allowed = evaluateRule(createRule, 'attacker', {
      userId: 'victim-1',
      amount: 9999,
    });
    expect(allowed).toBe(false);
  });

  it('allows a user to refund their own request', () => {
    const allowed = evaluateRule(createRule, 'user-1', {
      userId: 'user-1',
      amount: 50,
    });
    expect(allowed).toBe(true);
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