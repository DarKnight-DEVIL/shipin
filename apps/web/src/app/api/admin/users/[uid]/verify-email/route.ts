import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { recordAdminAudit } from "@/lib/adminAudit";
import { withErrorHandler } from "@/utils/errors";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import { readAndValidateBody, adminEmailVerifyBodySchema } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/admin/users/[uid]/verify-email
 *
 * Marks an account's email as verified, bypassing the verification email. This
 * exists for one situation: the customer no longer has access to that mailbox and
 * every authenticated route rejects them with `EMAIL_VERIFICATION_REQUIRED`, so the
 * self-service resend cannot help them.
 *
 * It is a deliberate bypass of a security control, so it is not quiet:
 *
 *   - admin only, and the admin must have passed the MFA gate (`requireAdmin`);
 *   - a written reason is required, and it is stored in `adminAuditLog` with the
 *     actor, so the override can be reviewed afterwards;
 *   - the account's email is untouched. Verification says "we accept this address",
 *     it does not change which address is on the account;
 *   - an account that is already verified answers 409, so a repeated call is a
 *     mistake worth surfacing rather than a silent no-op.
 *
 * The alternative - asking the customer to make a new account - loses their orders,
 * their wallet balance and their history.
 */
export const POST = withErrorHandler(
  async (req: NextRequest, context: { params: Promise<{ uid: string }> }) => {
    try {
      const admin = await requireAdmin(req);

      const { uid } = await context.params;

      if (!uid) {
        return NextResponse.json(
          { success: false, error: "User ID is required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const parsed = await readAndValidateBody(
        req,
        adminEmailVerifyBodySchema
      );

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: "A reason is required to override email verification.",
            code: "INVALID_REQUEST_BODY",
          },
          { status: 400, headers: NO_STORE }
        );
      }

      const { reason } = parsed.data;

      let user;
      try {
        user = await adminAuth.getUser(uid);
      } catch (error) {
        const code = (error as { code?: string })?.code;

        if (code === "auth/user-not-found") {
          return NextResponse.json(
            { success: false, error: "User not found.", code: "USER_NOT_FOUND" },
            { status: 404, headers: NO_STORE }
          );
        }

        throw error;
      }

      if (user.emailVerified) {
        return NextResponse.json(
          {
            success: false,
            error: "This account's email is already verified.",
            code: "ALREADY_VERIFIED",
          },
          { status: 409, headers: NO_STORE }
        );
      }

      /*
       * The only write that actually unblocks the customer: `requireAuth` reads
       * `email_verified` from the ID token, which Firebase derives from this field.
       * The user's cached token keeps the old value until it refreshes, so the
       * response says so rather than leaving support to wonder why nothing changed.
       */
      await adminAuth.updateUser(uid, { emailVerified: true });

      // Mirror onto the profile for the admin UI, without creating a document for
      // an account that does not have one.
      const profileRef = adminDb.collection("users").doc(uid);
      const profile = await profileRef.get();
      if (profile.exists) {
        await profileRef.update({ emailVerified: true });
      }

      await recordAdminAudit({
        actorUid: admin.uid,
        actorEmail: admin.email,
        action: "user.email.verify_override",
        targetType: "user",
        targetId: uid,
        detail: { reason },
      });

      console.warn(
        `[admin] email verification overridden for ${uid} by ${admin.uid}: ${reason}`
      );

      return NextResponse.json(
        {
          success: true,
          uid,
          // Named because the customer will still see the 403 until it happens.
          tokenRefreshRequired: true,
        },
        { status: 200, headers: NO_STORE }
      );
    } catch (error) {
      const mapped = getAdminAuthError(error);

      if (mapped) {
        return NextResponse.json(
          { success: false, error: mapped.error },
          { status: mapped.status, headers: NO_STORE }
        );
      }

      throw error;
    }
  }
);
