import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  VERIFICATION_VERSION_FIELD,
  parseVerificationToken,
  verificationSecret,
  verificationTokenMatches,
  verificationVersion,
} from "@/lib/emailVerificationTokens";
import { emailVerificationTokenBodySchema, readAndValidateBody } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/auth/verify-email-link
 *
 * Redeems the permanent verification link from the email.
 *
 * POST rather than GET, and called by the page with the token from its query string,
 * for two reasons: mail clients and security scanners fetch links to preview them, and
 * a GET would spend a single-use link before the customer ever clicked it; and the
 * browser then gets a JSON answer it can render honestly instead of a redirect chain.
 *
 * Deliberately anonymous (see `src/config/routeAuth.ts`): the caller is by definition
 * unverified, and `requireAuth` rejects unverified accounts - the same reason
 * `/api/auth/resend-verification` verifies its own token.
 *
 * Nothing here expires. The signature covers the uid, the address and a version, so a
 * link keeps working until it is used; redeeming bumps the version, which retires that
 * link and every earlier one.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const parsed = await readAndValidateBody(
    request,
    emailVerificationTokenBodySchema
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "That verification link is not valid.",
        code: "INVALID_TOKEN",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const secret = verificationSecret();

  if (!secret) {
    // Worth naming rather than answering 400: with no secret this deployment cannot
    // have issued such a link, so the operator has a configuration problem.
    return NextResponse.json(
      {
        success: false,
        error: "Email verification links are not configured on this deployment.",
        code: "LINK_SIGNING_NOT_CONFIGURED",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const token = parseVerificationToken(parsed.data.token);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: "That verification link is not valid.",
        code: "INVALID_TOKEN",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  let user;
  try {
    user = await adminAuth.getUser(token.uid);
  } catch (error) {
    const code = (error as { code?: string })?.code;

    if (code === "auth/user-not-found") {
      return NextResponse.json(
        {
          success: false,
          error: "That account no longer exists.",
          code: "USER_NOT_FOUND",
        },
        { status: 404, headers: NO_STORE }
      );
    }

    throw error;
  }

  const profileRef = adminDb.collection("users").doc(token.uid);
  const profile = await profileRef.get();
  const version = verificationVersion(profile.get(VERIFICATION_VERSION_FIELD));

  /*
   * The address is signed, so a link issued for an old address fails here rather than
   * verifying a new one on the strength of mail sent to somebody else.
   */
  const matches = verificationTokenMatches(
    { uid: token.uid, email: user.email ?? "", version, secret },
    token.signature
  );

  if (!matches) {
    return NextResponse.json(
      {
        success: false,
        // One message for "wrong", "spent" and "superseded": distinguishing them
        // would tell an attacker which guess was closer, and none of the three is
        // actionable by the customer. A fresh link is the fix for all three.
        error:
          "This verification link has already been used or is no longer valid. Ask for a new one.",
        code: "INVALID_OR_USED_TOKEN",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  if (user.emailVerified) {
    // Clicking the same link twice is not an error worth a red screen.
    await profileRef.set(
      { emailVerified: true, [VERIFICATION_VERSION_FIELD]: version + 1 },
      { merge: true }
    );

    return NextResponse.json(
      { success: true, alreadyVerified: true, uid: token.uid },
      { status: 200, headers: NO_STORE }
    );
  }

  await adminAuth.updateUser(token.uid, { emailVerified: true });

  /*
   * Bumped only after the Auth update succeeded. If it ran first and the update failed,
   * the customer would be left unverified with a dead link and no way to tell why.
   * Both writes are idempotent, so a rare double redemption sets the same flag twice.
   */
  await profileRef.set(
    {
      emailVerified: true,
      [VERIFICATION_VERSION_FIELD]: version + 1,
      emailVerifiedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.warn(`[auth] email verified through a link for ${token.uid}`);

  return NextResponse.json(
    {
      success: true,
      alreadyVerified: false,
      uid: token.uid,
      // The customer's cached token keeps the old claim until it refreshes.
      tokenRefreshRequired: true,
    },
    { status: 200, headers: NO_STORE }
  );
});
