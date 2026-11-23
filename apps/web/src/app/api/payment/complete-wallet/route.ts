import { NextRequest, NextResponse } from "next/server";

import { requireAuthWithProfile } from "@/lib/auth";
import {
  readIdempotencyKey,
  readIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/idempotency";
import { validateBody, completeWalletBodySchema } from "@/lib/validation";
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
  //
  // Only the request id is read. The amount used to come from this body, which
  // let a caller settle a $500 request with `amount: 1`; it is now derived from
  // the stored quote inside the service's transaction. An older client that
  // still sends `amount` is simply stripped by the schema.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = validateBody(body, completeWalletBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A valid request ID is required." },
      { status: 400 }
    );
  }

  const { requestId } = parsed.data;

  // --- 2b. Replay a completed attempt instead of charging again ---
  //
  // The client sends this key again when it retries after a dropped response.
  // Without the replay, that retry would reach the service and come back as
  // ALREADY_PAID — a successful payment reported to the customer as a failure.
  const idempotencyKey = readIdempotencyKey(req);
  const replayScope = {
    uid: auth.profile.uid,
    scope: "wallet.complete",
    key: idempotencyKey ?? "",
  };

  if (idempotencyKey) {
    const prior = await readIdempotentResponse(replayScope);

    if (prior) return NextResponse.json(prior.body, { status: prior.status });
  }

  // --- 3. Delegate to the wallet service ---
  try {
    const result = await processWalletPayment(requestId, auth.profile.uid);

    const body = {
      success: true,
      transactionId: result.transactionId,
    };

    if (idempotencyKey) {
      await rememberIdempotentResponse(replayScope, { status: 200, body });
    }

    return NextResponse.json(body);
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
