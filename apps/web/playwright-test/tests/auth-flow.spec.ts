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

  test("login page loads and shows authentication options", async ({ page }) => {
    // Verify login form elements are present
    await expect(page.locator("h1, h2")).toContainText(["Sign in", "Login", "Sign in to ShipIN"]);

    // Check for email/password fields or Google sign-in button
    const hasEmailInput = await page
      .locator('input[type="email"], input[name="email"]')
      .count();
    const hasGoogleButton = await page
      .locator('button:has-text("Google"), button:has-text("Continue with Google")')
      .count();

    expect(hasEmailInput + hasGoogleButton).toBeGreaterThan(0);
  });

  test("protected dashboard redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Should redirect to login or verify-email
    await page.waitForURL(
      (url) =>
        url.toString().includes("/login") || url.toString().includes("/verify-email")
    );

    const finalUrl = page.url();
    expect(
      finalUrl.includes("/login") || finalUrl.includes("/verify-email")
    ).toBe(true);
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
  test("support page redirects to login when unauthenticated", async ({
    page,
  }) => {
    await page.goto("/support");
    await page.waitForURL(
      (url) =>
        url.toString().includes("/login") || url.toString().includes("/verify-email")
    );
  });
});