/**
 * Passkey MFA ceremony, end to end, with a virtual authenticator.
 *
 * The unit tests cover the relying-party rules and the route contracts, but
 * they cannot see the part that actually broke: the browser ceremony. A
 * challenge request with no body answered 500, so every admin who clicked
 * "Use security key" got an error and no prompt — with all green unit tests.
 *
 * This spec drives the real pages against the emulators:
 *
 *   1. registers a virtual authenticator over CDP (no hardware, no prompt);
 *   2. signs in through /login as the seeded admin;
 *   3. /admin/security → "Add security key" → navigator.credentials.create;
 *   4. /admin/dashboard → "Verify" → "Use security key" →
 *      navigator.credentials.get → POST /api/auth/mfa/session → elevated.
 *
 * The virtual authenticator also proves the origin the server advertises is the
 * origin the browser is on: an RP ID mismatch fails the ceremony in the browser,
 * not on the server.
 *
 * Local only. It registers a credential and elevates a session, so it never
 * runs against staging; `npm run test:e2e:local -- --signed-in` provides the
 * Auth emulator, the seeded admin and the localhost build it needs.
 */
import { test, expect } from "@playwright/test";

const env = process.env;
const baseUrl = env.BASE_URL ?? "";
const authEmulator = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "";
const email = env.E2E_ADMIN_EMAIL ?? "";
const password = env.E2E_ADMIN_PASSWORD ?? "";

const missing = [
  !baseUrl.startsWith("http://localhost") &&
    "a localhost BASE_URL (this spec mutates the account it signs in with)",
  !authEmulator && "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
  !email && "E2E_ADMIN_EMAIL",
  !password && "E2E_ADMIN_PASSWORD",
].filter(Boolean) as string[];

const KEY_NAME = "E2E virtual authenticator";

test.describe("Passkey ceremony — virtual authenticator", () => {
  test.skip(
    missing.length > 0,
    `the passkey ceremony needs: ${missing.join(", ")} ` +
      "(run `npm run test:e2e:local -- --signed-in`)"
  );

  test.setTimeout(180_000);

  test("an admin registers a passkey and elevates a session with it", async ({
    context,
    page,
    request,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error")
        consoleErrors.push(message.text().split("\n")[0]);
    });

    // An admin route that `requireAdmin` gates on MFA. It answers 403 on the
    // first dashboard load and must answer 200 once the cookie exists.
    const analyticsStatuses: number[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/admin/analytics") {
        analyticsStatuses.push(response.status());
      }
    });

    // The Permissions-Policy used to omit this feature, which made
    // navigator.credentials.get throw before the ceremony could start.
    const loginResponse = await request.get("/login");
    expect(
      loginResponse.headers()["permissions-policy"],
      "Permissions-Policy must allow the WebAuthn assertion API"
    ).toContain("publickey-credentials-get=(self)");

    // Chrome's own implementation, told to approve: same code path as a
    // hardware key or platform passkey, without a human to tap it.
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = (await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      }
    )) as { authenticatorId: string };

    await page.goto("/login");

    const emailInput = page.locator('input[type="email"]');
    if ((await emailInput.count()) === 0) {
      await page.getByRole("button", { name: "Sign in with email" }).click();
    }
    await expect(emailInput).toBeVisible();
    await emailInput.fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/admin\//, { timeout: 90_000 });

    // --- create -----------------------------------------------------------
    await page.goto("/admin/security");

    const nameInput = page.getByPlaceholder("Key name (e.g. YubiKey 5C)");
    await expect(nameInput).toBeVisible({ timeout: 90_000 });
    await nameInput.fill(KEY_NAME);
    await page.getByRole("button", { name: "Add security key" }).click();

    await expect(
      page.getByText(`${KEY_NAME} registered.`),
      `registration failed. Console: ${consoleErrors.join(" | ") || "(none)"}`
    ).toBeVisible({ timeout: 90_000 });

    const stored = (await cdp.send("WebAuthn.getCredentials", {
      authenticatorId,
    })) as { credentials: unknown[] };
    expect(
      stored.credentials.length,
      "the authenticator never held a credential, so the browser was not asked to create one"
    ).toBe(1);

    // --- get --------------------------------------------------------------
    await page.goto("/admin/dashboard");

    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.getByRole("button", { name: "Use security key" }).click();

    await expect(
      page.getByText("Elevated — Admin APIs available"),
      `elevation failed. Console: ${consoleErrors.join(" | ") || "(none)"}`
    ).toBeVisible({ timeout: 90_000 });

    // The banner is client state; the cookie is what the admin routes read.
    // No `__Host-` prefix: createSecureCookieHeader emits the name as given.
    const cookies = await context.cookies();
    expect(
      cookies.some((cookie) => cookie.name === "shipin_admin_mfa"),
      "the elevation response did not set an MFA session cookie"
    ).toBe(true);

    // The cookie has to authorize, not merely exist: the same admin request
    // that was refused before elevation must now be served. (The 403 proves
    // the endpoint is actually gated, so the 200 is not a public route.)
    await expect.poll(() => analyticsStatuses).toContain(403);
    const beforeReload = analyticsStatuses.length;
    await page.reload();
    await expect
      .poll(() => analyticsStatuses.slice(beforeReload), { timeout: 60_000 })
      .toContain(200);
  });
});
