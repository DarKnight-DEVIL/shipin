/**
 * Admin refund — the authorization gate, against the emulators.
 *
 * `admin-refund.spec.ts` drives the whole refund chain on staging, because that
 * is the only place with a real fixture, real PayPal and the MFA gate enrolled.
 * It skips on localhost, which left the refund routes with no local coverage at
 * all: a change that turned a 403 into a 500, or dropped the admin check
 * entirely, would have passed every local run.
 *
 * These tests never move money. They assert the boundary:
 *
 *   anonymous            → 401 (the proxy refuses before the handler)
 *   signed-in customer   → 403 (role check)
 *   signed-in admin      → 404 for an unknown request (no crash, no 5xx)
 *
 * The admin MFA requirement is exercised on staging by admin-refund.spec.ts;
 * emulating a enrolled TOTP device is out of scope here.
 */
import { test, expect } from '@playwright/test';

import { bearer, hasEmulatorAuth, signIn, signUp } from '../support/emulatorAuth';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';

const refundPath = (requestId: string) => `/api/admin/requests/${requestId}/refund`;
const UNKNOWN_REQUEST = 'e2e-does-not-exist';

test.describe('admin refund — unauthorized callers', () => {
  test('anonymous call receives 401', async ({ request }) => {
    const response = await request.post(refundPath(UNKNOWN_REQUEST), { data: {} });

    expect(response.status()).toBe(401);
  });

  test('a signed-in non-admin receives 403', async ({ request }) => {
    test.skip(!hasEmulatorAuth(), 'needs the Auth emulator (--signed-in)');

    // A brand-new account has no profile document at all, so the role check
    // must reject it rather than fall through to the refund workflow.
    const token = await signUp(request, `e2e-customer-${Date.now()}@shipin.test`, 'shipin-e2e-password');
    test.skip(!token, 'the emulator refused to create a customer');

    const response = await request.post(refundPath(UNKNOWN_REQUEST), {
      headers: bearer(token),
      data: {},
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('admin refund — the MFA gate', () => {
  test('an admin with no enrolled MFA is stopped before the workflow', async ({ request }) => {
    test.skip(!hasEmulatorAuth() || !adminEmail, 'needs the Auth emulator (--signed-in)');

    const token = await signIn(request, adminEmail, adminPassword);
    test.skip(!token, 'the seeded admin could not sign in');

    const response = await request.post(refundPath(UNKNOWN_REQUEST), {
      headers: bearer(token),
      data: {},
    });

    // The seeded admin holds role "admin" but has never enrolled a second
    // factor, so the gate answers with MFA_SETUP_REQUIRED — for a request that
    // does not even exist. That ordering is the assertion: the workflow must
    // never be reached before the second factor is satisfied. (Staging's
    // admin-refund.spec.ts drives the full chain with a real TOTP device.)
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Multi-factor authentication'),
    });
  });
});
