import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { withErrorHandler } from "@/utils/errors";
import {
  additionalItemsBodySchema,
  readAndValidateBody,
} from "@/lib/validation";

export const PATCH = withErrorHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
  ) => {
    try {
      await requireAdmin(req);

      const { requestId } = await params;

      if (!requestId) {
        return NextResponse.json(
          { success: false, error: "Request ID is required." },
          { status: 400 }
        );
      }

      const parsed = await readAndValidateBody(req, additionalItemsBodySchema);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error },
          { status: 400 }
        );
      }

      const { additionalItemRequests, status } = parsed.data;

      const requestRef = adminDb.collection("requests").doc(requestId);
      const snapshot = await requestRef.get();

      if (!snapshot.exists) {
        return NextResponse.json(
          { success: false, error: "Request not found." },
          { status: 404 }
        );
      }

      const updateData: Partial<{
        additionalItemRequests: unknown;
        status?: string;
        updatedAt: Date;
      }> = {
        additionalItemRequests,
        updatedAt: new Date(),
      };

      if (status) {
        updateData.status = status;
      }

      await requestRef.update(updateData);

      return NextResponse.json({
        success: true,
      });
    } catch (error) {
      console.error("Error updating additional item requests:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  }
);
