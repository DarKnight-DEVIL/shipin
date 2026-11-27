import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { createRequestBodySchema, readAndValidateBody } from "@/lib/validation";
import { enforceAgeGate } from "@/lib/compliance/ageOps";
import {
  readIdempotencyKey,
  readIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/idempotency";
import { withErrorHandler } from "@/utils/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/requests
 *
 * Create a request. Customer only, and the only write path into the
 * `requests` collection for a customer.
 *
 * The route replaces the client-side Firestore write the new-request page
 * was wired to (`createRequest` in `features/requests/services/requests.ts`,
 * never called — the page has always POSTed to this path, which did not
 * exist, so every submit 404ed).
 *
 * What the server owns, deliberately:
 *   - the SKU cap (`items` is capped at 3 by the schema) — more products
 *     belong in additional-item requests, which are quoted and billed
 *     separately;
 *   - the shipping address, resolved from the caller's own address book by
 *     id, so a request cannot be created with somebody else's — or an
 *     invented — address;
 *   - the customer identity: email and name come from the verified token and
 *     the profile, never from the body;
 *   - the workflow clock: `status: "submitted"` and `statusHistory.submitted`
 *     are set here, not by the client.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  // DPDP Act 2023 §9: an account under 18 without verified parental consent
  // cannot place requests, and neither can an account whose age is unknown —
  // the gate can only judge an age it was told. A missing DOB gets its own
  // code (DOB_REQUIRED) so the request form can collect it inline instead of
  // sending the customer to Settings.
  const gate = await enforceAgeGate(auth.profile.uid);

  if (!gate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          gate.error ??
          "This account cannot place requests yet.",
        code: gate.reason === "dob_required" ? "DOB_REQUIRED" : "AGE_GATE_BLOCKED",
      },
      { status: 403, headers: NO_STORE }
    );
  }

  const parsed = await readAndValidateBody(request, createRequestBodySchema);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        // The schema's own copy — "A request can include up to 3 products." —
        // is what a stuck customer needs; the generic envelope is for machines.
        error: parsed.message ?? parsed.error,
        code: "INVALID_REQUEST_BODY",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const { items, addressId, serviceSelections, notes } = parsed.data;

  // Idempotency: a double-submit or a retried POST (the client retries
  // idempotent writes once on a dropped connection) must not create two
  // requests in the queue. The key identifies one user intent — the client
  // mints it per submit call and its retry path reuses it — and the first
  // success is replayed instead of acting again.
  const idempotencyKey = readIdempotencyKey(request);
  const replayScope = {
    uid: auth.profile.uid,
    scope: "request.create",
    key: idempotencyKey ?? "",
  };
  if (idempotencyKey) {
    const prior = await readIdempotentResponse(replayScope);
    if (prior) return NextResponse.json(prior.body, { status: prior.status, headers: NO_STORE });
  }

  const addressSnapshot = await adminDb
    .collection("addresses")
    .doc(addressId)
    .get();

  // One 404 for "does not exist" and "not yours": an address id must not
  // confirm existence to another customer.
  if (!addressSnapshot.exists) {
    return NextResponse.json(
      { success: false, error: "Address not found." },
      { status: 404, headers: NO_STORE }
    );
  }

  const address = addressSnapshot.data() ?? {};

  if (address.userId !== auth.profile.uid) {
    return NextResponse.json(
      { success: false, error: "Address not found." },
      { status: 404, headers: NO_STORE }
    );
  }

  // The verified email is the identity of record; the profile's display name
  // is what admins see in the queue. Neither comes from the body.
  const profileSnapshot = await adminDb
    .collection("users")
    .doc(auth.profile.uid)
    .get();

  const profile = profileSnapshot.data() ?? {};

  const docRef = await adminDb.collection("requests").add({
    userId: auth.profile.uid,
    email:
      typeof auth.token.email === "string" && auth.token.email
        ? auth.token.email
        : typeof profile.email === "string"
          ? profile.email
          : "",
    customerName:
      typeof profile.displayName === "string" ? profile.displayName : "",
    items,
    shippingAddress: address,
    notes: notes ?? "",
    serviceSelections,
    status: "submitted",
    statusHistory: { submitted: FieldValue.serverTimestamp() },
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const body = { success: true, requestId: docRef.id };

  if (idempotencyKey) {
    await rememberIdempotentResponse(replayScope, { status: 201, body });
  }

  return NextResponse.json(body, {
    status: 201,
    headers: NO_STORE,
  });
});
