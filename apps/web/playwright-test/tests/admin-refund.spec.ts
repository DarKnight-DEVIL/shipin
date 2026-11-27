/**
 * End-to-end staging smoke test for an admin-initiated refund.
 *
 * Drives the same four endpoints the admin UI calls, in order:
 *
 *   POST /api/admin/requests/{id}/refund              initiate the workflow
 *   POST /api/admin/wallet/credit                     return the wallet portion
 *   POST /api/admin/requests/{id}/refund/paypal       record the PayPal portion
 *   POST /api/admin/requests/{id}/refund/complete     finalise (idempotent)
 *
 * It exists because the unit tests mock Firestore: they prove the branch logic,
 * not that a real deployment can move real money through these routes. This is
 * the only check that exercises the whole chain against a live database, the
 * admin MFA gate included.
 *
 * ---------------------------------------------------------------------------
 * THIS MUTATES DATA. Point it at staging only, with a throwaway fixture.
 * ---------------------------------------------------------------------------
 *
 * Each run consumes its fixture: once refunded, the request can never be
 * refunded again. Seed a fresh request before every run:
 *
 *   requests/{E2E_REFUND_REQUEST_ID}
 *     {
 *       userId:   "<E2E_REFUND_CUSTOMER_ID>",
 *       status:   "purchased",
 *       payment:  { amount: 100, amountPaid: 100, walletAmount: 40,
 *                   paypalAmount: 60, currency: "USD" }
 *     }
 *
 *   users/{E2E_REFUND_CUSTOMER_ID}
 *     { role: "customer", email: "..." }      // role must not be "admin"
 *
 * In CI the fixture is created just before this test runs by
 * `scripts/e2e/seed-refund-fixture.mjs`, which exports the two id variables
 * below into the job environment.
 *
 * Required environment:
 *   BASE_URL                 staging origin, or a localhost build with
 *                            E2E_ALLOW_LOCAL_REFUND_SMOKE=1
 *   E2E_REFUND_REQUEST_ID    a fresh "purchased" request id
 *   E2E_REFUND_CUSTOMER_ID   that request's userId
 *   E2E_ADMIN_TOTP_SECRET    base32 TOTP secret enrolled for the admin
 *   and either
 *     E2E_ADMIN_ID_TOKEN     a ready Firebase ID token, or
 *     E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD + E2E_FIREBASE_API_KEY
 *   E2E_REFUND_ADMIN_EMAIL + E2E_REFUND_ADMIN_PASSWORD are used instead of the
 *   two above when set (the local run seeds this account with the TOTP).
 *
 * Optional:
 *   E2E_ALLOW_LOCAL_REFUND_SMOKE=1   allow a localhost BASE_URL (dev server or
 *                                    emulator) instead of a remote staging host
 *   FIREBASE_AUTH_EMULATOR_HOST   sign in against the Auth emulator instead of
 *                                 Identity Toolkit (set by
 *                                 `npm run test:e2e:local -- --signed-in`)
 *
 * Locally the fixture, the admin and its TOTP enrolment all come from the
 * emulators (see scripts/e2e-local.mjs), so the whole chain runs in CI with no
 * service account. Against staging it needs a staging admin seed; never run it
 * with production credentials.
 */
import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { generateSync } from "otplib";

import { appCheckHeader } from "../support/appCheckDebugToken";

type RefundBody = {
  success?: boolean;
  error?: string;
  status?: string;
  alreadyCompleted?: boolean;
  refund?: { amount?: number; transactionId?: string; status?: string };
  refundRequest?: {
    status?: string;
    amount?: number;
    walletAmount?: number;
    paypalAmount?: number;
  };
  previousBalance?: number;
  creditAdded?: number;
  newBalance?: number;
};

const env = process.env;
const baseUrl = env.BASE_URL ?? "";
const isRemoteTarget = !!baseUrl && !baseUrl.startsWith("http://localhost");
// Destructive test: remote only, unless the caller opts into a local target.
const allowLocal = env.E2E_ALLOW_LOCAL_REFUND_SMOKE === "1";

const authEmulatorHost =
  env.FIREBASE_AUTH_EMULATOR_HOST ??
  env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ??
  "";

