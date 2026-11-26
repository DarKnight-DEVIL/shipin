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
import { test, expect, type Page } from "@playwright/test";

/** Prerendered routes that need no session. */
const PUBLIC_ROUTES = ["/", "/login", "/track"];

/**
 * Routes under the `(platform)` layout. They render signed-out too — the layout
 * has no redirect, it just resolves to an empty state — so they must hydrate.
 * This is the group where a runtime crash on mount is invisible to an HTTP
 * check: the HTML is prerendered and returns 200 while the error boundary eats
 * the page.
 */
const PLATFORM_ROUTES = [
  "/addresses",
  "/notifications",
  "/requests",
  "/requests/new",
  "/settings",
  "/support",
  "/wallet",
];

/**
 * Routes the build renders ON DEMAND, so they carry a per-request CSP nonce and no
 * `'unsafe-inline'` (see `src/lib/cspNonce.ts`). They are a separate group because
 * they fail differently from the prerendered ones: a nonce policy is only
 * satisfiable when every inline script is either stamped by Next or covered by a
 * build hash, and the one script Next does not stamp is next-themes' pre-paint
 * toolbox - if its hash goes missing, the page still loads and only the theme
 * flashes, which nothing else here would catch.
 *
 * The ids do not need to exist: both pages are client shells, so the markup and the
 * inline scripts are the same for any id. What matters is the policy attached to
 * the response.
 */
const DYNAMIC_ROUTES = ["/track/SHIPIN-CSP-PROBE", "/requests/csp-probe"];

const CSP_VIOLATION_PATTERNS = [
  /violates the following Content Security Policy/i,
  /Refused to execute inline script/i,
  /Refused to load the script/i,
  /Refused to apply inline style/i,
];

/** Collects CSP refusals reported to the console during a test. */
function watchForCspViolations(page: Page): string[] {
  const violations: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
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
    const hydratedNodes = [...document.querySelectorAll("*")].filter((node) =>
      Object.keys(node).some((key) => key.startsWith("__reactFiber$"))
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
  await page.route("**/*", (routeRequest) => {
    if (routeRequest.request().url().includes("_rsc="))
      return routeRequest.abort();
    return routeRequest.continue();
  });

  page.on("pageerror", (error) =>
    pageErrors.push(error.message.split("\n")[0])
  );
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Vercel Analytics/Speed Insights 404 outside Vercel; ignore those.
    if (/_vercel\/(insights|speed-insights)/.test(text)) return;
    if (text.includes("Failed to load resource")) return;
    // Two console errors only the local environment can produce:
    //
    //   requestStorageAccess  headless Chromium's storage partitioning refuses
    //                         the call; no real user reaches this code path.
    //   AppCheck 403          the reCAPTCHA Enterprise key does not allow
    //                         localhost, so no token can be minted here. This is
    //                         named rather than ignored because the same line in
    //                         a deployment means App Check is rejecting every
    //                         browser request - see OPERATIONS.md.
    if (text.includes("requestStorageAccess: Permission denied")) return;
    if (/\[app-check\].*AppCheck: 403/.test(text)) return;
    // Same cause, different wording: minting a token fails locally with
    // appCheck/recaptcha-error because the Enterprise key does not allow localhost.
    if (/\[app-check\].*appCheck\/recaptcha-error/.test(text)) return;
    consoleErrors.push(text.split("\n")[0]);
  });

  const response = await page.goto(route, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const state = await hydrationState(page);

  expect(
    state.nextFlight,
    `${route}: Next's inline bootstrap never ran — the CSP is blocking it`
  ).toBe("object");

  expect(
    state.hydratedNodes,
    `${route}: no DOM node has a React fiber, so the page is static HTML`
  ).toBeGreaterThan(0);

  expect(
    violations,
    `${route}: Content-Security-Policy blocked a request`
  ).toEqual([]);
  expect(pageErrors, `${route}: uncaught error during hydration`).toEqual([]);
  expect(consoleErrors, `${route}: console errors after hydration`).toEqual([]);
  expect(
    bodyText,
    `${route}: the error boundary replaced the page`
  ).not.toContain("Something went wrong");

  return {
    ...state,
    // Returned so a caller can assert WHICH policy it measured. A test that only
    // checks "no violations" passes just as happily against a page whose policy
    // never applied, which is how a nonce silently stops being delivered.
    csp: response?.headers()["content-security-policy"] ?? "",
  };
}

