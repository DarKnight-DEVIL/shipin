/**
 * E2E tests for authenticated user journeys.
 *
 * These tests require a logged-in user context.
 * They test the complete flow: login → create shipment → pay → track
 *
 * Usage:
 *   npx playwright test playwright-test/tests/auth-flow.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("Authenticated user journeys", () => {
  test.beforeEach(async ({ page }) => {
    // In CI, you would set up a test user via API or mock auth
    // For now, we navigate to login and verify the flow structure
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();
  });

  test("login page loads and shows authentication options", async ({
    page,
  }) => {
    // One locator, one expectation. `toContainText([...])` needs one element per
    // string, so an array of acceptable labels can never match a single <h1> —
    // it failed against a page whose heading read exactly "Sign in".
    await expect(page.locator("h1").first()).toContainText(/sign in/i);

    // Check for email/password fields or Google sign-in button
    const hasEmailInput = await page
      .locator('input[type="email"], input[name="email"]')
      .count();
    const hasGoogleButton = await page
      .locator(
        'button:has-text("Google"), button:has-text("Continue with Google")'
      )
      .count();

    expect(hasEmailInput + hasGoogleButton).toBeGreaterThan(0);
  });

  test("the signed-out dashboard renders without customer data", async ({
    page,
  }) => {
    // The platform shell is prerendered and renders signed out on purpose;
    // `smoke.spec.ts` pins the same rule. Data is the real boundary — every
    // customer API rejects an anonymous request — so this test previously
    // asserted a /login redirect the app never performed.
    await page.goto("/dashboard");

    await expect(page.getByText("No requests yet")).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });

  test("tracking page is accessible without auth", async ({ page }) => {
    await page.goto("/track");

    const url = page.url();
    expect(url.startsWith("http://localhost:3000/track")).toBe(true);

    // Should have tracking input
    const trackingInput = page.locator(
      'input[name="trackingId"], input[type="search"], [placeholder*="tracking" i]'
    );
    await expect(trackingInput.first()).toBeAttached();
  });

  test("public API endpoints respond gracefully", async ({ request }) => {
    const res = await request.get("/api/tracking/nonexistent-tracking-id");
    expect([200, 404]).toContain(res.status());
  });
});

test.describe("Support flow (requires auth)", () => {
  test("support page asks a signed-out visitor to sign in", async ({
    page,
  }) => {
    // Same rule as the dashboard: no redirect, an in-page sign-in prompt, and
    // no ticket data (the support APIs are token-protected).
    await page.goto("/support");

    // The page shows a skeleton until `onAuthStateChanged` fires, which is
    // immediate against the real SDK but competes with the dev server's
    // on-demand route compiles when the whole suite runs in parallel.
    await expect(page.getByText("Sign in to open support")).toBeVisible({
      timeout: 45_000,
    });
    expect(new URL(page.url()).pathname).toBe("/support");
  });
});
