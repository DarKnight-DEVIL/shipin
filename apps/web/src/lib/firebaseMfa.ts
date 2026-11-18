/**
 * Firebase SMS second factor (Identity Platform).
 *
 * SMS is no longer a code this app stores and checks. Google sends it, verifies
 * it, and only then mints an ID token carrying `firebase.sign_in_second_factor`
 * — which is what the server trusts (`requireAdmin`, `/api/auth/mfa/session`).
 *
 * Two ceremonies live here:
 *
 *   1. Enrollment — an already signed-in admin adds a phone factor.
 *   2. Challenge — sign-in answered `auth/multi-factor-auth-required`, so the
 *      code must be completed before an ID token exists at all.
 *
 * Both are client-side by necessity: Identity Platform's web SDK owns the
 * reCAPTCHA verifier and the verification session. There is no server endpoint
 * that can send these codes.
 */

import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  getMultiFactorResolver,
  multiFactor,
  type Auth,
  type MultiFactorError,
  type MultiFactorResolver,
  type PhoneMultiFactorInfo,
  type User,
} from "firebase/auth";

/**
 * Container the invisible reCAPTCHA renders into. It must be mounted before a
 * ceremony starts, so every screen that can trigger one renders it.
 */
export const RECAPTCHA_CONTAINER_ID = "shipin-recaptcha";

/** A failure we can show to a user, with the Firebase code kept for logging. */
export class FirebaseMfaError extends Error {
  readonly code: string;

  constructor(message: string, code = "MFA_FAILED") {
    super(message);
    this.name = "FirebaseMfaError";
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  "auth/requires-recent-login":
    "For security, sign out and sign in again before changing your second factor.",
  "auth/code-expired": "That code expired. Send a new one.",
  "auth/invalid-verification-code": "That code is not correct. Try again.",
  "auth/invalid-verification-id": "This verification expired. Start again.",
  "auth/too-many-requests":
    "Too many attempts. Wait a few minutes and try again.",
  "auth/quota-exceeded":
    "The SMS quota for this project is exhausted. Try again later.",
  "auth/operation-not-allowed":
    "SMS MFA is not enabled for this project yet. Ask an administrator to enable it in Firebase.",
  "auth/unauthorized-domain":
    "This domain is not authorised for SMS verification.",
  "auth/captcha-check-failed":
    "The reCAPTCHA check failed. Reload the page and try again.",
  "auth/missing-phone-number": "Enter a phone number in international format.",
  "auth/invalid-phone-number":
    "That phone number is not valid. Use international format.",
};

function toMfaError(error: unknown): FirebaseMfaError {
  const code =
    error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "MFA_FAILED";

  return new FirebaseMfaError(
    MESSAGES[code] ?? "The SMS verification could not be completed. Try again.",
    code
  );
}

/** True when sign-in stopped for a second factor instead of failing. */
export function isMultiFactorRequired(
  error: unknown
): error is MultiFactorError {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "auth/multi-factor-auth-required"
  );
}

function createVerifier(auth: Auth): RecaptchaVerifier {
  // Invisible: Firebase resolves it without user interaction in the common
  // case, and it does not need layout space of its own.
  return new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, {
    size: "invisible",
  });
}

/** The phone factor currently enrolled on this user, if any. */
export function enrolledPhoneFactor(user: User): PhoneMultiFactorInfo | null {
  const factor = multiFactor(user).enrolledFactors.find(
    (candidate) => candidate.factorId === PhoneMultiFactorGenerator.FACTOR_ID
  );

  return (factor as PhoneMultiFactorInfo | undefined) ?? null;
}

/**
 * Send an enrollment code to `phoneNumber`.
 *
 * Returns the `verificationId` that `confirmSmsEnrollment` needs; the code
 * itself never reaches this app.
 */
export async function startSmsEnrollment(
  auth: Auth,
  user: User,
  phoneNumber: string
): Promise<string> {
  const verifier = createVerifier(auth);

  try {
    const session = await multiFactor(user).getSession();
    const provider = new PhoneAuthProvider(auth);

    return await provider.verifyPhoneNumber({ phoneNumber, session }, verifier);
  } catch (error) {
    throw toMfaError(error);
  } finally {
    // Each ceremony owns its widget; a stale one would keep the old
    // reCAPTCHA token around for the next attempt.
    verifier.clear();
  }
}

/** Complete enrollment with the code the user received. */
export async function confirmSmsEnrollment(
  user: User,
  verificationId: string,
  code: string
): Promise<void> {
  try {
    const credential = PhoneAuthProvider.credential(verificationId, code);

    await multiFactor(user).enroll(
      PhoneMultiFactorGenerator.assertion(credential),
      "ShipIN SMS"
    );
  } catch (error) {
    throw toMfaError(error);
  }
}

export interface SecondFactorChallenge {
  resolver: MultiFactorResolver;
  verificationId: string;
  /** Masked by Firebase (e.g. +1******1234), safe to display. */
  phoneNumber: string | null;
}

/**
 * Start the sign-in challenge: send a code to the enrolled phone and keep the
 * resolver needed to finish the sign-in.
 */
export async function startSecondFactorChallenge(
  auth: Auth,
  error: MultiFactorError
): Promise<SecondFactorChallenge> {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find(
    (candidate) => candidate.factorId === PhoneMultiFactorGenerator.FACTOR_ID
  ) as PhoneMultiFactorInfo | undefined;

  if (!hint) {
    throw new FirebaseMfaError(
      "This account uses a second factor this app cannot complete. Contact support.",
      "MFA_UNSUPPORTED_FACTOR"
    );
  }

  const verifier = createVerifier(auth);

  try {
    const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(
      { multiFactorHint: hint, session: resolver.session },
      verifier
    );

    return {
      resolver,
      verificationId,
      phoneNumber: hint.phoneNumber ?? null,
    };
  } catch (error) {
    throw toMfaError(error);
  } finally {
    verifier.clear();
  }
}

/** Finish sign-in with the SMS code. Returns the now fully authenticated user. */
export async function confirmSecondFactorChallenge(
  challenge: SecondFactorChallenge,
  code: string
): Promise<User> {
  try {
    const credential = PhoneAuthProvider.credential(
      challenge.verificationId,
      code
    );
    const result = await challenge.resolver.resolveSignIn(
      PhoneMultiFactorGenerator.assertion(credential)
    );

    return result.user;
  } catch (error) {
    throw toMfaError(error);
  }
}
