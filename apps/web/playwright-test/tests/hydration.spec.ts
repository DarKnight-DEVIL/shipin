/**
 * Hydration contract test.
 *
 * Catches a class of breakage that page-level smoke tests cannot see: the HTML
 * is served correctly and every assertion about visible text passes, but the
 * JavaScript bundle never runs. That is exactly what happened once already —
 * the production CSP used a per-request nonce with `'strict-dynamic'` while
 * every page was statically prerendered, so no script tag ever carried the
 * nonce. The browser refused Next's inline bootstrap and every chunk; pages
 * rendered and never hydrated, and nothing failed until someone opened a
 * browser by hand.
 *
 * What is asserted per route:
 *   1. `window.__next_f` exists — Next's inline flight-data bootstrap executed.
 *   2. React attached to the DOM (`__reactFiber$` on nodes) — hydration ran.
 *   3. No Content-Security-Policy refusals were logged.
 *   4. A link click navigates client-side — the router, and therefore the
 *      hydrated app, is live. A full document load would drop the probe.
 *
 * Run against a production build:
 *   BASE_URL=http://localhost:3000 PLAYWRIGHT_WEBSERVER_COMMAND="npm start" \
 *     npx playwright test playwright-test/tests/hydration.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

/** Prerendered routes that need no session. */
const PUBLIC_ROUTES = ['/', '/login', '/track'];

/**
 * Routes under the `(platform)` layout. They render signed-out too — the layout
 * has no redirect, it just resolves to an empty state — so they must hydrate.
 * This is the group where a runtime crash on mount is invisible to an HTTP
 * check: the HTML is prerendered and returns 200 while the error boundary eats
 * the page.
 */
const PLATFORM_ROUTES = [
  '/addresses',
  '/notifications',
  '/requests',
  '/requests/new',
  '/settings',
  '/support',
  '/wallet',
];

const CSP_VIOLATION_PATTERNS = [
  /violates the following Content Security Policy/i,
  /Refused to execute inline script/i,
  /Refused to load the script/i,
  /Refused to apply inline style/i,
];

/** Collects CSP refusals reported to the console during a test. */
function watchForCspViolations(page: Page): string[] {
  const violations: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (CSP_VIOLATION_PATTERNS.some((pattern) => pattern.test(text))) {
      violations.push(text);
    }
  });

  return violations;
}

/** Reads the same hydration signals a human would check by hand. */
async function hydrationState(page: Page) {
  return page.evaluate(() => {
    const hydratedNodes = [...document.querySelectorAll('*')].filter((node) =>
      Object.keys(node).some((key) => key.startsWith('__reactFiber$'))
    ).length;

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nextFlight: typeof (window as any).__next_f,
      hydratedNodes,
    };
  });
}

/**
 * Asserts a route hydrated cleanly: the bootstrap ran, React attached, no CSP
 * refusal was logged, no uncaught error escaped, and the error boundary did not
 * replace the page.
 */
async function expectHydrated(page: Page, route: string) {
  const violations = watchForCspViolations(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  // Next prefetches every link in view after hydration. Each prefetch is a
  // document request through the proxy, and the web rate limiter allows 100 per
  // minute per IP — a dozen routes in one run would trip it, and the resulting
  // 429 would look like a hydration bug. Prefetch is irrelevant to this test.
  await page.route('**/*', (routeRequest) => {
    if (routeRequest.request().url().includes('_rsc=')) return routeRequest.abort();
    return routeRequest.continue();
  });

  page.on('pageerror', (error) => pageErrors.push(error.message.split('\n')[0]));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Vercel Analytics/Speed Insights 404 outside Vercel; ignore those.
    if (/_vercel\/(insights|speed-insights)/.test(text)) return;
    if (text.includes('Failed to load resource')) return;
    consoleErrors.push(text.split('\n')[0]);
  });

  await page.goto(route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const state = await hydrationState(page);

  expect(
    state.nextFlight,
    `${route}: Next's inline bootstrap never ran — the CSP is blocking it`
  ).toBe('object');

  expect(
    state.hydratedNodes,
    `${route}: no DOM node has a React fiber, so the page is static HTML`
  ).toBeGreaterThan(0);

  expect(violations, `${route}: Content-Security-Policy blocked a request`).toEqual([]);
  expect(pageErrors, `${route}: uncaught error during hydration`).toEqual([]);
  expect(consoleErrors, `${route}: console errors after hydration`).toEqual([]);
  expect(
    bodyText,
    `${route}: the error boundary replaced the page`
  ).not.toContain('Something went wrong');

  return state;
}

test.describe('Production hydration', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} hydrates without CSP violations`, async ({ page }) => {
      await expectHydrated(page, route);
    });
  }

  for (const route of PLATFORM_ROUTES) {
    test(`${route} hydrates signed out`, async ({ page }) => {
      await expectHydrated(page, route);
    });
  }

  // Guards the third-party allowlists in the policy. The PayPal SDK frames from
  // www.paypal.com live and www.sandbox.paypal.com in sandbox mode; when the
  // sandbox host was missing, the buttons silently never rendered.
  test('/wallet/topup loads the PayPal SDK without CSP refusals', async ({ page }) => {
    const violations = watchForCspViolations(page);

    await page.goto('/wallet/topup', { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => typeof (window as { paypal?: unknown }).paypal !== 'undefined',
      undefined,
      { timeout: 20_000 }
    );

    expect(violations).toEqual([]);
  });

  // The authenticated routes are prerendered too, and they are where the
  // Firestore-backed data hooks live. With no session they still hydrate: the
  // data hook settles into its signed-out empty state. That transition is the
  // proof — the page is prerendered in its loading skeleton, so the only thing
  // that can replace the skeleton with "No requests yet" is the dashboard's own
  // JavaScript calling `auth.onAuthStateChanged`.
  test('/dashboard hydrates and its data hook settles', async ({ page }) => {
    const violations = watchForCspViolations(page);
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('No requests yet')).toBeVisible({ timeout: 20_000 });
    expect(page.url(), 'dashboard should not redirect a signed-out visitor').toContain(
      '/dashboard'
    );

    const state = await hydrationState(page);

    expect(state.nextFlight, 'dashboard: inline bootstrap never ran').toBe('object');
    expect(
      state.hydratedNodes,
      'dashboard: no React fibers, so the route never hydrated'
    ).toBeGreaterThan(0);

    expect(violations, 'dashboard: Content-Security-Policy blocked scripts').toEqual([]);

    // Vercel Analytics/Speed Insights scripts 404 outside Vercel; ignore those.
    const unexpected = consoleErrors.filter(
      (text) => !/_vercel\/(insights|speed-insights)/.test(text)
    );
    expect(unexpected, 'dashboard logged console errors').toEqual([]);
  });

  test('landing page routes client-side, not by full page load', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (window as { __next_f?: unknown }).__next_f !== undefined);

    // A full document load would clear this; a client-side route change keeps it.
    await page.evaluate(() => {
      (window as { __shipinHydrationProbe?: string }).__shipinHydrationProbe = 'kept';
    });

    await page.getByRole('link', { name: 'Sign in' }).first().click();
    await expect(page).toHaveURL(/\/login/);

    const survived = await page.evaluate(
      () => (window as { __shipinHydrationProbe?: string }).__shipinHydrationProbe === 'kept'
    );

    expect(survived, 'link click did a full reload — the app is not hydrated').toBe(true);
  });
});
