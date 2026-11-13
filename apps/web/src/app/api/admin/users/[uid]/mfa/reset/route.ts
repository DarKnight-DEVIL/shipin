import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { recordAdminAudit } from "@/lib/adminAudit";
import { withErrorHandler } from "@/utils/errors";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/admin/users/[uid]/mfa/reset
 *
 * Clears every MFA factor for a user so they can re-enrol. Used when a
 * customer loses their authenticator and support needs to unblock them.
 *
 * Requires an admin that already passed the MFA gate, and leaves an
 * `adminAuditLog` entry naming the actor.
 */
export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ uid: string }> }
  ) => {
    try {
      const admin = await requireAdmin(req);

      const { uid } = await context.params;

      if (!uid) {
        return NextResponse.json(
          { success: false, error: "User ID is required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const userRef = adminDb.collection("users").doc(uid);
      const snapshot = await userRef.get();

      if (!snapshot.exists) {
        return NextResponse.json(
          { success: false, error: "User not found." },
          { status: 404, headers: NO_STORE }
        );
      }

      await userRef.update({
        "mfa.totp": FieldValue.delete(),
        "mfa.sms": FieldValue.delete(),
        "mfa.webauthn": FieldValue.delete(),
        "mfa.resetAt": FieldValue.serverTimestamp(),
        "mfa.resetBy": admin.uid,
      });

      await recordAdminAudit({
        actorUid: admin.uid,
        actorEmail: admin.email,
        action: "mfa.reset",
        targetType: "user",
        targetId: uid,
      });

      return NextResponse.json(
        { success: true, uid },
        { status: 200, headers: NO_STORE }
      );
    } catch (error) {
      const authError = getAdminAuthError(error);

      if (
        authError.status !== 500 ||
        (error instanceof Error &&
          [
            "AUTHENTICATION_REQUIRED",
            "INVALID_AUTHENTICATION",
            "USER_PROFILE_NOT_FOUND",
            "ADMIN_ACCESS_REQUIRED",
            "MFA_REQUIRED",
            "MFA_SETUP_REQUIRED",
          ].includes(error.message))
      ) {
        return NextResponse.json(
          { success: false, error: authError.error },
          { status: authError.status, headers: NO_STORE }
        );
      }

      console.error("Admin MFA reset error:", error);

      return NextResponse.json(
        { success: false, error: "Unable to reset MFA." },
        { status: 500, headers: NO_STORE }
      );
    }
  }
);
