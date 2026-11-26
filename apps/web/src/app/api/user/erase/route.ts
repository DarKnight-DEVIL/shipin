import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logRightsRequest } from "@/lib/compliance/rightsOps2";
import {
  commitInChunks,
  type FirestoreBatchOperation,
} from "@/lib/firestoreBatch";
import { storedMinor } from "@/lib/money";
import { userSecretsRef } from "@/lib/mfaSecrets";

/** Values written in place of the erased PII. */
const ERASED_NAME = "Deleted User";
const ERASED_EMAIL = "deleted@user.local";

/**
 * `auth/user-not-found` from deleteUser means the account is already gone, which
 * is the state erasure wanted — not a failure.
 */
function isAlreadyDeleted(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "auth/user-not-found"
  );
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Log the erasure request. Its id is the audit trail for everything below:
  // it is stamped onto the anonymised records and used to close the request.
  const requestId = await logRightsRequest({
    userId: auth.profile.uid,
    right: "erasure",
    details: "User requested account and data deletion",
  });

  const uid = auth.profile.uid;

  try {
    /*
     * Real obligations, not ledger history: a settled transaction is a record
     * of money that already moved, while a positive wallet balance or an active
     * hold is money the customer can still spend. The old check treated every
     * completed transaction as an obligation, which blocked erasure forever.
     */
    const [walletSnap, activeHoldsSnap, pendingTopupsSnap] = await Promise.all([
      adminDb.collection("wallets").doc(uid).get(),
      adminDb
        .collection("walletHolds")
        .where("userId", "==", uid)
        .where("status", "==", "reserved")
        // firestore-list: internal — existence probe for any active hold.
        .limit(1)
        .get(),
      adminDb
        .collection("walletTopupOrders")
        .where("userId", "==", uid)
        .where("capturePending", "==", true)
        // firestore-list: internal — existence probe for any pending top-up.
        .limit(1)
        .get(),
    ]);

    const walletData = walletSnap.exists ? walletSnap.data() : undefined;
    const hasBalance = storedMinor(walletData, "balance") > 0;
    const hasReserved = storedMinor(walletData, "reserved") > 0;
    const hasObligation =
      hasBalance ||
      hasReserved ||
      !activeHoldsSnap.empty ||
      !pendingTopupsSnap.empty;

    if (hasObligation) {
      await adminDb.collection("rightsRequests").doc(requestId).update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledReason: "Active wallet obligations prevent erasure",
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "Account erasure is blocked by an active wallet balance, hold, or pending top-up. Contact support to review.",
          code: "ERASURE_CANCELLED",
          requestId,
        },
        { status: 409 }
      );
    }

    const operations: FirestoreBatchOperation[] = [
      // The TOTP secret and backup-code hashes are authentication data with no
      // retention value. Delete them before the profile is anonymised.
      { type: "delete", ref: userSecretsRef(uid) },
    ];

    // 1. Delete the user's own subcollections and the records that exist only to
    //    serve them. Ledger entries and PayPal order records are deliberately
    //    retained: they are the financial audit trail, and deleting them is a
    //    legal-retention decision rather than a privacy one.
    const addressesSnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("addresses")
      .get();
    addressesSnap.docs.forEach((doc) =>
      operations.push({ type: "delete", ref: doc.ref })
    );

    const ticketsSnap = await adminDb
      .collection("supportTickets")
      .where("customerId", "==", uid)
      .get();
    ticketsSnap.docs.forEach((doc) =>
      operations.push({ type: "delete", ref: doc.ref })
    );

    // Support messages are keyed by ticket, not by user, so they survive a
    // ticket-only cascade and keep the customer's words in the database.
    for (const ticket of ticketsSnap.docs) {
      const messagesSnap = await adminDb
        .collection("supportMessages")
        .where("ticketId", "==", ticket.id)
        .get();
      messagesSnap.docs.forEach((doc) =>
        operations.push({ type: "delete", ref: doc.ref })
      );
    }

    const notificationsSnap = await adminDb
      .collection("notifications")
      .where("userId", "==", uid)
      .get();
    notificationsSnap.docs.forEach((doc) =>
      operations.push({ type: "delete", ref: doc.ref })
    );

    const holdsSnap = await adminDb
      .collection("walletHolds")
      .where("userId", "==", uid)
      .get();
    holdsSnap.docs.forEach((doc) =>
      operations.push({ type: "delete", ref: doc.ref })
    );

    const consentLogsSnap = await adminDb
      .collection("consentLogs")
      .where("userId", "==", uid)
      .get();
    consentLogsSnap.docs.forEach((doc) =>
      operations.push({ type: "delete", ref: doc.ref })
    );

    // Payment orders are financial evidence. Remove the account identifier but
    // keep the order, capture and amount for reconciliation and tax.
    const paymentOrdersSnap = await adminDb
      .collection("paypalPaymentOrders")
      .where("userId", "==", uid)
      .get();
    paymentOrdersSnap.docs.forEach((doc) =>
      operations.push({
        type: "update",
        ref: doc.ref,
        data: {
          userId: FieldValue.delete(),
          erasureRequestId: requestId,
          erasedAt: FieldValue.serverTimestamp(),
        },
      })
    );

    // Rights requests are records *about* the user, but the one being served
    // here is the proof that erasure happened. Keep it, drop the rest.
    const rightsReqsSnap = await adminDb
      .collection("rightsRequests")
      .where("userId", "==", uid)
      .get();
    rightsReqsSnap.docs
      .filter((doc) => doc.id !== requestId)
      .forEach((doc) => operations.push({ type: "delete", ref: doc.ref }));

    // 2. Requests are anonymised, not deleted: invoices and shipment records
    //    are retained for tax/audit, but the personal fields in them are not.
    const requestsSnap = await adminDb
      .collection("requests")
      .where("userId", "==", uid)
      .get();
    requestsSnap.docs.forEach((doc) =>
      operations.push({
        type: "update",
        ref: doc.ref,
        data: {
          email: ERASED_EMAIL,
          customerName: ERASED_NAME,
          shippingAddress: FieldValue.delete(),
          notes: FieldValue.delete(),
          adminNotes: FieldValue.delete(),
          internalNotes: FieldValue.delete(),
          customerNotes: FieldValue.delete(),
          additionalNotes: FieldValue.delete(),
          erasureRequestId: requestId,
          erasedAt: FieldValue.serverTimestamp(),
        },
      })
    );

    await commitInChunks(adminDb, operations);

    // 3. Anonymise the profile but keep the document (legal/tax trail). MFA
    //    secrets, backup-code hashes and replay markers have no retention value.
    await adminDb.collection("users").doc(uid).update({
      erased: true,
      erasedAt: FieldValue.serverTimestamp(),
      erasureRequestId: requestId,
      displayName: ERASED_NAME,
      email: ERASED_EMAIL,
      phone: "",
      photoURL: "",
      dateOfBirth: null,
      mfa: FieldValue.delete(),
      notificationPreferences: FieldValue.delete(),
    });

    // 4. Delete the Firebase Auth user, which is what actually ends the
    //    account. Without this the "erased" user could still sign in with the
    //    same credentials and land on a half-anonymised profile.
    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      // Already gone is the desired end state, not a failure.
      if (!isAlreadyDeleted(error)) throw error;
    }

    // 5. Close the audit record. Best-effort: the erasure itself already
    //    happened, and failing the request here would invite a retry that
    //    cannot succeed (the Auth user is gone).
    try {
      await adminDb.collection("rightsRequests").doc(requestId).update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        response: "Account and personal data erased per DPDP Sec 12",
      });
    } catch (error) {
      console.error("[erasure] could not close the rights request:", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "Account and personal data have been erased. Minimal audit trail retained for legal compliance.",
      requestId,
    });
  } catch (error) {
    console.error("Erasure error:", error);

    // Record the failure against the request so support can see it, then fail
    // the call: a partial cascade must not be reported as a success.
    try {
      await adminDb
        .collection("rightsRequests")
        .doc(requestId)
        .update({
          status: "rejected",
          response: `Erasure failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
    } catch {
      // Nothing else to do — the 500 below is the signal.
    }

    return NextResponse.json(
      {
        success: false,
        error: "Erasure failed. Please contact support.",
        code: "ERASURE_FAILED",
        requestId,
      },
      { status: 500 }
    );
  }
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // Return status of erasure requests
  const { getUserRightsRequests } = await import("@/lib/compliance/rightsOps2");
  const requests = await getUserRightsRequests(auth.profile.uid);
  const erasureRequests = requests.filter((r) => r.right === "erasure");

  return NextResponse.json({
    success: true,
    requests: erasureRequests,
  });
});
