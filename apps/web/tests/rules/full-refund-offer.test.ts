/**
 * Full-refund offers under the real Firestore emulator.
 *
 * The unit suite mocks `runTransaction`, so it can prove that the offer route
 * reads and writes inside a transaction but not that Firestore serialises the
 * competing writes. Two properties depend on that:
 *
 *   1. An offer created after a partial refund quotes only what is left. The
 *      route's amount comes from `totalRefundedAmount`, which the partial
 *      refund route writes in its own transaction; a non-transactional read
 *      could quote the pre-refund balance.
 *   2. Two simultaneous acceptances of one offer produce one refund request.
 *      The acceptance transaction re-reads the request and sees the first
 *      acceptance's `refundRequest`; without it both would answer 200 and
 *      overwrite the field.
 *
 * Run with `npm run test:rules`, which wraps this file in `firebase
 * emulators:exec` and sets `FIRESTORE_EMULATOR_HOST`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT = "shipin-rules";
const EMULATOR_HOST = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT ?? 8080}`;
const CLEAR = `${EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

const REQUEST_ID = "req-offer-1";
const USER_ID = "user-1";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  recordAdminAudit: vi.fn(),
  requireAuthWithProfile: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock("@/lib/adminAudit", () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithProfile: mocks.requireAuthWithProfile,
}));

/** All writes go through the emulator; only auth and audit are faked. */
vi.mock("@/lib/firebaseAdmin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const appName = "full-refund-offer";
  const app =
    getApps().find((existing) => existing.name === appName) ??
    initializeApp({ projectId: "shipin-rules" }, appName);

  return { adminDb: getFirestore(app) };
});

import { adminDb } from "@/lib/firebaseAdmin";
import { POST as createOffer } from "@/app/api/admin/requests/[requestId]/refund-offer/route";
import { POST as acceptPartialRefund } from "@/app/api/requests/[requestId]/partial-refund/route";
import { POST as acceptFullRefund } from "@/app/api/requests/[requestId]/refund/route";

const context = (requestId = REQUEST_ID) => ({
  params: Promise.resolve({ requestId }),
});

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: JSON.stringify(body),
  });
}

async function seedPurchasedRequest(requestId = REQUEST_ID): Promise<void> {
  await adminDb.collection("requests").doc(requestId).set({
    userId: USER_ID,
    status: "purchased",
    payment: { amountPaid: 120, walletAmount: 20, paypalAmount: 100 },
    partialRefundOffer: {
      id: "partial-offer-1",
      status: "offered",
      amount: 20,
      reason: "Late delivery",
    },
  });
}

async function requestData(
  requestId = REQUEST_ID
): Promise<Record<string, unknown> | undefined> {
  const snapshot = await adminDb.collection("requests").doc(requestId).get();
  return snapshot.data();
}

async function offerAmount(requestId = REQUEST_ID): Promise<number | undefined> {
  const offer = (await requestData(requestId))?.refundOffer as
    | { amount?: number }
    | undefined;
  return offer?.amount;
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
  mocks.requireAuthWithProfile.mockReset().mockResolvedValue({
    token: { uid: USER_ID },
    profile: { uid: USER_ID, role: "customer" },
  });
});

describe("full-refund offer after a partial refund", () => {
  it("quotes only the amount the completed partial refund left behind", async () => {
    await seedPurchasedRequest();

    // The customer takes the partial refund to their wallet, which is the
    // instant path: it increments `totalRefundedAmount` and completes the
    // partial offer in one transaction.
    const partial = await acceptPartialRefund(
      post(`/api/requests/${REQUEST_ID}/partial-refund`, {
        preference: "wallet",
      }),
      context()
    );
    expect(partial.status).toBe(200);

    const afterPartial = (
      await adminDb.collection("requests").doc(REQUEST_ID).get()
    ).data();
    expect(afterPartial?.totalRefundedAmount).toBe(20);

    const offer = await createOffer(
      post(`/api/admin/requests/${REQUEST_ID}/refund-offer`, {
        reason: "Remaining balance",
      }),
      context()
    );

    expect(offer.status).toBe(200);
    await expect(offer.json()).resolves.toMatchObject({
      success: true,
      status: "refund_offered",
      refundOffer: { amount: 100 },
    });

    // 120 paid - 20 already refunded = 100, read from the post-refund document
    // inside the offer transaction.
    expect(await offerAmount()).toBe(100);
  });
});

