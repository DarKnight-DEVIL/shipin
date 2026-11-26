/**
 * PayPal refund registry under real Firestore transactions.
 *
 * The unit suite for both refund routes mocks `runTransaction`, so it can only
 * prove that a registry document is read and written — not that Firestore
 * actually serialises two refunds claiming the same PayPal transaction id.
 * That property is the whole reason the registry exists, so it is tested here
 * against the emulator, driving the real route handlers.
 *
 * Each test seeds a full-refund request and a partial-refund request. The
 * registry cases run both handlers with the same `transactionId`: exactly one
 * may win and the other has to answer 409 and leave its request untouched. The
 * partial-completion case below does the same to one accepted offer twice, and
 * the loser has to answer 400 rather than 500.
 *
 * Run with `npm run test:rules`, which wraps this file in `firebase
 * emulators:exec` and sets `FIRESTORE_EMULATOR_HOST`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT = "shipin-rules";
const EMULATOR_HOST = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT ?? 8080}`;
const CLEAR = `${EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

const TRANSACTION_ID = "TX-RACE-1";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock("@/lib/adminAudit", () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

/**
 * The routes' `adminDb` is the emulator's Firestore, not the production
 * project. The Admin SDK bypasses security rules in the emulator, exactly as it
 * does in production, so no rules fixture is needed for these writes.
 */
vi.mock("@/lib/firebaseAdmin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  // The project id is inlined: `vi.mock` factories are hoisted above the
  // module-level constants, so referencing `PROJECT` here is a TDZ error.
  const appName = "refund-registry-race";
  const app =
    getApps().find((existing) => existing.name === appName) ??
    initializeApp({ projectId: "shipin-rules" }, appName);

  return { adminDb: getFirestore(app) };
});

import { adminDb } from "@/lib/firebaseAdmin";
import { stableHash } from "@/lib/stableHash";
import { POST as completeFullRefund } from "@/app/api/admin/requests/[requestId]/refund/paypal/route";
import { POST as completePartialRefund } from "@/app/api/admin/requests/[requestId]/partial-refund/complete/route";

const context = (requestId: string) => ({
  params: Promise.resolve({ requestId }),
});

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: "Bearer admin-token" },
    body: JSON.stringify(body),
  });
}

/**
 * `req-full` is ready for the full-refund route (PayPal portion 100, wallet
 * already settled); `req-partial` has an accepted offer the partial route can
 * complete. Both can pay out the same amount, so nothing but the registry
 * decides between them.
 */
async function seedRequests(): Promise<void> {
  await adminDb.collection("requests").doc("req-full").set({
    userId: "user-1",
    status: "refund_requested",
    refundRequest: {
      status: "requested",
      preference: "original_sources",
      amount: 100,
      walletAmount: 0,
      paypalAmount: 100,
      walletStatus: "completed",
    },
  });

  await adminDb.collection("requests").doc("req-partial").set({
    userId: "user-1",
    payment: { walletAmount: 0, paypalAmount: 100 },
    partialRefundOffer: {
      status: "accepted",
      selectedMethod: "original_payment",
      amount: 40,
      reason: "Late delivery",
    },
  });
}

/** Every place a PayPal transaction id is stored on a request document. */
function recordedTransactionIds(data: Record<string, unknown>): string[] {
  const refund = data.refundRequest as
    | { paypalRefundTransactionId?: unknown }
    | undefined;
  const offer = data.partialRefundOffer as
    | { paypalRefundTransactionId?: unknown }
    | undefined;
  const refunds = Array.isArray(data.partialRefunds)
    ? (data.partialRefunds as Array<{ paypalRefundTransactionId?: unknown }>)
    : [];

  return [refund?.paypalRefundTransactionId, offer?.paypalRefundTransactionId]
    .concat(refunds.map((entry) => entry?.paypalRefundTransactionId))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
    throw new Error(
      "Firestore emulator is not configured. Run this suite with `npm run test:rules`."
    );
  }
});

beforeEach(async () => {
  const cleared = await fetch(CLEAR, { method: "DELETE" });
  expect(cleared.status).toBe(200);

  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", email: "admin@shipin.test" });
  mocks.getAdminAuthError
    .mockReset()
    .mockReturnValue({ status: 401, error: "Authentication required." });
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);

  await seedRequests();
});

