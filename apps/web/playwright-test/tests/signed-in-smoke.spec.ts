/**
 * Signed-in smoke test (staging, or the local emulators).
 *
 * The hydration contract and the page smoke tests both visit the app signed
 * out: they prove every route renders and hydrates, but the prerendered HTML
 * they check is the same HTML a signed-out visitor gets. Nothing in CI ever
 * signs in through the real login page, so nothing notices when the session
 * path breaks — a profile lookup that starts throwing, a role check that sends
 * admins to the customer dashboard, a data hook that never runs with a user.
 *
 * This spec closes that gap from the outside, with no mocks:
 *
 *   1. types the staging admin's credentials into /login and submits;
 *   2. waits for the admin area — the login page only routes there after
 *      `onAuthStateChanged` fired AND `getUserProfile` returned role "admin";
 *   3. opens /dashboard and waits for a real firestore.googleapis.com request,
 *      which only happens when a session exists;
 *   4. asserts neither page tripped the error boundary.
 *
 * Read-only: it signs in and looks, it never mutates staging data. That is
 * deliberate — the destructive path is covered by admin-refund.spec.ts.
 *
 * It also runs locally against the Auth + Firestore emulators, which is what
 * `npm run test:e2e:local -- --signed-in` does: the client connects to the
 * emulators (NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST /
 * NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) and a seeded admin account is created by
 * `scripts/e2e/seed-auth-user.mjs`.
 *
 * Required environment:
 *   BASE_URL            staging origin, or localhost with the emulators
 *   E2E_ADMIN_EMAIL     admin account (staging) or the seeded emulator user
 *   E2E_ADMIN_PASSWORD  its password
 *
 * Use a dedicated staging admin. Never run this with production credentials.
 */
import { test, expect } from "@playwright/test";

import { injectAppCheckDebugToken } from "../support/appCheckDebugToken";

const env = process.env;
const baseUrl = env.BASE_URL ?? "";
const isRemoteTarget = !!baseUrl && !baseUrl.startsWith("http://localhost");
const email = env.E2E_ADMIN_EMAIL ?? "";
const password = env.E2E_ADMIN_PASSWORD ?? "";
const authEmulator = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";
const firestoreEmulator = env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "";

const missing = [
  !isRemoteTarget &&
    !authEmulator &&
    "BASE_URL (staging) or NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (local)",
  !email && "E2E_ADMIN_EMAIL",
  !password && "E2E_ADMIN_PASSWORD",
].filter(Boolean) as string[];

test.describe("Signed-in smoke", () => {
  test.skip(missing.length > 0, `signed-in smoke needs: ${missing.join(", ")}`);

  test.setTimeout(120_000);

  test("an admin signs in, the dashboard reads Firestore, and the admin area renders", async ({
    page,
  }) => {
    // A deployment that enforces App Check refuses every call from a browser
    // that cannot attest (every CI runner); the debug token, registered in
    // the Firebase console, is what lets this session through. No-op when
    // unset (local emulator runs, enforcement off).
    await injectAppCheckDebugToken(page);

    // Firestore traffic goes to the real host in staging and to the emulator
    // locally; either one proves a signed-in data path ran.
    const dataHosts = ["firestore.googleapis.com"];
    if (firestoreEmulator) dataHosts.push(firestoreEmulator);

    // The login page reports a generic "Unable to sign in"; the real cause is
    // only in the console, so carry it into the failure message.
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error")
        consoleErrors.push(message.text().split("\n")[0]);
    });

    const firestoreRequests: string[] = [];
    page.on("request", (request) => {
      if (dataHosts.some((host) => request.url().includes(host))) {
        firestoreRequests.push(request.url());
      }
    });

    await page.goto("/login");

    // /login opens on the Google button; the password form sits behind
    // "Sign in with email". Its neighbour "Create one" only flips the register
    // flag and stays on the Google view, so clicking that one leaves this test
    // waiting for fields that never render.
    const emailInput = page.locator('input[type="email"]');
    if ((await emailInput.count()) === 0) {
      await page.getByRole("button", { name: "Sign in with email" }).click();
    }
    await expect(emailInput).toBeVisible();

    await emailInput.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    try {
      await page.waitForURL(/\/admin\//, { timeout: 60_000 });
    } catch {
      // The failure is almost never an assertion here — it is the login page
      // still sitting there with an error, or an unverified account parked on
      // /verify-email. Report both instead of a bare timeout.
      const text = await page.evaluate(() => document.body.innerText);
      throw new Error(
        `sign-in never reached the admin area (url: ${page.url()}). ` +
          `If this is /verify-email, verify the account's address. ` +
          `Console: ${consoleErrors.join(" | ") || "(none)"}. ` +
          `Page text: ${text.replace(/\s+/g, " ").slice(0, 400)}`
      );
    }

    // AdminGuard resolves the profile before rendering, so the sidebar means the
    // role lookup succeeded rather than defaulting to a redirect.
    await expect(
      page.getByRole("link", { name: "Dashboard" }).first()
    ).toBeVisible({
      timeout: 30_000,
    });

    expect(
      await page.evaluate(() => document.body.innerText),
      "the admin area tripped its error boundary"
    ).not.toContain("Something went wrong");

    // The customer dashboard as a signed-in user: the only way a Firestore
    // request happens is with a live session, so this is the assertion that the
    // real data path ran.
    await page.goto("/dashboard");

    await expect
      .poll(() => firestoreRequests.length, {
        timeout: 45_000,
        message:
          "/dashboard made no Firestore request, so no signed-in data path ran",
      })
      .toBeGreaterThan(0);

    expect(page.url(), "the signed-in dashboard redirected away").toContain(
      "/dashboard"
    );

    expect(
      await page.evaluate(() => document.body.innerText),
      "the dashboard tripped its error boundary"
    ).not.toContain("Something went wrong");
  });
});
