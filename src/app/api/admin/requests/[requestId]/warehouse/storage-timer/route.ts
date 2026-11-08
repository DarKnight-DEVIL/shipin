import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { requestIdSchema } from "@/lib/validation";
import { getStorageParams } from "@/features/requests/services/warehousePolicy";
import { withErrorHandler } from '@/utils/errors';

export const POST = withErrorHandler(async (request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }) => {
  try {
    try {
      await requireAdmin(request);
    } catch (error) {
      const authError = getAdminAuthError(error);

      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status }
      );
    }

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400 }
      );
    }

    const { requestId } = parsedParams.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const data = snapshot.data() ?? {};

    const status = data.status as string | undefined;

    if (
      status !== "warehouse_received" &&
      status !== "packaged"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The storage timer can only be started after the package is received or packaged.",
        },
        { status: 409 }
      );
    }

    const { dailyFine, freeStorageDays } = getStorageParams(
      data.serviceSelections?.shippingPreference ?? "approval",
      data.warehouse?.storageType ?? undefined
    );

    const now = Date.now();
    const freeUntil = now + freeStorageDays * 24 * 60 * 60 * 1000;
    const serverTimestamp = FieldValue.serverTimestamp();

    await requestRef.update({
      storage: {
        startedAt: now,
        freeUntil,
        dailyFine,
        accumulatedFine: 0,
        active: true,
        freeStorageDays,
      },
      updatedAt: serverTimestamp,
    });

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Start storage timer failed:", error);

    return NextResponse.json(
      { success: false, error: "Unable to start the storage timer." },
      { status: 500 }
    );
  }
});
