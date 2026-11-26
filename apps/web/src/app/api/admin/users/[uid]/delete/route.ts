import { NextRequest, NextResponse } from "next/server";

import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { recordAdminAudit } from "@/lib/adminAudit";
import { withErrorHandler } from "@/utils/errors";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import { adminDeleteUserBodySchema, readAndValidateBody } from "@/lib/validation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Collections that make an account a customer rather than a scratch signup. */
const HISTORY_CHECKS = [
  { collection: "requests", field: "userId", label: "orders" },
  { collection: "walletTransactions", field: "userId", label: "wallet history" },
  { collection: "walletHolds", field: "userId", label: "wallet holds" },
] as const;

/**
 * POST /api/admin/users/[uid]/delete
 *
 * Removes a throwaway account - one created to test a flow - from both Auth and
 * Firestore. Real customers have a self-service path (`/api/user/erase`) that
 * anonymises instead of destroying, because orders, wallet entries and invoices have
 * to survive for accounting and tax; this endpoint deliberately refuses to be a
 * second, quieter way to delete those.
 *
 * So it is narrow on purpose:
 *
 *   - admin only, and the admin must have passed the MFA gate;
 *   - the caller must repeat the account's email address, which the server checks
 *     itself rather than trusting the form. A misclicked row cannot be deleted;
 *   - a written reason goes into `adminAuditLog` with the actor;
 *   - an account with any order or wallet history is refused (409), named by what
 *     blocked it, and pointed at the anonymising erasure flow instead;
 *   - an admin account is refused, as is deleting yourself, so the console cannot
 *     delete the account that administers it;
 *   - the Auth user goes last. If Firestore cleanup fails halfway, the account still
 *     exists and is still findable, rather than becoming a login with no profile and
 *     no way to trace it.
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

      const parsed = await readAndValidateBody(req, adminDeleteUserBodySchema);

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A reason and the account's email address are required to delete an account.",
            code: "INVALID_REQUEST_BODY",
          },
          { status: 400, headers: NO_STORE }
        );
      }

      const { reason, confirmEmail } = parsed.data;

      if (uid === admin.uid) {
        return NextResponse.json(
          {
            success: false,
            error: "You cannot delete the account you are signed in with.",
            code: "CANNOT_DELETE_SELF",
          },
          { status: 409, headers: NO_STORE }
        );
      }

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

      const email = user.email ?? "";
      const profileSnap = await adminDb.collection("users").doc(uid).get();
      const role = profileSnap.data()?.role;

      if (role === "admin" || user.customClaims?.admin === true) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Administrator accounts cannot be deleted here. Remove the admin role first, or use the break-glass tooling.",
            code: "TARGET_IS_ADMIN",
          },
          { status: 409, headers: NO_STORE }
        );
      }

      /*
       * The typed address is the guard against a misclicked row. Compared here, not
       * in the browser: the form's disablement is a convenience, and a request that
       * skips it must fail too.
       */
      if (email === "" || email.trim().toLowerCase() !== confirmEmail.toLowerCase()) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The email address you typed does not match this account. Nothing was deleted.",
            code: "EMAIL_CONFIRMATION_MISMATCH",
          },
          { status: 400, headers: NO_STORE }
        );
      }

      const history = new Set<string>();

      for (const check of HISTORY_CHECKS) {
        const snap = await adminDb
          .collection(check.collection)
          .where(check.field, "==", uid)
          .limit(1)
          .get();

        if (!snap.empty) history.add(check.label);
      }

      // A wallet document means real money moved at some point, even if every
      // transaction has since been settled away.
      const walletSnap = await adminDb.collection("wallets").doc(uid).get();
      if (walletSnap.exists) history.add("a wallet");

      if (history.size > 0) {
        const what = [...history].join(", ");
        return NextResponse.json(
          {
            success: false,
            error: `This account has ${what}, so it cannot be deleted. Use the customer's erasure flow, which anonymises and keeps the financial records.`,
            code: "ACCOUNT_HAS_HISTORY",
            blockedBy: [...history],
          },
          { status: 409, headers: NO_STORE }
        );
      }

      /*
       * Nothing financial exists, so these are the records that exist only to serve
       * the login itself. Counts are returned and audited: "how much did that
       * delete?" is the first question asked afterwards.
       */
      const removed: Record<string, number> = {};
      const batch = adminDb.batch();

      const subcollections = await adminDb
        .collection("users")
        .doc(uid)
        .listCollections();

      for (const sub of subcollections) {
        const snap = await sub.get();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        removed[`users/${uid}/${sub.id}`] = snap.size;
      }

      const owned = [
        { collection: "addresses", field: "userId" },
        { collection: "notifications", field: "userId" },
        { collection: "supportTickets", field: "customerId" },
        { collection: "consentLogs", field: "userId" },
      ] as const;

      for (const check of owned) {
        const snap = await adminDb
          .collection(check.collection)
          .where(check.field, "==", uid)
          .get();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        removed[check.collection] = snap.size;
      }

      if (profileSnap.exists) {
        batch.delete(profileSnap.ref);
        removed.users = 1;
      }

      await batch.commit();

      /*
       * Last, and only after Firestore is clean: a half-deleted account that still
       * exists is recoverable, one whose login is gone with its data still present
       * is not.
       */
      await adminAuth.deleteUser(uid);

      await recordAdminAudit({
        actorUid: admin.uid,
        actorEmail: admin.email,
        action: "user.account.delete",
        targetType: "user",
        targetId: uid,
        detail: { reason, email, removed },
      });

      console.warn(
        `[admin] account ${uid} (${email}) deleted by ${admin.uid}: ${reason}`
      );

      return NextResponse.json(
        { success: true, uid, email, removed },
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
