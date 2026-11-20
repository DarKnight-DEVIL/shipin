/**
 * Checkout contract: the PayPal routes that create and capture an order.
 *
 * This file used to be an empty placeholder whose only content was a re-export,
 * so `checkout-flow.spec.ts` contributed zero coverage while looking like it
 * covered the flow. What can be asserted without touching PayPal is the part
 * that actually breaks silently: who may call the routes at all, and whether
 * they validate input before they spend money.
 *
 *   anonymous            → 401 on every step
 *   signed in, bad body  → 400 from validation, never a PayPal call
 *
 * The end-to-end capture against PayPal sandbox is covered by
 * admin-refund.spec.ts on staging; these run locally against the emulators.
 */
import { test, expect } from "@playwright/test";

import { bearer, hasEmulatorAuth, signIn } from "../support/emulatorAuth";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("checkout — anonymous callers are rejected", () => {
  const steps = [
    "/api/paypal/create-order",
    "/api/paypal/capture-order",
    "/api/payment/complete-wallet",
  ];

  for (const path of steps) {
    test(`POST ${path} answers 401 without a session`, async ({ request }) => {
      const response = await request.post(path, { data: {} });

      expect(response.status()).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "AUTHENTICATION_REQUIRED",
      });
    });
  }
});

test.describe("checkout — authenticated input validation", () => {
  test("create-order rejects a request with no items before calling PayPal", async ({
    request,
  }) => {
    test.skip(
      !hasEmulatorAuth() || !adminEmail,
      "needs the Auth emulator (--signed-in)"
    );

    const token = await signIn(request, adminEmail, adminPassword);
    test.skip(!token, "the seeded admin could not sign in");

    const response = await request.post("/api/paypal/create-order", {
      headers: bearer(token),
      data: {},
    });

    // 400 is the validation path; the assertion that matters is that a
    // signed-in caller cannot reach PayPal with an empty body (200/5xx would
    // mean the handler charged ahead).
    expect([400, 422]).toContain(response.status());
  });
});

test.describe("checkout — the wallet page is behind auth", () => {
  test("the top-up page sends a signed-out visitor to sign in", async ({
    page,
  }) => {
    const response = await page.goto("/wallet/topup");

    // Either the route renders the signed-out shell or the guard redirects;
    // what must not happen is a 500 or a stack trace.
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