const settings = {
  requestId: env.E2E_REFUND_REQUEST_ID ?? "",
  customerId: env.E2E_REFUND_CUSTOMER_ID ?? "",
  totpSecret: env.E2E_ADMIN_TOTP_SECRET ?? "",
  idToken: env.E2E_ADMIN_ID_TOKEN ?? "",
  // A dedicated admin for the refund chain: locally it is the only seeded
  // account with a second factor enrolled, while the other specs need an admin
  // without one. Staging keeps using the single configured admin.
  email: env.E2E_REFUND_ADMIN_EMAIL || env.E2E_ADMIN_EMAIL || "",
  password: env.E2E_REFUND_ADMIN_PASSWORD || env.E2E_ADMIN_PASSWORD || "",
  firebaseApiKey: env.E2E_FIREBASE_API_KEY ?? "",
};

const canSignIn =
  settings.idToken !== "" ||
  (settings.email !== "" &&
    settings.password !== "" &&
    settings.firebaseApiKey !== "");

const missing = [
  !isRemoteTarget &&
    !allowLocal &&
    "BASE_URL (must point at staging, or set E2E_ALLOW_LOCAL_REFUND_SMOKE=1)",
  !settings.requestId && "E2E_REFUND_REQUEST_ID",
  !settings.customerId && "E2E_REFUND_CUSTOMER_ID",
  !settings.totpSecret && "E2E_ADMIN_TOTP_SECRET",
  !canSignIn &&
    "E2E_ADMIN_ID_TOKEN, or E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD + E2E_FIREBASE_API_KEY",
].filter(Boolean) as string[];

const round = (value: number) => Number(value.toFixed(2));

/** MFA codes are single-use in time, so mint a fresh one per request. */
function mfaHeaders(): Record<string, string> {
  return { "X-MFA-TOTP": generateSync({ secret: settings.totpSecret }) };
}

async function readJson(response: APIResponse): Promise<RefundBody> {
  return (await response.json()) as RefundBody;
}

/**
 * Firebase ID token for the admin: Identity Toolkit on staging, the Auth
 * emulator locally. Both answer the same identitytoolkit shape, so only the
 * host and the key differ — the emulator ignores the key's value.
 */