describe("full-refund offer racing a partial refund completion", () => {
  it("never quotes a stale balance or more than remains refundable", async () => {
    const PAID = 120;
    const PARTIAL = 20;
    // Firestore picks the interleaving; run enough races that both the
    // "offer first" and "partial first" orders are likely to occur. Every
    // order must satisfy the same post-condition.
    const RACES = 8;

    for (let index = 0; index < RACES; index += 1) {
      const requestId = `req-offer-race-${index}`;
      await seedPurchasedRequest(requestId);

      const [partial, offer] = await Promise.all([
        acceptPartialRefund(
          post(`/api/requests/${requestId}/partial-refund`, {
            preference: "wallet",
          }),
          context(requestId)
        ),
        createOffer(
          post(`/api/admin/requests/${requestId}/refund-offer`, {
            reason: "Remaining balance",
          }),
          context(requestId)
        ),
      ]);

      // The customer's acceptance always wins its own transaction, whether or
      // not the admin's offer transaction got there first.
      expect(partial.status).toBe(200);

      const data = (await requestData(requestId)) ?? {};
      const totalRefunded = Number(data.totalRefundedAmount ?? 0);
      const remaining = PAID - totalRefunded;
      const offerDoc = data.refundOffer as
        | { offered?: boolean; amount?: number }
        | undefined;

      expect(totalRefunded).toBe(PARTIAL);
      expect(data.partialRefundOffer).toMatchObject({
        status: "completed",
        amount: PARTIAL,
      });
      // Exactly one partial refund was recorded: a transaction retry must not
      // credit the wallet twice either.
      expect(data.partialRefunds).toHaveLength(1);

      if (offer.status === 200) {
        // The partial refund committed first, so the offer must have read the
        // new total inside its transaction and quoted 120 - 20 = 100.
        const body = (await offer.json()) as {
          refundOffer?: { amount?: number };
        };

        expect(body.refundOffer?.amount).toBe(PAID - PARTIAL);
        expect(offerDoc).toMatchObject({
          offered: true,
          amount: PAID - PARTIAL,
        });
        expect(data.status).toBe("refund_offered");
      } else {
        // The offer transaction read the request while the partial refund was
        // still pending, so it refused instead of quoting the pre-refund 120.
        expect(offer.status).toBe(400);
        const body = (await offer.json()) as { error?: string };
        expect(body.error).toMatch(/partial refund is still pending/i);
        expect(offerDoc).toBeUndefined();
        expect(data.status).toBe("purchased");
      }

      if (offerDoc?.offered) {
        // The invariant the race must never break: the quoted amount is the
        // balance left after every refund that has completed, never the amount
        // paid and never a pre-refund snapshot of it.
        expect(offerDoc.amount).toBe(remaining);
        expect(offerDoc.amount).toBeLessThanOrEqual(remaining);
        expect(offerDoc.amount).toBeLessThan(PAID);
      }
    }
  }, 60_000);
});

describe("concurrent acceptance of one full-refund offer", () => {
  it("records one refund request when both acceptances race", async () => {
    await adminDb.collection("requests").doc(REQUEST_ID).set({
      userId: USER_ID,
      status: "refund_offered",
      payment: { amountPaid: 120, walletAmount: 20, paypalAmount: 100 },
      totalRefundedAmount: 20,
      partialRefunds: [
        {
          id: "partial-1",
          amount: 20,
          method: "wallet",
          walletRefundAmount: 20,
          paypalRefundAmount: 0,
        },
      ],
      partialRefundOffer: { status: "completed", amount: 20 },
      refundOffer: {
        offered: true,
        amount: 100,
        reason: "Remaining balance",
      },
    });

    const accept = () =>
      acceptFullRefund(
        post(`/api/requests/${REQUEST_ID}/refund`, { preference: "wallet" }),
        context()
      );

    const [first, second] = await Promise.all([accept(), accept()]);

    // One transaction wins; the other re-reads inside its own and sees the
    // first `refundRequest`, so it must refuse rather than record a second.
    expect([first.status, second.status].sort()).toEqual([200, 400]);

    const loser = first.status === 400 ? first : second;
    const refusal = (await loser.json()) as { code?: string; error?: string };

    // Either refusal is correct: a loser that re-reads after the winner commits
    // sees `refund_requested` first, while one that only saw the new
    // `refundRequest` reports the duplicate directly. What matters is that it
    // is a typed 400 and no second request is recorded.
    expect(refusal.code).toBe("BAD_REQUEST");
    expect(refusal.error).toMatch(
      /refund request already exists|purchased order or an active refund offer/
    );

    const data = (
      await adminDb.collection("requests").doc(REQUEST_ID).get()
    ).data();

    expect(data?.status).toBe("refund_requested");
    expect(data?.refundRequest).toMatchObject({
      status: "requested",
      preference: "wallet",
      amount: 100,
      walletAmount: 100,
      paypalAmount: 0,
    });
    expect(data?.["statusHistory"]?.refund_requested).toBeDefined();
  });
});
