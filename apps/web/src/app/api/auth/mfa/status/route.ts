import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { readStoredCredentials, type WebAuthnRecord } from "@/lib/webauthn";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type MfaShape = {
  totp?: { enabled?: boolean; secret?: string; backupCodes?: string[] };
  webauthn?: WebAuthnRecord;
};

/**
 * Show only the last four digits of a phone number.
 * The full number is never sent to the browser.
 */
function maskPhoneNumber(phoneNumber: unknown): string | null {
  if (typeof phoneNumber !== "string") return null;

  const digits = phoneNumber.replace(/[^\d]/g, "");

  if (digits.length < 4) return null;

  return `••• ••• ${digits.slice(-4)}`;
}

/**
 * GET /api/auth/mfa/status
 *
 * Reports which second factors the caller has configured so the security
 * screen can render accurate state. Never returns secrets, hashes, or
 * backup codes — only booleans, a count, and a masked phone number.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);

  if (auth instanceof NextResponse) return auth;

  const snapshot = await adminDb
    .collection("users")
    .doc(auth.profile.uid)
    .get();

  if (!snapshot.exists) {
    return NextResponse.json(
      {
        success: false,
        error: "User not found.",
        code: "USER_PROFILE_NOT_FOUND",
      },
      { status: 404, headers: NO_STORE }
    );
  }

  const mfa = (snapshot.data()?.mfa ?? {}) as MfaShape;
  const totp = mfa.totp;
  const credentials = readStoredCredentials(mfa.webauthn);

  // SMS is a Firebase Identity Platform factor, not a Firestore record:
  // Google sends and verifies the code, so the enrolled phone lives on the
  // Auth user. A failed lookup must not hide the Firestore-backed factors.
  let smsPhoneNumber: string | null = null;

  try {
    const authUser = await adminAuth.getUser(auth.profile.uid);
    const phoneFactor = authUser.multiFactor?.enrolledFactors?.find(
      (factor) => factor.factorId === "phone"
    );
    smsPhoneNumber =
      (phoneFactor as { phoneNumber?: string } | undefined)?.phoneNumber ??
      null;
  } catch {
    smsPhoneNumber = null;
  }

  return NextResponse.json(
    {
      success: true,
      totp: {
        enabled: Boolean(totp?.enabled && totp?.secret),
        // A secret without `enabled` means enrollment started but the first
        // code was never confirmed.
        pending: Boolean(totp?.secret && !totp?.enabled),
      },
      sms: {
        enabled: smsPhoneNumber !== null,
        phoneNumber: maskPhoneNumber(smsPhoneNumber),
      },
      backupCodes: Array.isArray(totp?.backupCodes)
        ? totp.backupCodes.length
        : 0,
      webauthn: {
        enabled: credentials.length > 0,
        // Names and dates only; public keys stay server-side.
        credentials: credentials.map((credential) => ({
          id: credential.credentialID,
          name: credential.name,
          createdAt: credential.createdAt,
        })),
      },
    },
    { status: 200, headers: NO_STORE }
  );
});
