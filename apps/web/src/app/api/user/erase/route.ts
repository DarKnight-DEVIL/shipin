import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { logRightsRequest } from "@/lib/compliance/rightsOps2";

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
    // 2b. Pre-check: refuse to start erasure when the account still holds
    // active financial obligations, so the user is not stranded mid-flow.
    // This runs BEFORE any data is touched and BEFORE the Auth user is
    // deleted, so a cancellation here leaves everything intact.
    const obligationsSnap = await adminDb
      .collection("walletTransactions")
      .where("userId", "==", uid)
      .where("status", "in", ["pending", "completed"])
      .get();
    if (
      obligationsSnap.docs.some((doc) => {
        const status = doc.data().status;
        return status === "pending" || status === "completed";
      })
    ) {
      await adminDb.collection("rightsRequests").doc(requestId).update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledReason: "Active wallet obligations prevent erasure",
      });

      return NextResponse.json(
        {
          success: false,
          error:
            "Account erasure is blocked by active wallet transactions. Contact support to review.",
          code: "ERASURE_CANCELLED",
          requestId,
        },
        { status: 409 }
      );
    }

    const batch = adminDb.batch();

    // 1. Delete the user's own subcollections and the records that exist only to
    //    serve them. None of these carries a legal retention obligation.
    const addressesSnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("addresses")
      .get();
    addressesSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const ticketsSnap = await adminDb
      .collection("supportTickets")
      .where("customerId", "==", uid)
      .get();
    ticketsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const notificationsSnap = await adminDb
      .collection("notifications")
      .where("userId", "==", uid)
      .get();
    notificationsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const walletTxnsSnap = await adminDb
      .collection("walletTransactions")
      .where("userId", "==", uid)
      .get();
    walletTxnsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const consentLogsSnap = await adminDb
      .collection("consentLogs")
      .where("userId", "==", uid)
      .get();
    consentLogsSnap.docs.forEach((doc) => batch.delete(doc.ref));

    // Rights requests are records *about* the user, but the one being served
    // here is the proof that erasure happened. Keep it, drop the rest.
    const rightsReqsSnap = await adminDb
      .collection("rightsRequests")
      .where("userId", "==", uid)
      .get();
    rightsReqsSnap.docs
      .filter((doc) => doc.id !== requestId)
      .forEach((doc) => batch.delete(doc.ref));

    // 2. Requests are anonymised, not deleted: invoices and shipment records
    //    are retained for tax/audit, but the personal fields in them are not.
    //    Previously this cascade never touched `requests` at all, so a "deleted"
    //    user's name, email and shipping address stayed queryable.
    const requestsSnap = await adminDb
      .collection("requests")
      .where("userId", "==", uid)
      .get();
    requestsSnap.docs.forEach((doc) =>
      batch.update(doc.ref, {
        email: ERASED_EMAIL,
        customerName: ERASED_NAME,
        shippingAddress: FieldValue.delete(),
        erasureRequestId: requestId,
        erasedAt: FieldValue.serverTimestamp(),
      })
    );

    await batch.commit();

    // 3. Anonymise the profile but keep the document (legal/tax trail), with the
    //    real request id instead of a placeholder.
    await adminDb.collection("users").doc(uid).update({
      erased: true,
      erasedAt: FieldValue.serverTimestamp(),
      erasureRequestId: requestId,
      displayName: ERASED_NAME,
      email: ERASED_EMAIL,
      phone: "",
      photoURL: "",
      dateOfBirth: null,
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
