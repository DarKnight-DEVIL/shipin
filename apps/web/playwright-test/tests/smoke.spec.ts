/**
 * Playwright E2E smoke tests for ShipIN.
 *
 * Runs against a live dev server (started automatically via webServer).
 *
 * Usage:
 *   npx playwright test                    # headless
 *   npx playwright test --headed           # visible browser
 *   npx playwright test --ui               # interactive UI mode
 */
import { test, expect } from '@playwright/test';

test.describe('Public pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('tracking page is accessible without auth', async ({ page }) => {
    await page.goto('/track');
    // Should not redirect — public endpoint. Compare the path, not the origin:
    // CI runs this spec against the dev server and against a deployed origin.
    expect(new URL(page.url()).pathname).toBe('/track');
  });
});

test.describe('API health', () => {
  test('public tracking endpoint responds gracefully', async ({ request }) => {
    const res = await request.get('/api/tracking/nonexistent-tracking-id');
    // Should return a valid status, never crash or 503
    expect([200, 404]).toContain(res.status());
  });
});

test.describe('Security headers', () => {
  test('X-Frame-Options is DENY on all pages', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  test('X-Content-Type-Options is nosniff', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test.describe('Auth flows', () => {
  test('the signed-out dashboard shows no customer data', async ({ page }) => {
    // The platform shell is prerendered and renders signed out on purpose (see
    // hydration.spec.ts). What must never leak is data: every customer API is
    // token-protected, so the empty state is the honest one. This previously
    // asserted a /login redirect the app never performed.
    await page.goto('/dashboard');

    await expect(page.getByText('No requests yet')).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/dashboard');
  });

  test('protected customer APIs reject an anonymous request', async ({ request }) => {
    // Data protection is the real boundary, not the shell.
    const res = await request.get('/api/requests');

    expect(res.status()).toBe(401);
  });

  test('login page renders without crashing', async ({ page }) => {
    await page.goto('/login');
    // The login form should contain at least one submit button or recognizable element
    const submitButtons = await page.locator('button[type="submit"], button:has-text("Sign"), input[type="submit"]').count();
    await expect(page.locator('body')).toBeVisible();
    const googleWidget = await page.locator('[data-testid="google-signin"], [aria-label*="Google" i], iframe[title*="Google" i]').count();
    // Login may delegate to a third-party Google widget, so accept either affordance.
    expect(submitButtons + googleWidget).toBeGreaterThan(0);
  });
});

