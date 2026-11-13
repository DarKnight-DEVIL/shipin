import { NextRequest, NextResponse } from "next/server";

import { requireAuthWithProfile } from "@/lib/auth";
import { withErrorHandler } from "@/utils/errors";
import {
  processWalletPayment,
  walletPaymentErrorResponse,
} from "@/features/wallet/services/walletPayment";

/**
 * POST /api/payment/complete-wallet
 *
 * Requires an authenticated customer who OWNS the request, and runs the
 * balance-check + deduction inside a Firestore transaction so concurrent
 * requests cannot double-spend the wallet.
 *
 * Previously this endpoint had no auth and used a read-then-write batch,
 * which is a classic TOCTOU race: two concurrent calls could both pass the
 * balance check and both deduct, driving the balance negative.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(req);
  if (auth instanceof NextResponse) return auth;

  // --- 2. Parse and validate body ---
  let body: { requestId?: unknown; amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  const amount = Number(body.amount);

  if (!requestId) {
    return NextResponse.json(
      { success: false, error: "Request ID is required." },
      { status: 400 }
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid payment amount." },
      { status: 400 }
    );
  }

  // --- 3. Delegate to the wallet service ---
  try {
    const result = await processWalletPayment(
      requestId,
      amount,
      auth.profile.uid
    );

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
    });
  } catch (error) {
    const known = walletPaymentErrorResponse(error);
    if (known) {
      return NextResponse.json(
        { success: false, error: known.message, code: known.code },
        { status: known.status }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
});
  