async function signIn(request: APIRequestContext): Promise<string> {
  if (settings.idToken) return settings.idToken;

  const url = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${settings.firebaseApiKey || "fake-api-key"}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${settings.firebaseApiKey}`;

  const response = await request.post(url, {
    data: {
      email: settings.email,
      password: settings.password,
      returnSecureToken: true,
    },
  });

  expect(
    response.ok(),
    `admin sign-in failed (HTTP ${response.status()}): ${await response.text()}`
  ).toBe(true);

  const body = (await response.json()) as { idToken?: string };
  expect(
    body.idToken,
    authEmulatorHost
      ? "the Auth emulator returned no idToken"
      : "Identity Toolkit returned no idToken"
  ).toBeTruthy();
  return body.idToken as string;
}

const adminHeaders = async (idToken: string) => ({
  Authorization: `Bearer ${idToken}`,
  // Staging enforces App Check; the request fixture has no browser to run the
  // SDK in, so the debug token is exchanged over the REST API instead. Empty
  // when no debug token is configured (local emulator runs).
  ...(await appCheckHeader()),
  ...mfaHeaders(),
});

test.describe("Admin refund (staging)", () => {
  // One request, one wallet: the steps below are only meaningful in order.
  test.describe.configure({ mode: "serial" });

  test.skip(
    missing.length > 0,
    `staging refund smoke needs: ${missing.join(", ")}`
  );

  test("refunds a purchased request through the wallet and PayPal portions", async ({
    request,
  }) => {
    const requestPath = `/api/admin/requests/${settings.requestId}`;

    const idToken = await test.step("sign in as a staging admin", () =>
      signIn(request));

    await test.step("admin endpoints reject an unauthenticated caller", async () => {
      const response = await request.post(`${requestPath}/refund`, {
        data: {},
      });
      expect(response.status()).toBe(401);
    });

    const initiated = await test.step("initiate the refund", async () => {
      const response = await request.post(`${requestPath}/refund`, {
        headers: await adminHeaders(idToken),
        data: {},
      });
      const body = await readJson(response);

      // A consumed fixture shows up here; say so instead of failing obliquely.
      expect(
        response.status(),
        `could not initiate the refund: ${body.error ?? "unknown error"}. ` +
          "If this request already has a refund workflow, seed a fresh " +
          '"purchased" request for E2E_REFUND_REQUEST_ID.'
      ).toBe(200);

      expect(body.status).toBe("refund_requested");
      expect(body.refundRequest?.status).toBe("requested");

      const walletAmount = Number(body.refundRequest?.walletAmount ?? 0);
      const paypalAmount = Number(body.refundRequest?.paypalAmount ?? 0);
      const amount = Number(body.refundRequest?.amount ?? 0);

      expect(amount).toBeGreaterThan(0);
      expect(round(walletAmount + paypalAmount)).toBe(round(amount));

      return { amount, walletAmount, paypalAmount };
    });

    if (initiated.paypalAmount > 0) {
      await test.step("the PayPal portion cannot be recorded twice over", async () => {
        const response = await request.post(`${requestPath}/refund/paypal`, {
          headers: await adminHeaders(idToken),
          data: {
            amount: round(initiated.paypalAmount + 10),
            transactionId: `SMOKE-OVER-${Date.now()}`,
          },
        });

        expect(response.status()).toBe(400);

        const body = await readJson(response);
        expect(body.success).toBe(false);
      });
    }

    if (initiated.walletAmount > 0) {
      await test.step("return the wallet portion", async () => {
        const response = await request.post("/api/admin/wallet/credit", {
          headers: await adminHeaders(idToken),
          data: {
            customerId: settings.customerId,
            amount: initiated.walletAmount,
            type: "refund",
            requestId: settings.requestId,
            description: "Staging smoke test refund",
          },
        });
        const body = await readJson(response);

        expect(
          response.status(),
          `wallet credit failed: ${body.error ?? "unknown error"}`
        ).toBe(200);

        expect(body.creditAdded).toBe(round(initiated.walletAmount));
        expect(
          round(Number(body.previousBalance) + initiated.walletAmount)
        ).toBe(body.newBalance);
      });
    }

    if (initiated.paypalAmount > 0) {
      await test.step("record the PayPal portion", async () => {
        const transactionId = `SMOKE-${Date.now()}`;
        const response = await request.post(`${requestPath}/refund/paypal`, {
          headers: await adminHeaders(idToken),
          data: { amount: initiated.paypalAmount, transactionId },
        });
        const body = await readJson(response);

        expect(
          response.status(),
          `PayPal portion failed: ${body.error ?? "unknown error"}`
        ).toBe(200);

        expect(body.refund?.transactionId).toBe(transactionId);
        // The last portion to land finalises the request by itself.
        expect(body.refund?.status).toBe("completed");
      });
    }

    await test.step("completing is a no-op once every portion is settled", async () => {
      const response = await request.post(`${requestPath}/refund/complete`, {
        headers: await adminHeaders(idToken),
      });
      const body = await readJson(response);

      expect(
        response.status(),
        `completion failed: ${body.error ?? "unknown error"}`
      ).toBe(200);

      // Only a persisted refundRequest.status === "completed" can answer this,
      // so it doubles as a read-back of what the database kept.
      expect(body.status).toBe("refunded");
      expect(body.alreadyCompleted).toBe(true);
    });

    await test.step("the workflow cannot be started again", async () => {
      const response = await request.post(`${requestPath}/refund`, {
        headers: await adminHeaders(idToken),
        data: {},
      });

      expect(response.status()).toBe(400);
      const body = await readJson(response);
      expect(body.success).toBe(false);
    });

    await test.step("a second PayPal record is refused", async () => {
      const response = await request.post(`${requestPath}/refund/paypal`, {
        headers: await adminHeaders(idToken),
        data: { amount: 1, transactionId: `SMOKE-DUP-${Date.now()}` },
      });

      expect(response.status()).toBe(400);
    });
  });
});
