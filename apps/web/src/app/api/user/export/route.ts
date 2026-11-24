import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { requireAuthWithProfile } from "@/lib/auth";
import { adminDb } from "@/lib/firebaseAdmin";

import {
  logRightsRequest,
  updateRightsRequest,
} from "@/lib/compliance/rightsOps2";

/*
 * Data portability export per DPDP Act Sec 11(2)/13 and GDPR Art 20.
 *
 * The export is produced immediately, in the request itself: an earlier
 * revision recorded a rights request and answered "You will receive a
 * download link when ready", but nothing in the repo ever generated or sent
 * that link (docs/AUDIT.md §2.5). A promise the product cannot keep is worse
 * than no promise, so `GET /api/user/export` now always returns the bundle as
 * a downloadable JSON file.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  return buildExportResponse(auth.profile.uid);
});

async function buildExportResponse(uid: string): Promise<NextResponse> {
  // Log the portability request so the rights ledger shows it was exercised.
  const requestId = await logRightsRequest({
    userId: uid,
    right: "portability",
    details: "User requested data export",
  });

  try {
    // Collect all user data
    const [
      userDoc,
      ordersSnap,
      walletDoc,
      addressesSnap,
      notificationsSnap,
      supportSnap,
      consentLogsSnap,
      rightsReqsSnap,
    ] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("requests").where("userId", "==", uid).get(),
      adminDb.collection("wallets").doc(uid).get(),
      adminDb.collection("users").doc(uid).collection("addresses").get(),
      adminDb.collection("notifications").where("userId", "==", uid).get(),
      adminDb.collection("supportTickets").where("customerId", "==", uid).get(),
      adminDb
        .collection("consentLogs")
        .where("userId", "==", uid)
        .orderBy("timestamp", "desc")
        .limit(100)
        .get(),
      adminDb
        .collection("rightsRequests")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get(),
    ]);

    const exportData = {
      profile: userDoc.exists ? userDoc.data() : null,
      orders: ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      wallet: walletDoc.exists ? walletDoc.data() : null,
      addresses: addressesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      notifications: notificationsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
      supportTickets: supportSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      consentLogs: consentLogsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      rightsRequests: rightsReqsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
      exportedAt: new Date().toISOString(),
      exportRequestId: requestId,
    };

    // Update request as completed
    await updateRightsRequest(
      requestId,
      "completed",
      "Data export completed",
      "system"
    );

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="shipin-data-${uid}-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    await updateRightsRequest(
      requestId,
      "rejected",
      "Export failed: " +
        (error instanceof Error ? error.message : "Unknown error")
    );

    return NextResponse.json(
      {
        success: false,
        error: "Export failed. Please try again.",
        code: "EXPORT_FAILED",
      },
      { status: 500 }
    );
  }
}
