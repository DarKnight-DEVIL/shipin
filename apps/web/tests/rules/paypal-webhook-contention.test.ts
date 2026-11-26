/**
 * PayPal webhook delivery under real Firestore contention.
 *
 * The unit suite for this route mocks `runTransaction`, so it can only prove what
 * the code does with the values it is handed — not that Firestore actually
 * serialises two simultaneous deliveries of the same event. That serialisation is
 * the whole point of the claim-before-process marker, so it is proven here against
 * the emulator, driving the real route handler:
 *
 *   - a duplicate delivery storm (five concurrent POSTs, one event) settles the
 *     order exactly once and debits the wallet exactly once;
 *   - two *different* events for the same order arriving together settle once,
 *     because the second delivery meets the transaction's completed check;
 *   - a fresh foreign claim answers "duplicate" without touching money;
 *   - a stale claim (its attempt died) is taken over and settles;
 *   - a delivery that fails releases its own claim, so PayPal's retry — the
 *     out-of-order case — settles exactly once afterwards.
 *
 * Only the seams that leave the machine are mocked: PayPal's signature
 * verification (an external API call), the notification sender, the error
 * reporter and the rate limiter. `adminDb` is the emulator's Firestore.
 *
 * Run with `npm run test:rules`, which wraps this file in `firebase
 * emulators:exec` and sets `FIRESTORE_EMULATOR_HOST`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PROJECT = "shipin-rules";
const EMULATOR_HOST = `http://127.0.0.1:${process.env.FIRESTORE_EMULATOR_PORT ?? 8080}`;
const CLEAR = `${EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

const mocks = vi.hoisted(() => ({
  verifyPayPalWebhook: vi.fn(),
  sendNotification: vi.fn(),
  captureServerError: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/paypal", () => ({
  verifyPayPalWebhook: mocks.verifyPayPalWebhook,
}));

vi.mock("@/features/notifications/services/notificationService", () => ({
  sendNotification: mocks.sendNotification,
}));

vi.mock("@/lib/errorTracking", () => ({
  captureServerError: mocks.captureServerError,
}));

vi.mock("@/lib/rateLimiter", () => ({
  apiRateLimiter: {
    record: async () => ({
      ok: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    }),
  },
  isRateLimited: mocks.isRateLimited,
  addRateLimitHeaders: () => {},
}));

/**
 * The routes' `adminDb` is the emulator's Firestore, not the production project.
 * The Admin SDK bypasses security rules in the emulator, exactly as it does in
 * production, so no rules fixture is needed for these writes.
 */
vi.mock("@/lib/firebaseAdmin", async () => {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const appName = "webhook-contention";
  const app =
    getApps().find((existing) => existing.name === appName) ??
    initializeApp({ projectId: "shipin-rules" }, appName);

  return { adminDb: getFirestore(app) };
});

// The route's import chain evaluates `clientEnv`, which fails without the public
// vars, and reads `PAYPAL_WEBHOOK_ID` at module scope — so both are stubbed here,
// before the dynamic import in `beforeAll`.
process.env.PAYPAL_WEBHOOK_ID = "test-webhook-id";
process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "test-client-id";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "shipin-rules";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123456";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123456:web:abcdef";

import { adminDb } from "@/lib/firebaseAdmin";

let webhookPost: typeof import("@/app/api/webhook/route").POST;

const ORDER_ID = "order-race-1";
const REQUEST_ID = "req-race-1";
const USER_ID = "user-race-1";
const CAPTURE_ID = "cap-race-1";
const EVENT_ID = "evt-race-1";

function eventBody(eventId: string, captureId: string): Record<string, unknown> {
  return {
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: captureId,
      // The capture carries the PayPal portion; the wallet part never touches PayPal.
      amount: { value: "84.70", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: ORDER_ID } },
    },
  };
}

function post(eventId: string, captureId = CAPTURE_ID): NextRequest {
  return new NextRequest("http://localhost/api/webhook", {
    method: "POST",
    headers: {
      "paypal-transmission-id": "transmission-1",
      "paypal-transmission-sig": "sig",
      "paypal-transmission-time": "2026-01-01T00:00:00Z",
      "paypal-cert-url": "https://paypal.test/cert",
      "paypal-auth-algo": "SHA256withRSA",
    },
    body: JSON.stringify(eventBody(eventId, captureId)),
  });
}

/**
 * A wallet-and-PayPal order: the webhook must debit the wallet and write one
 * ledger entry, which is what makes "settled exactly once" observable in money
 * rather than only in a status field.
 */
async function seedOrder(): Promise<void> {
  await adminDb.collection("paypalPaymentOrders").doc(ORDER_ID).set({
    status: "created",
    requestId: REQUEST_ID,
    userId: USER_ID,
    paypalAmount: 84.7,
    walletApplied: 15.3,
    totalRequired: 100,
    baseAmount: 100,
    currency: "USD",
  });

  await adminDb.collection("requests").doc(REQUEST_ID).set({
    userId: USER_ID,
    status: "awaiting_payment",
    customerName: "Contention Tester",
  });

  // 15.30 in minor units (ADR-0008): the debit under contention must land once.
  await adminDb.collection("wallets").doc(USER_ID).set({ balanceMinor: 15300 });
}