test.describe("Production hydration", () => {
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

  for (const route of DYNAMIC_ROUTES) {
    test(`${route} serves the nonce policy and runs every inline script`, async ({
      page,
    }) => {
      const state = await expectHydrated(page, route);

      const scriptSrc = state.csp.match(/script-src [^;]+/)?.[0] ?? "";

      expect(
        scriptSrc,
        `${route}: no script-src in the served policy`
      ).not.toBe("");

      // If this fails, the route stopped being rendered on demand (or the proxy
      // stopped recognising it) and the rest of this test would be asserting
      // nothing: a prerendered page hydrates fine under `'unsafe-inline'`.
      expect(
        scriptSrc,
        `${route}: expected a nonce policy, so this route is no longer dynamic`
      ).toContain("'nonce-");

      expect(
        scriptSrc,
        `${route}: 'unsafe-inline' is still allowed, so the nonce buys nothing`
      ).not.toContain("'unsafe-inline'");

      // Every inline script Next does not stamp must be allowed by a hash. A
      // missing hash is logged as "Refused to execute inline script", which
      // expectHydrated already fails on - assert the allowance is present too, so
      // a hash that silently stops being generated is visible as its own failure.
      expect(
        scriptSrc,
        `${route}: no 'sha256-' allowance for the theme bootstrap`
      ).toContain("'sha256-");

      // The theme bootstrap sets the class before paint. Checked explicitly
      // because a blocked copy leaves the page working but repaints it.
      const themeClass = await page.evaluate(
        () => document.documentElement.className
      );
      expect(
        themeClass,
        `${route}: the theme bootstrap did not run, so the page repaints`
      ).toMatch(/\b(light|dark)\b/);
    });
  }

  // The other half of the contract: a prerendered page must NOT get a nonce. Next
  // writes its bootstrap into the HTML at build time, so a nonce attached here
  // would block it and leave the page unhydrated - the exact regression this spec
  // was written for.
  test("/ stays on the nonce-free policy and still hydrates", async ({
    page,
  }) => {
    const state = await expectHydrated(page, "/");

    const scriptSrc = state.csp.match(/script-src [^;]+/)?.[0] ?? "";

    expect(
      scriptSrc,
      "/: a prerendered page was given a nonce policy"
    ).not.toContain("'nonce-");
    expect(
      scriptSrc,
      "/: a prerendered page needs 'unsafe-inline' to hydrate"
    ).toContain("'unsafe-inline'");
  });

  // Policy only for the admin dashboard: signed out it renders the dashboard's HTML
  // and then the guard navigates to /login, so a hydration assertion here would be
  // measuring the login page. The header is still the dashboard's own policy, and
  // the dashboard is the page most likely to be confused for a dynamic route.
  test("/admin/dashboard is served the nonce-free policy", async ({ page }) => {
    const response = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
    });

    const csp = response?.headers()["content-security-policy"] ?? "";
    const scriptSrc = csp.match(/script-src [^;]+/)?.[0] ?? "";

    expect(scriptSrc, "/admin/dashboard: no script-src in the policy").not.toBe(
      ""
    );
    expect(
      scriptSrc,
      "/admin/dashboard: a prerendered page was given a nonce policy"
    ).not.toContain("'nonce-");
    expect(
      scriptSrc,
      "/admin/dashboard: a prerendered page needs 'unsafe-inline' to hydrate"
    ).toContain("'unsafe-inline'");
  });

  // Guards the third-party allowlists in the policy. The PayPal SDK frames from
  // www.paypal.com live and www.sandbox.paypal.com in sandbox mode; when the
  // sandbox host was missing, the buttons silently never rendered.
  test("/wallet/topup loads the PayPal SDK without CSP refusals", async ({
    page,
  }) => {
    const violations = watchForCspViolations(page);

    await page.goto("/wallet/topup", { waitUntil: "domcontentloaded" });

    // The SDK's script URL is built from NEXT_PUBLIC_PAYPAL_CLIENT_ID at render
    // time. Detect it from the PAGE, not from this process's environment: the
    // app may have been built with .env.local or with a CI secret, and the test
    // process sees neither. No script means no id is configured, so there is
    // nothing to assert about the policy — skip instead of failing.
    const sdkScript = page.locator('script[src*="paypal.com/sdk/js"]');
    const requested = await sdkScript
      .first()
      // Generous on purpose: the provider injects the tag after hydration, and
      // under a full-suite run that step is slower than `-g PayPal` alone.
      .waitFor({ state: "attached", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !requested,
      "NEXT_PUBLIC_PAYPAL_CLIENT_ID is not configured, so the page never requests the PayPal SDK."
    );

    // A script tag the policy blocked would still exist in the DOM, so also
    // require the SDK to have executed.
    await page.waitForFunction(
      () => typeof (window as { paypal?: unknown }).paypal !== "undefined",
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
  test("/dashboard hydrates and its data hook settles", async ({ page }) => {
    const violations = watchForCspViolations(page);
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      // "Failed to load resource" carries its URL only in `location()`, so the
      // Vercel rule below can't match on text alone. Appending it also makes a
      // real 404 name the resource.
      if (message.type() === "error") {
        consoleErrors.push(`${message.text()} ${message.location().url}`);
      }
    });

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("No requests yet")).toBeVisible({
      timeout: 20_000,
    });
    expect(
      page.url(),
      "dashboard should not redirect a signed-out visitor"
    ).toContain("/dashboard");

    const state = await hydrationState(page);

    expect(state.nextFlight, "dashboard: inline bootstrap never ran").toBe(
      "object"
    );
    expect(
      state.hydratedNodes,
      "dashboard: no React fibers, so the route never hydrated"
    ).toBeGreaterThan(0);

    expect(
      violations,
      "dashboard: Content-Security-Policy blocked scripts"
    ).toEqual([]);

    // Vercel Analytics/Speed Insights scripts 404 outside Vercel; ignore those.
    const unexpected = consoleErrors.filter(
      (entry) => !/_vercel\/(insights|speed-insights)/.test(entry)
    );
    expect(unexpected, "dashboard logged console errors").toEqual([]);
  });

  test("landing page routes client-side, not by full page load", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => (window as { __next_f?: unknown }).__next_f !== undefined
    );

    // A full document load would clear this; a client-side route change keeps it.
    await page.evaluate(() => {
      (window as { __shipinHydrationProbe?: string }).__shipinHydrationProbe =
        "kept";
    });

    await page.getByRole("link", { name: "Sign in" }).first().click();
    // 20s, not the 5s default: the dev server compiles `/login` on the first
    // request for it, which under a parallel full-suite run outlasts 5s. The
    // probe below is what proves the navigation was client-side, so a longer
    // wait does not weaken this test.
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

    const survived = await page.evaluate(
      () =>
        (window as { __shipinHydrationProbe?: string })
          .__shipinHydrationProbe === "kept"
    );

    expect(
      survived,
      "link click did a full reload — the app is not hydrated"
    ).toBe(true);
  });
});