describe("PayPal refund registry", () => {
  it("lets exactly one of two simultaneous refunds claim the same transaction", async () => {
    const [full, partial] = await Promise.all([
      completeFullRefund(
        post(`/api/admin/requests/req-full/refund/paypal`, {
          amount: 100,
          transactionId: TRANSACTION_ID,
        }),
        context("req-full")
      ),
      completePartialRefund(
        post(`/api/admin/requests/req-partial/partial-refund/complete`, {
          paypalRefundTransactionId: TRANSACTION_ID,
        }),
        context("req-partial")
      ),
    ]);

    expect([full.status, partial.status].sort()).toEqual([200, 409]);

    const loser = full.status === 409 ? full : partial;
    await expect(loser.json()).resolves.toMatchObject({
      code: "DUPLICATE_TRANSACTION",
    });

    // One transaction id, one registry document: the loser's reservation never
    // landed.
    const registry = await adminDb
      .collection("paypalRefundTransactions")
      .get();
    expect(registry.docs.map((doc) => doc.id)).toEqual([
      stableHash(TRANSACTION_ID),
    ]);

    // And only the winning request carries the id.
    const requests = await Promise.all([
      adminDb.collection("requests").doc("req-full").get(),
      adminDb.collection("requests").doc("req-partial").get(),
    ]);
    const recorded = requests.filter((snapshot) =>
      recordedTransactionIds(snapshot.data() ?? {}).includes(TRANSACTION_ID)
    );
    expect(recorded).toHaveLength(1);
  });

  it("rejects a partial refund reusing a transaction the full-refund route recorded", async () => {
    const full = await completeFullRefund(
      post(`/api/admin/requests/req-full/refund/paypal`, {
        amount: 100,
        transactionId: TRANSACTION_ID,
      }),
      context("req-full")
    );
    expect(full.status).toBe(200);

    const partial = await completePartialRefund(
      post(`/api/admin/requests/req-partial/partial-refund/complete`, {
        paypalRefundTransactionId: TRANSACTION_ID,
      }),
      context("req-partial")
    );

    expect(partial.status).toBe(409);
    await expect(partial.json()).resolves.toMatchObject({
      code: "DUPLICATE_TRANSACTION",
    });

    // The losing route wrote nothing, so the offer is still completable with a
    // real PayPal transaction id.
    const offer = (
      await adminDb.collection("requests").doc("req-partial").get()
    ).data()?.partialRefundOffer;
    expect(offer).toMatchObject({ status: "accepted" });
    expect(offer?.paypalRefundTransactionId).toBeUndefined();

    expect(
      (await adminDb.collection("paypalRefundTransactions").get()).size
    ).toBe(1);
  });

  it("rejects a full refund reusing a transaction the partial route recorded", async () => {
    const partial = await completePartialRefund(
      post(`/api/admin/requests/req-partial/partial-refund/complete`, {
        paypalRefundTransactionId: TRANSACTION_ID,
      }),
      context("req-partial")
    );
    expect(partial.status).toBe(200);

    const full = await completeFullRefund(
      post(`/api/admin/requests/req-full/refund/paypal`, {
        amount: 100,
        transactionId: TRANSACTION_ID,
      }),
      context("req-full")
    );

    expect(full.status).toBe(409);

    const refund = (
      await adminDb.collection("requests").doc("req-full").get()
    ).data()?.refundRequest;
    expect(refund?.paypalRefundStatus).not.toBe("completed");
    expect(refund?.paypalRefundTransactionId).toBeUndefined();
  });
});

describe("partial refund completion", () => {
  it("completes one of two simultaneous completions of the same offer", async () => {
    // Two distinct PayPal refund ids: the offer itself is the only thing that
    // can serialise these two, so a missing state check would pay out twice.
    const complete = (transactionId: string) =>
      completePartialRefund(
        post(`/api/admin/requests/req-partial/partial-refund/complete`, {
          paypalRefundTransactionId: transactionId,
        }),
        context("req-partial")
      );

    const [first, second] = await Promise.all([
      complete("TX-OFFER-A"),
      complete("TX-OFFER-B"),
    ]);

    // The loser must be a typed refusal, not the 500 that a plain `Error`
    // thrown inside the transaction used to produce.
    expect([first.status, second.status].sort()).toEqual([200, 400]);

    const loser = first.status === 400 ? first : second;
    await expect(loser.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      error: "This partial refund is not awaiting admin processing.",
    });

    // One refund recorded, one amount, one transaction id - and no wallet
    // ledger entry, since this offer has no wallet portion.
    const data = (
      await adminDb.collection("requests").doc("req-partial").get()
    ).data();
    expect(data?.partialRefunds).toHaveLength(1);
    expect(data?.totalRefundedAmount).toBe(40);
    expect(data?.partialRefundOffer).toMatchObject({ status: "completed" });

    // The id is stored on both the offer and the refund entry, so compare
    // distinct ids: exactly one PayPal transaction was recorded.
    expect([...new Set(recordedTransactionIds(data ?? {}))]).toHaveLength(1);

    expect(
      (await adminDb.collection("paypalRefundTransactions").get()).size
    ).toBe(1);
    expect((await adminDb.collection("walletTransactions").get()).size).toBe(0);
  });
});