async function orderStatus(): Promise<string | undefined> {
  const snapshot = await adminDb
    .collection("paypalPaymentOrders")
    .doc(ORDER_ID)
    .get();
  return snapshot.data()?.status as string | undefined;
}

async function requestStatus(): Promise<string | undefined> {
  const snapshot = await adminDb.collection("requests").doc(REQUEST_ID).get();
  return snapshot.data()?.status as string | undefined;
}

async function walletState(): Promise<{ balanceMinor?: number; ledger: number }> {
  const wallet = await adminDb.collection("wallets").doc(USER_ID).get();
  const ledger = await adminDb
    .collection("walletTransactions")
    .where("userId", "==", USER_ID)
    .get();
  return {
    balanceMinor: wallet.data()?.balanceMinor as number | undefined,
    ledger: ledger.size,
  };
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
    throw new Error(
      "Firestore emulator is not configured. Run this suite with `npm run test:rules`."
    );
  }

  ({ POST: webhookPost } = await import("@/app/api/webhook/route"));
});

beforeEach(async () => {
  const cleared = await fetch(CLEAR, { method: "DELETE" });
  expect(cleared.status).toBe(200);

  mocks.verifyPayPalWebhook.mockReset().mockResolvedValue(true);
  mocks.sendNotification.mockReset().mockResolvedValue(undefined);
  mocks.captureServerError.mockReset().mockResolvedValue(undefined);
  mocks.isRateLimited.mockReset().mockReturnValue(false);

  await seedOrder();
});

describe("PayPal webhook delivery contention", () => {
  it("settles a duplicate delivery storm exactly once", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => webhookPost(post(EVENT_ID)))
    );

    // PayPal stops redelivering on any 2xx, so every delivery must answer 200 —
    // the first with the settlement, the rest as recognised duplicates.
    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => body.duplicate)).toHaveLength(4);

    expect(await orderStatus()).toBe("completed");
    expect(await requestStatus()).toBe("paid");

    // The money statement: exactly one debit of 15.30 (15300 -> 13770 minor),
    // exactly one ledger entry.
    const { balanceMinor, ledger } = await walletState();
    expect(balanceMinor).toBe(13_770);
    expect(ledger).toBe(1);
  });

  it("settles two different events for one order exactly once", async () => {
    // PayPal redelivers under a new event id after a 5xx; two ids, one capture.
    const [first, second] = await Promise.all([
      webhookPost(post("evt-a")),
      webhookPost(post("evt-b")),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const { balanceMinor, ledger } = await walletState();
    expect(balanceMinor).toBe(13_770);
    expect(ledger).toBe(1);
    expect(await orderStatus()).toBe("completed");
  });

  it("answers duplicate for a fresh claim held by another attempt", async () => {
    await adminDb.collection("paypalWebhookEvents").doc(EVENT_ID).set({
      status: "claimed",
      claimId: "another-attempt",
      claimedAt: Date.now(),
      eventType: "PAYMENT.CAPTURE.COMPLETED",
    });

    const response = await webhookPost(post(EVENT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
    expect(await orderStatus()).toBe("created");
    expect((await walletState()).ledger).toBe(0);
  });

  it("takes over a stale claim left by a dead attempt", async () => {
    await adminDb.collection("paypalWebhookEvents").doc(EVENT_ID).set({
      status: "claimed",
      claimId: "dead-attempt",
      claimedAt: Date.now() - 3 * 60 * 1000,
      eventType: "PAYMENT.CAPTURE.COMPLETED",
    });

    const response = await webhookPost(post(EVENT_ID));

    expect(response.status).toBe(200);
    // The takeover is a normal settlement, not a duplicate: the body carries no
    // duplicate flag at all.
    const body = (await response.json()) as { duplicate?: boolean };
    expect(body.duplicate).toBeUndefined();
    expect(await orderStatus()).toBe("completed");
    expect((await walletState()).balanceMinor).toBe(13_770);
  });

  it("releases its claim on failure, so the retry settles exactly once", async () => {
    // First delivery: the capture amount disagrees with the stored order. The
    // handler throws, the route answers 500 (PayPal will retry) and releases the
    // claim instead of marking the event processed — marking it would lose the drift.
    const bad = await webhookPost(
      new NextRequest("http://localhost/api/webhook", {
        method: "POST",
        headers: {
          "paypal-transmission-id": "t",
          "paypal-transmission-sig": "s",
          "paypal-transmission-time": "t",
          "paypal-cert-url": "c",
          "paypal-auth-algo": "a",
        },
        body: JSON.stringify({
          id: EVENT_ID,
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: {
            id: CAPTURE_ID,
            amount: { value: "99.99", currency_code: "USD" },
            supplementary_data: { related_ids: { order_id: ORDER_ID } },
          },
        }),
      })
    );

    expect(bad.status).toBe(500);

    const marker = await adminDb
      .collection("paypalWebhookEvents")
      .doc(EVENT_ID)
      .get();
    expect(marker.exists).toBe(false);

    // The retry — PayPal's redelivery of the same event, now with the amount the
    // order actually expects — settles once.
    const retry = await webhookPost(post(EVENT_ID));
    expect(retry.status).toBe(200);

    const { balanceMinor, ledger } = await walletState();
    expect(balanceMinor).toBe(13_770);
    expect(ledger).toBe(1);
    expect(await orderStatus()).toBe("completed");
  });
});
