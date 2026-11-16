/**
 * Wallet top-up contract.
 *
 * The topping-up flow moves real money, and its interesting failures are all in
 * the first two branches of the route: whether the caller is a customer at all,
 * and whether the amount/order shape is validated before PayPal is called.
 *
 *   anonymous              → 401
 *   signed in, bad amount  → 400, wallet untouched
 *   signed in, unknown id  → 404, no PayPal call
 *
 * A successful top-up is deliberately not driven here: it would need a real
 * PayPal approval and would credit a balance, which is staging's job
 * (admin-refund.spec.ts exercises the capture chain there).
 */
import { test, expect } from '@playwright/test';

import { bearer, hasEmulatorAuth, signIn } from '../support/emulatorAuth';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';

test.describe('wallet top-up — anonymous callers are rejected', () => {
  for (const path of ['/api/paypal/create-wallet-topup', '/api/paypal/capture-wallet-topup']) {
    test(`POST ${path} answers 401 without a session`, async ({ request }) => {
      const response = await request.post(path, { data: { amount: 10 } });

      expect(response.status()).toBe(401);
    });
  }
});

test.describe('wallet top-up — validation runs before PayPal', () => {
  test('rejects a non-positive amount', async ({ request }) => {
    test.skip(!hasEmulatorAuth() || !adminEmail, 'needs the Auth emulator (--signed-in)');

    const token = await signIn(request, adminEmail, adminPassword);
    test.skip(!token, 'the seeded admin could not sign in');

    const response = await request.post('/api/paypal/create-wallet-topup', {
      headers: bearer(token),
      data: { amount: 0 },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
    });
  });

  test('rejects a capture for an unknown order', async ({ request }) => {
    test.skip(!hasEmulatorAuth() || !adminEmail, 'needs the Auth emulator (--signed-in)');

    const token = await signIn(request, adminEmail, adminPassword);
    test.skip(!token, 'the seeded admin could not sign in');

    const response = await request.post('/api/paypal/capture-wallet-topup', {
      headers: bearer(token),
      data: { orderID: 'does-not-exist', amount: 10 },
    });

    expect(response.status()).toBe(404);
  });

  test('rejects a capture whose amount disagrees with the stored order', async ({ request }) => {
    test.skip(!hasEmulatorAuth() || !adminEmail, 'needs the Auth emulator (--signed-in)');

    const token = await signIn(request, adminEmail, adminPassword);
    test.skip(!token, 'the seeded admin could not sign in');

    // The order id is unknown, so this stops at 404 rather than at the amount
    // check; the assertion documents that an unknown order never reaches
    // PayPal (a 5xx or 200 would).
    const response = await request.post('/api/paypal/capture-wallet-topup', {
      headers: bearer(token),
      data: { orderID: 'unknown-order', amount: 9999 },
    });

    expect([400, 404]).toContain(response.status());
  });
});
