/**
 * Email-verification helpers shared by the login form and the verify screen.
 *
 * Two details make the difference between "verification works" and "the user
 * is stuck on the verify screen forever":
 *
 *  1. `sendEmailVerification` rejects the whole call with
 *     `auth/invalid-continue-uri` when the continue URL is relative (for
 *     example `"/verify-email"` because NEXT_PUBLIC_APP_URL is unset). No email
 *     is sent at all, so the user has nothing to click and no error worth
 *     showing.
 *  2. `reload()` refreshes the user *record*, not the ID token. The token in
 *     the client cache still carries `email_verified: false` for up to an hour,
 *     and every API route calls `requireAuth`, which rejects it with 403
 *     EMAIL_VERIFICATION_REQUIRED. The user sees "Email verified!", clicks
 *     Continue, and the dashboard is broken in exactly the way an unverified
 *     account is.
 */

import { clientEnv } from "@/config/env";

/**
 * The absolute continue URL Firebase should return the user to, if usable.
 *
 * `baseUrl` is injectable so the rules are testable without stubbing the env
 * module; callers pass nothing and it reads clientEnv.
 */
export function verificationContinueUrl(
  baseUrl: string | undefined = clientEnv.NEXT_PUBLIC_APP_URL
): string | undefined {
  // Firebase only accepts an absolute http(s) URL here. Passing anything else
  // fails the send, which is worse than the default action handler.
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return undefined;

  return `${baseUrl.replace(/\/+$/, "")}/verify-email`;
}

/**
 * Action-code settings for `sendEmailVerification`.
 *
 * Returns undefined rather than `{}` when no usable URL exists: Firebase's
 * ActionCodeSettings requires `url`, and passing an object without one is
 * rejected at runtime.
 */
export function verificationEmailOptions(
  baseUrl?: string
): { url: string } | undefined {
  const url = verificationContinueUrl(baseUrl);
  return url ? { url } : undefined;
}

/** What `/api/auth/resend-verification` means for the caller. */
export type ResendVerificationResult =
  | { status: "sent" }
  | { status: "already-verified" }
  | { status: "too-soon"; retryAfter: number; message: string }
  | { status: "failed"; message: string };

/**
 * Ask the server to send the verification email again.
 *
 * Server-side rather than the Firebase client SDK, so the message goes out through
 * the app's own mailer and the per-account cooldown is enforced where it cannot be
 * skipped. The endpoint verifies the token itself and deliberately does not apply
 * the "must be verified" guard - that guard is why the user is on this screen.
 */
export async function requestVerificationResend(
  idToken: string
): Promise<ResendVerificationResult> {
  let response: Response;

  try {
    response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}` },
    });
  } catch {
    return {
      status: "failed",
      message: "Could not reach the server. Check your connection and try again.",
    };
  }

  if (response.ok) return { status: "sent" };

  const body = (await response.json().catch(() => null)) as
    | { code?: string; error?: string; retryAfter?: number }
    | null;

  if (body?.code === "ALREADY_VERIFIED") return { status: "already-verified" };

  if (body?.code === "RESEND_TOO_SOON") {
    return {
      status: "too-soon",
      retryAfter: body.retryAfter ?? 60,
      message: body.error ?? "Wait a moment before requesting another email.",
    };
  }

  return {
    status: "failed",
    message: body?.error ?? "The verification email could not be sent.",
  };
}

export type VerifyLinkResult =
  | { status: "verified" }
  | { status: "already-verified" }
  | { status: "failed"; message: string };

/**
 * Redeem the permanent link from the email.
 *
 * POST, not the navigation itself: mail scanners and link previews fetch a URL the
 * moment it arrives, and a single-use link would then be spent before the customer
 * saw it. The page sends the token from its query string once a real browser runs.
 */
export async function verifyEmailLink(token: string): Promise<VerifyLinkResult> {
  let response: Response;

  try {
    response = await fetch("/api/auth/verify-email-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    return {
      status: "failed",
      message: "Could not reach the server. Check your connection and try again.",
    };
  }

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; alreadyVerified?: boolean; error?: string; code?: string }
    | null;

  if (response.ok && body?.success) {
    return {
      status: body.alreadyVerified ? "already-verified" : "verified",
    };
  }

  return {
    status: "failed",
    message:
      body?.error ??
      "This verification link could not be used. Ask for a new one.",
  };
}

/**
 * How long a rate-limited user must wait before resending.
 *
 * Firebase's limit is a rolling window, not a fixed lockout, so this is the
 * confirmation window rather than an exact opening time; it matches the "wait a
 * minute" the message already gives the user.
 */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * Whether a failed send was Firebase rate-limiting the user.
 *
 * Checked separately from the message because the screen does something with it
 * — it disables the button for {@link RESEND_COOLDOWN_MS} — and matching on the
 * message text to decide behaviour would break the moment the copy changes.
 */
export function isRateLimitedResend(error: unknown): boolean {
  return (
    (error as { code?: string } | null | undefined)?.code ===
    "auth/too-many-requests"
  );
}

/**
 * User-facing message for a failed `sendEmailVerification`.
 *
 * The verify screen previously reported these only to the console, so a
 * rate-limited or offline user was told nothing and simply never received mail.
 */
export function resendVerificationErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null | undefined)?.code;

  switch (code) {
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute, then try again.";
    case "auth/network-request-failed":
      return "We could not reach Firebase. Check your connection and try again.";
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      return "Your session has expired. Sign in again to resend the email.";
    case "auth/invalid-continue-uri":
    case "auth/unauthorized-continue-uri":
      // Not the user's fault: NEXT_PUBLIC_APP_URL is not a URL this Firebase
      // project accepts, so Firebase refuses to send anything at all.
      return "We could not send the verification email. Please contact support.";
    default:
      return "We could not send the verification email. Please try again.";
  }
}

/**
 * Force a token refresh so the next request carries `email_verified: true`.
 *
 * Never throws: verification has already succeeded at this point, and failing
 * to refresh must not trap the user on the verify screen.
 */
export async function refreshVerifiedToken(user: {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}): Promise<void> {
  try {
    await user.getIdToken(true);
  } catch (error) {
    console.error(
      "[auth] Could not refresh the ID token after verification:",
      error
    );
  }
}
