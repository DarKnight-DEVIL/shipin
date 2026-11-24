import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import {
  additionalItemRequestBodySchema,
  readAndValidateBody,
  requestIdSchema,
} from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import {
  ADDITIONAL_ITEM_STATUSES,
  isOneOf,
} from "@/features/requests/services/requestWorkflow";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/requests/[requestId]/additional-items
 *
 * The customer asks the team to source an extra item for a request that is
 * already paid but not yet dispatched. Owner only.
 *
 * The item lands as `pending`; the admin quotes and approves it from the
 * Products panel, which also owns the payment side. The request's
 * `orderChange` flag is raised only when no order change is already running,
 * so a second item cannot reset the fees an in-flight change is carrying.
 *
 * The route replaces the client-side Firestore write this dialog used to be
 * wired to (`addAdditionalItemRequest` in `features/requests/services/
 * requests.ts`, never called) and gives the AddItemRequest dialog a working
 * endpoint: it had always POSTed to a path that did not exist.
 */

/** The admin panel reads items back wholesale; keep the list bounded. */
const MAX_ADDITIONAL_ITEMS = 100;

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
  ) => {
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400, headers: NO_STORE }
      );
    }

    const { requestId } = parsedParams.data;

    const parsed = await readAndValidateBody(
      request,
      additionalItemRequestBodySchema
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error,
          code: "INVALID_REQUEST_BODY",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    // One 404 for "does not exist" and "not yours": a request id must not
    // confirm existence to another customer.
    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const data = snapshot.data() ?? {};

    if (data.userId !== auth.profile.uid) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const status = data.status as string | undefined;

    if (!isOneOf(status, ADDITIONAL_ITEM_STATUSES)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Additional items can only be requested before the shipment has been dispatched.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const existing = Array.isArray(data.additionalItemRequests)
      ? (data.additionalItemRequests as unknown[])
      : [];

    if (existing.length >= MAX_ADDITIONAL_ITEMS) {
      return NextResponse.json(
        {
          success: false,
          error: "This request already has the maximum number of items.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const { name, url, quantity } = parsed.data;

    const newItem = {
      id: crypto.randomUUID(),
      item: { name, quantity, url },
      status: "pending",
      repackingFee: 0,
      storageFee: 0,
      amountPaid: 0,
      orderChangeHold: true,
      requestedAt: FieldValue.serverTimestamp(),
    };

    const updates: Record<string, unknown> = {
      additionalItemRequests: [...existing, newItem],
      updatedAt: FieldValue.serverTimestamp(),
    };

    const orderChange = data.orderChange as
      { active?: unknown } | null | undefined;

    if (orderChange?.active !== true) {
      updates.orderChange = {
        active: true,
        requiresRepacking: status === "packed",
        repackingFee: status === "packed" ? 2 : 0,
        storageFee: 0,
        storageFeeApplied: false,
        startedAt: FieldValue.serverTimestamp(),
      };
    }

    await requestRef.update(updates);

    return NextResponse.json(
      { success: true, itemId: newItem.id },
      { status: 201, headers: NO_STORE }
    );
  }
);
