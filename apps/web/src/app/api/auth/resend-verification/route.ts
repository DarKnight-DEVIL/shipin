import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendMail } from "@/lib/mailer";
import { escapeHtml } from "@/lib/emailTemplates";
import { serverEnv } from "@/config/env";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Seconds between accepted resends for one account.
 *
 * Firebase's own verification mail is limited to roughly one a minute, and a support
 * inbox flooded by a double click is worse than a 429 the UI already knows how to
 * render (`resendVerificationErrorMessage`).
 */
export const RESEND_COOLDOWN_SECONDS = 60;

const COOLDOWN_FIELD = "verificationEmailSentAt";

/**
 * POST /api/auth/resend-verification
 *
 * Sends the verification email again for the signed-in account.
 *
 * This deliberately does NOT use `requireAuth`. That guard rejects
 * `email_verified !== true` on every authenticated route, which is the whole reason
 * the caller is here: routing this through it would refuse the one request an
 * unverified user is allowed to make.
 *
 * The token is still verified properly - this endpoint trusts an identity, not a
 * claim - and an address that is already verified answers 409 instead of quietly
 * sending mail nobody needs.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication token.",
        code: "INVALID_AUTHENTICATION",
      },
      { status: 401, headers: NO_STORE }
    );
  }

  if (decoded.email_verified === true) {
    return NextResponse.json(
      {
        success: false,
        error: "This email address is already verified.",
        code: "ALREADY_VERIFIED",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  const email = decoded.email;

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: "This account has no email address to verify.",
        code: "NO_EMAIL_ADDRESS",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const profileRef = adminDb.collection("users").doc(decoded.uid);
  const profile = await profileRef.get();

  const lastSent = profile.exists
    ? profile.get(COOLDOWN_FIELD)
    : undefined;
  const lastSentMs =
    lastSent instanceof Timestamp ? lastSent.toMillis() : undefined;

  if (lastSentMs !== undefined) {
    const elapsedSeconds = (Date.now() - lastSentMs) / 1000;

    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);

      return NextResponse.json(
        {
          success: false,
          error: `Wait ${retryAfter}s before requesting another email.`,
          code: "RESEND_TOO_SOON",
          retryAfter,
        },
        {
          status: 429,
          headers: { ...NO_STORE, "Retry-After": String(retryAfter) },
        }
      );
    }
  }

  /*
   * Firebase mints the link; we send it. Sending through the app's own mailer keeps
   * the message consistent with every other email and removes the dependency on
   * Firebase's mailer for the one message a stuck user needs.
   */
  const appUrl = serverEnv.APP_URL?.replace(/\/+$/, "");

  // Firebase requires an absolute http(s) continue URL on ActionCodeSettings;
  // passing a relative one fails the whole call. Undefined lets it use its own
  // default handler, which is better than a broken link.
  const actionCodeSettings =
    appUrl && /^https?:\/\//i.test(appUrl)
      ? { url: `${appUrl}/verify-email` }
      : undefined;

  const link = await adminAuth.generateEmailVerificationLink(
    email,
    actionCodeSettings
  );

  const safeLink = escapeHtml(link);

  await sendMail({
    to: email,
    subject: "Verify your ShipIN email address",
    text: `Confirm your email address to finish setting up your ShipIN account:\n\n${link}\n\nIf you did not create a ShipIN account, ignore this message.`,
    html: `<p>Confirm your email address to finish setting up your ShipIN account.</p>
<p><a href="${safeLink}">Verify my email address</a></p>
<p>If the link does not work, paste this into your browser:<br>${safeLink}</p>
<p>If you did not create a ShipIN account, ignore this message.</p>`,
  });

  // Recorded after the send: a failed send must not start the cooldown, or the user
  // would be locked out of retrying by the very failure they are trying to escape.
  await profileRef.set(
    { [COOLDOWN_FIELD]: Timestamp.now() },
    { merge: true }
  );

  return NextResponse.json(
    { success: true, sentTo: email, cooldownSeconds: RESEND_COOLDOWN_SECONDS },
    { status: 200, headers: NO_STORE }
  );
});
