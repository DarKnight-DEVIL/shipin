/**
 * The email-verification override, end to end against the real endpoint.
 *
 * Why not through the admin page: `/admin/users` sits behind `AdminMfaGate`, and
 * minting an elevated session calls `/api/auth/mfa/session`, which runs its own App
 * Check gate. An emulator cannot mint a reCAPTCHA Enterprise token, so the gate
 * answers 401 "App verification failed" no matter what the seeded admin has enrolled.
 * The refund spec avoids the same wall the same way - it talks to the endpoints.
 *
 * So this drives what the browser would: sign in through the Auth emulator REST API
 * to get a real ID token, call the override, then read Firestore back to prove the
 * audit entry exists. The page itself is covered by `page.test.tsx` (badge, disabled
 * confirm, already-verified handling).
 *
 * Local emulators only: it verifies a real account, and on staging that account would
 * belong to somebody.
 */
import { test, expect } from "@playwright/test";
import { generateSync } from "otplib";

const env = process.env;

const baseUrl = (env.BASE_URL ?? "").replace(/\/+$/, "");
const apiKey = env.E2E_FIREBASE_API_KEY ?? "";
const firestoreEmulator = (env.FIRESTORE_EMULATOR_HOST ?? "").replace(
  /^https?:\/\//,
  ""
);
/*
 * A dedicated admin with a second factor enrolled. `requireAdmin` answers 403 for an
 * administrator with none ("Multi-factor authentication is required for administrator
 * accounts"), and the other specs rely on the plain seeded admin NOT having one - so
 * mixing the two accounts up breaks either suite. admin-refund.spec.ts uses the same
 * one for the same reason.
 */
const adminEmail = env.E2E_REFUND_ADMIN_EMAIL || env.E2E_ADMIN_EMAIL || "";
const adminPassword =
  env.E2E_REFUND_ADMIN_PASSWORD || env.E2E_ADMIN_PASSWORD || "";
const totpSecret = env.E2E_ADMIN_TOTP_SECRET ?? "";
const unverifiedEmail = env.E2E_UNVERIFIED_EMAIL ?? "";
const projectId = env.FIREBASE_ADMIN_PROJECT_ID ?? "shipin-e2e";

const missing = [
  !baseUrl && "BASE_URL",
  !apiKey && "E2E_FIREBASE_API_KEY",
  !firestoreEmulator && "FIRESTORE_EMULATOR_HOST",
  !adminEmail && "E2E_REFUND_ADMIN_EMAIL",
  !adminPassword && "E2E_REFUND_ADMIN_PASSWORD",
  !totpSecret && "E2E_ADMIN_TOTP_SECRET",
  !unverifiedEmail && "E2E_UNVERIFIED_EMAIL",
].filter(Boolean) as string[];

/** Codes are single-use in time, so each request mints its own. */
function mfaHeaders(): Record<string, string> {
  return { "X-MFA-TOTP": generateSync({ secret: totpSecret }) };
}

/** Sign in through the Auth emulator the way the browser does, and return the token. */
async function adminIdToken(): Promise<string> {
  const response = await fetch(
    `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`auth emulator refused the admin: ${response.status}`);
  }

  const body = (await response.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("auth emulator returned no idToken");

  return body.idToken;
}

/** The uid of the seeded unverified fixture, read from the emulator's Firestore. */
async function unverifiedUid(): Promise<string> {
  /*
   * Read from Auth by signing in rather than querying Firestore: the Auth emulator
   * returns `localId` even while the address is unverified, and it does not depend on
   * the shape of a Firestore REST response (the first version of this helper assumed
   * an array and crashed on the object the emulator returned).
   */
  const response = await fetch(
    `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: unverifiedEmail,
        password: adminPassword,
        returnSecureToken: true,
      }),
    }
  );

  const body = (await response.json()) as { localId?: string };
  if (!body.localId) {
    throw new Error(
      `auth emulator returned no localId for ${unverifiedEmail}: ${JSON.stringify(body)}`
    );
  }

  return body.localId;
}

test.describe("Email verification override", () => {
  test.skip(missing.length > 0, `override spec needs: ${missing.join(", ")}`);
  test.skip(
    !baseUrl.startsWith("http://localhost"),
    "this spec verifies a real account, so it only runs against the emulators"
  );

  test.setTimeout(90_000);

  test("an admin verifies an address with a reason, and the audit records it", async ({
    request,
  }) => {
    const token = await adminIdToken();
    const uid = await unverifiedUid();

    // Without a reason the endpoint must refuse: the audit trail is the only
    // thing that makes this bypass reviewable.
    const noReason = await request.post(
      `${baseUrl}/api/admin/users/${uid}/verify-email`,
      { headers: { authorization: `Bearer ${token}`, ...mfaHeaders() }, data: {} }
    );
    expect(noReason.status()).toBe(400);

    const reason = "e2e: customer lost mailbox access";
    const response = await request.post(
      `${baseUrl}/api/admin/users/${uid}/verify-email`,
      {
        headers: { authorization: `Bearer ${token}`, ...mfaHeaders() },
        data: { reason },
      }
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      uid,
      // Named because the customer's cached token still carries the old claim.
      tokenRefreshRequired: true,
    });

    /*
     * Auth's state is proved by the repeat call at the end: the handler answers 409
     * ALREADY_VERIFIED only because `getUser().emailVerified` is now true. A separate
     * Auth REST lookup said the same thing in a shape that differed from the
     * emulator's, so it added a dependency without adding evidence.
     */

    // The audit entry names the target and the reason.
    const audit = await request.post(
      `http://${firestoreEmulator}/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
      {
        // The emulator evaluates the repository's firestore.rules on REST reads, and
        // adminAuditLog is deliberately not client-readable. `Bearer owner` is the
        // emulator's own admin bypass - the same view the Admin SDK has.
        headers: { authorization: "Bearer owner" },
        data: {
          structuredQuery: {
            from: [{ collectionId: "adminAuditLog" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "action" },
                op: "EQUAL",
                value: { stringValue: "user.email.verify_override" },
              },
            },
          },
        },
      }
    );

    const auditBody = await audit.json();
    // The emulator answers with an object when it rejects the query, and `rows.find`
    // on that produced "rows.find is not a function" instead of the real error.
    expect(Array.isArray(auditBody), JSON.stringify(auditBody)).toBe(true);

    const rows = auditBody as Array<{
      document?: {
        fields?: {
          targetId?: { stringValue?: string };
          detail?: {
            mapValue?: { fields?: { reason?: { stringValue?: string } } };
          };
        };
      };
    }>;

    const entries = rows
      .map((row) => row.document?.fields)
      .filter(Boolean) as NonNullable<(typeof rows)[number]["document"]>["fields"][];

    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.map((fields) => ({
        targetId: fields?.targetId?.stringValue,
        reason: fields?.detail?.mapValue?.fields?.reason?.stringValue,
      }))
    ).toContainEqual({ targetId: uid, reason });

    // A second call is a no-op with an error, not a silent success.
    const repeat = await request.post(
      `${baseUrl}/api/admin/users/${uid}/verify-email`,
      {
        headers: { authorization: `Bearer ${token}`, ...mfaHeaders() },
        data: { reason },
      }
    );
    expect(repeat.status()).toBe(409);
    expect(await repeat.json()).toMatchObject({ code: "ALREADY_VERIFIED" });
  });
});
