import { NextRequest, NextResponse } from "next/server";

import { requireAuthWithProfile } from "@/lib/auth";
import { adminAuth } from "@/lib/firebaseAdmin";
import { clientEnv } from "@/config/env";
import { validatePassword } from "@/lib/passwordPolicy";
import { withErrorHandler } from "@/utils/errors";
import {
  passwordChangeBodySchema,
  readAndValidateBody,
} from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/user/password
 *
 * The only password-change path the app uses. Changing a password client-side
 * with `updatePassword` means the policy lives only in the browser, where a
 * direct SDK call ignores it; here the policy is enforced server-side and the
 * change itself goes through the Admin SDK.
 *
 * The current password is re-verified with Identity Toolkit when the account
 * signs in with a password, so a stolen ID token cannot be used to set a new
 * password on its own.
 */
async function verifyCurrentPassword(
  email: string,
  password: string
): Promise<boolean> {
  const apiKey = clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) return false;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
        cache: "no-store",
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readAndValidateBody(request, passwordChangeBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "A new password is required.",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await adminAuth.getUser(auth.profile.uid);
  const email = user.email ?? null;

  const policy = validatePassword(newPassword, { email });

  if (!policy.valid) {
    return NextResponse.json(
      {
        success: false,
        error: policy.errors[0],
        errors: policy.errors,
        code: "WEAK_PASSWORD",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: "This account has no email address.",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  // Whether the account even has a password is read from Auth, not from the
  // browser: a social-only account is setting its first password, an account
  // with one must prove it still knows the old value.
  const hasPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password"
  );

  if (hasPasswordProvider) {
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter your current password.",
          code: "CURRENT_PASSWORD_REQUIRED",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!(await verifyCurrentPassword(email, currentPassword))) {
      return NextResponse.json(
        {
          success: false,
          error: "Your current password is incorrect.",
          code: "INVALID_CREDENTIALS",
        },
        { status: 401, headers: NO_STORE }
      );
    }
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      {
        success: false,
        error: "New password must be different.",
        code: "SAME_PASSWORD",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  await adminAuth.updateUser(auth.profile.uid, { password: newPassword });

  // A password change ends other sessions: a token minted before it should not
  // keep working from a device that no longer knows the credential.
  await adminAuth.revokeRefreshTokens(auth.profile.uid);

  return NextResponse.json(
    { success: true },
    { status: 200, headers: NO_STORE }
  );
});
