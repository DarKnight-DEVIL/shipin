// @vitest-environment node

/**
 * `POST /api/admin/payments/reconcile` — the daily PayPal ↔ Firestore check.
 *
 * The endpoint exists because a capture can complete at PayPal while the
 * request never learns about it. Two properties decide whether it is useful or
 * harmful: it must flag every real disagreement, and it must not invent one.
 * The "request moved past paid" case is the one that matters most — a request
 * status advances to warehouse/shipped/delivered on its normal lifecycle, so a
 * check keyed on `status === "paid"` would report every shipped order as drift
 * and the report would be ignored within a week.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

interface FakeDoc {
  id: string;
  fields: Record<string, unknown>;
}

interface FakeFilter {
  field: string;
  op: string;
  value: unknown;
}

const mocks = vi.hoisted(() => {
  const state = {
    orders: [] as FakeDoc[],
    requests: [] as FakeDoc[],
    topups: [] as FakeDoc[],
    transactions: [] as FakeDoc[],
    writes: [] as Array<{ path: string; value: Record<string, unknown> }>,
    /** `system/*` documents, which is where the last verdict is stored. */
    system: {} as Record<string, Record<string, unknown>>,
  };

  /** Firestore field paths are dotted: `payment.paidAt` is nested, not a key. */
  const readPath = (doc: FakeDoc | undefined, path: string): unknown =>
    path.split(".").reduce<unknown>((value, key) => {
      if (typeof value !== "object" || value === null) return undefined;
      return (value as Record<string, unknown>)[key];
    }, doc?.fields);

  const snapshotOf = (doc: FakeDoc | undefined) => ({
    id: doc?.id,
    exists: doc !== undefined,
    get: (path: string) => readPath(doc, path),
    data: () => doc?.fields,
  });

  const timeOf = (value: unknown): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "object" && value !== null && "toDate" in value) {
      return ((value as { toDate: () => Date }).toDate() ?? new Date(0)).getTime();
    }
    return new Date(String(value)).getTime();
  };

  type FakeQuery = {
    where: (field: string, op: string, value: unknown) => FakeQuery;
    orderBy: (field: string, direction?: string) => FakeQuery;
    limit: (count: number) => FakeQuery;
    startAfter: (value: unknown) => FakeQuery;
    get: () => Promise<{
      size: number;
      docs: ReturnType<typeof snapshotOf>[];
    }>;
  };

  const collection = (name: string) => {
    const rows = (): FakeDoc[] =>
      name === "paypalPaymentOrders"
        ? state.orders
        : name === "requests"
          ? state.requests
          : name === "walletTopupOrders"
            ? state.topups
            : name === "walletTransactions"
              ? state.transactions
              : [];

    const filters: FakeFilter[] = [];

    const matches = (row: FakeDoc): boolean =>
      filters.every(({ field, op, value }) => {
        const actual = readPath(row, field);
        if (op === "==") return actual === value;
        if (op === ">=") return timeOf(actual) >= timeOf(value);
        return true;
      });

    const query: FakeQuery = {
      where: (field, op, value) => {
        filters.push({ field, op, value });
        return query;
      },
      orderBy: () => query,
      limit: () => query,
      startAfter: () => query,
      get: async () => {
        const matched = rows().filter(matches);
        return { size: matched.length, docs: matched.map(snapshotOf) };
      },
    };

    return {
      ...query,
      doc: (id?: string) => ({
        id,
        path: `${name}/${id ?? "generated"}`,
        get: async () => {
          if (name === "system") {
            const stored = id ? state.system[id] : undefined;
            return snapshotOf(
              stored ? { id: id as string, fields: stored } : undefined
            );
          }
          return snapshotOf(rows().find((row) => row.id === id));
        },
        set: async (value: Record<string, unknown>) => {
          state.writes.push({ path: `${name}/${id ?? "generated"}`, value });
          if (name === "system" && id) state.system[id] = value;
        },
      }),
    };
  };

  return { state, collection };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection },
}));

import { POST } from "./route";

const SECRET = "cron-secret-value";
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function completedOrder(overrides: Partial<FakeDoc["fields"]> = {}, id = "ORDER-1") {
  mocks.state.orders.push({
    id,
    fields: {
      orderId: id,
      requestId: "req-1",
      userId: "user-1",
      paymentType: "main",
      status: "completed",
      captureId: "CAPTURE-1",
      paypalAmount: 104.92,
      completedAt: daysAgo(1),
      ...overrides,
    },
  });
}

function paidRequest(
  overrides: Partial<FakeDoc["fields"]> = {},
  id = "req-1"
) {
  mocks.state.requests.push({
    id,
    fields: {
      status: "paid",
      payment: {
        provider: "paypal",
        orderId: "ORDER-1",
        captureId: "CAPTURE-1",
        status: "completed",
        paidAt: daysAgo(1),
      },
      ...overrides,
    },
  });
}

const STALE_MINUTES = 30;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function topupOrder(
  overrides: Partial<FakeDoc["fields"]> = {},
  id = "TOPUP-1"
) {
  mocks.state.topups.push({
    id,
    fields: {
      userId: "user-1",
      amount: 50,
      currency: "USD",
      orderId: id,
      status: "completed",
      captureId: "CAPTURE-TOPUP-1",
      capturedAmount: 50,
      capturePending: false,
      completedAt: daysAgo(1),
      ...overrides,
    },
  });
}

function topupCredit(captureId = "CAPTURE-TOPUP-1") {
  mocks.state.transactions.push({
    id: captureId,
    fields: { userId: "user-1", type: "deposit", amount: 50, captureId },
  });
}

function signedRequest(query = ""): NextRequest {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${timestamp}|`)
    .digest("hex");

  return new NextRequest(
    `http://localhost/api/admin/payments/reconcile${query}`,
    {
      method: "POST",
      headers: {
        "x-cron-timestamp": timestamp,
        "x-cron-signature": signature,
      },
    }
  );
}

beforeEach(() => {
  mocks.state.orders = [];
  mocks.state.requests = [];
  mocks.state.topups = [];
  mocks.state.transactions = [];
  mocks.state.writes = [];
  mocks.state.system = {};
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/admin/payments/reconcile — auth", () => {
  it("refuses a caller that cannot sign the request", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/payments/reconcile", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.state.writes).toHaveLength(0);
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIG_ERROR",
    });
  });

  it("rejects a signature made with a different secret", async () => {
    const timestamp = String(Date.now());
    const signature = crypto
      .createHmac("sha256", "not-the-secret")
      .update(`${timestamp}|`)
      .digest("hex");

    const response = await POST(
      new NextRequest("http://localhost/api/admin/payments/reconcile", {
        method: "POST",
        headers: {
          "x-cron-timestamp": timestamp,
          "x-cron-signature": signature,
        },
      })
    );

    expect(response.status).toBe(401);
  });
});

describe("POST /api/admin/payments/reconcile — agreement", () => {
  it("reports nothing when the order and the request match", async () => {
    completedOrder();
    paidRequest();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drift).toEqual([]);
    expect(body.checked).toEqual({
      completedOrders: 1,
      paypalPaidRequests: 1,
      completedTopups: 0,
      pendingTopups: 0,
    });
  });

  it("does not flag a request that moved past paid on its normal lifecycle", async () => {
    // This is the case a naive `status === "paid"` check gets wrong: the
    // shipment advanced to warehouse_received, the payment did not change.
    completedOrder();
    paidRequest({ status: "warehouse_received" });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("ignores a wallet-only payment, which has no PayPal order", async () => {
    // The payment block mirrors what processWalletPayment writes, including
    // the sentinel orderId: "wallet" — truthy, so a guard on orderId alone
    // would look up paypalPaymentOrders/wallet and report drift.
    mocks.state.requests.push({
      id: "req-wallet",
      fields: {
        status: "paid",
        payment: {
          provider: "wallet",
          paymentMethod: "wallet",
          orderId: "wallet",
          captureId: null,
          status: "completed",
          paidAt: daysAgo(1),
        },
      },
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("ignores a wallet-only payment even when the provider field is missing", async () => {
    // Legacy records may carry only paymentMethod; either field must suffice.
    mocks.state.requests.push({
      id: "req-wallet-legacy",
      fields: {
        status: "paid",
        payment: {
          paymentMethod: "wallet",
          orderId: "wallet",
          status: "completed",
          paidAt: daysAgo(1),
        },
      },
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });
});

/**
 * Erasure and refunds change a request without changing what PayPal captured.
 * Neither may turn a settled order into permanent drift: the report would then
 * list every erased customer and every refunded order on every run, which is
 * how a report stops being read.
 *
 * Both cases are safe because the *payment record* survives — erasure
 * anonymises around it, and a refund writes `refundRequest.*` while the capture
 * stays `completed` at PayPal (the `PAYMENT.CAPTURE.REFUNDED` event is
 * acknowledged, not processed). The last case proves that, by removing the
 * payment block from an otherwise identical erased request.
 */
describe("POST /api/admin/payments/reconcile — erasure and refunds", () => {
  it("does not flag an erased request, which keeps its payment record", async () => {
    completedOrder();
    paidRequest({
      email: "deleted@user.local",
      customerName: "Deleted User",
      erasureRequestId: "erasure-1",
      erasedAt: daysAgo(2),
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ drift: [] });
  });

  it("does not flag a refunded request", async () => {
    completedOrder();
    paidRequest({
      status: "refunded",
      refundRequest: {
        status: "completed",
        paypalRefundStatus: "completed",
        paypalRefundAmount: 100,
      },
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ drift: [] });
  });

  it("still flags an erased request whose payment block was removed", async () => {
    // The cases above pass because the payment survives, not because the check
    // skips erased or refunded requests.
    completedOrder();
    paidRequest({ erasureRequestId: "erasure-1", payment: undefined });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift).toEqual([
      expect.objectContaining({
        kind: "order_completed_request_not_settled",
        orderId: "ORDER-1",
        requestId: "req-1",
      }),
    ]);
  });
});

/**
 * A window is a scan, not a lifetime: drift that was reported once and never
 * fixed used to go green the morning it aged out of the seven-day window, with
 * nobody having resolved it. An open case is carried forward and re-derived
 * from the documents on every run until it is settled.
 */
describe("POST /api/admin/payments/reconcile — unresolved drift", () => {
  it("keeps reporting a pair after it leaves the window, until it is settled", async () => {
    completedOrder({ completedAt: daysAgo(1) });
    paidRequest({ status: "awaiting_payment", payment: undefined });

    const first = await POST(signedRequest());
    const firstBody = await first.json();

    expect(first.status).toBe(409);
    expect(firstBody.drift).toHaveLength(1);
    const firstSeen = firstBody.drift[0].firstSeenAt;
    expect(firstSeen).toBeTruthy();

    // Over a month later the order is well outside the default window, so the
    // scan alone would find nothing. The case is still open, so it still reports.
    mocks.state.orders[0].fields.completedAt = daysAgo(30);

    const second = await POST(signedRequest());
    const secondBody = await second.json();

    expect(second.status).toBe(409);
    expect(secondBody.code).toBe("PAYMENT_DRIFT");
    expect(secondBody.carriedForward).toBe(1);
    expect(secondBody.checked).toEqual({
      completedOrders: 0,
      paypalPaidRequests: 0,
      completedTopups: 0,
      pendingTopups: 0,
    });
    expect(secondBody.drift).toEqual([
      expect.objectContaining({
        kind: "order_completed_request_not_settled",
        orderId: "ORDER-1",
        requestId: "req-1",
      }),
    ]);
    // Age is preserved, so an operator sees a month-old case, not a new one.
    expect(secondBody.drift[0].firstSeenAt).toBe(firstSeen);

    // Settle it the way a replay would, then the next run must clear it.
    mocks.state.requests[0].fields.payment = {
      provider: "paypal",
      orderId: "ORDER-1",
      captureId: "CAPTURE-1",
      status: "completed",
      paidAt: daysAgo(30),
    };

    const third = await POST(signedRequest());
    const thirdBody = await third.json();

    expect(third.status).toBe(200);
    expect(thirdBody.drift).toEqual([]);
    expect(thirdBody.carriedForward).toBe(0);
    // The stored verdict no longer lists it either.
    expect(mocks.state.system.paymentReconciliation.drift).toEqual([]);
  });

  it("drops a carried case whose order no longer exists", async () => {
    completedOrder({ completedAt: daysAgo(1) });
    paidRequest({ status: "awaiting_payment", payment: undefined });

    expect((await POST(signedRequest())).status).toBe(409);

    // Order purged (or never stored) and outside the window: nothing is left to
    // compare, so the open case is closed rather than reported forever.
    mocks.state.orders = [];

    const second = await POST(signedRequest());

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ drift: [] });
  });
});

describe("POST /api/admin/payments/reconcile — drift", () => {
  it("flags a completed capture the request never settled", async () => {
    completedOrder();
    paidRequest({ status: "awaiting_payment", payment: undefined });

    const response = await POST(signedRequest());
    const body = await response.json();

    // 409 so the scheduled run goes red and the cron alert fires.
    expect(response.status).toBe(409);
    expect(body.code).toBe("PAYMENT_DRIFT");
    expect(body.drift).toEqual([
      expect.objectContaining({
        kind: "order_completed_request_not_settled",
        orderId: "ORDER-1",
        requestId: "req-1",
      }),
    ]);
    expect(console.error).toHaveBeenCalled();
  });

  it("flags a completed order whose request no longer exists", async () => {
    completedOrder();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "order_completed_request_missing",
      orderId: "ORDER-1",
    });
  });

  it("flags a completed order that names no request at all", async () => {
    completedOrder({ requestId: undefined });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({ kind: "order_without_request" });
  });

  it("flags an add-on capture the request never recorded", async () => {
    completedOrder({
      paymentType: "additional_item",
      additionalItemRequestId: "addon-1",
    });
    paidRequest({ additionalPayments: [] });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "order_completed_addon_not_settled",
      requestId: "req-1",
    });
  });

  it("accepts an add-on capture that settled", async () => {
    completedOrder({
      paymentType: "additional_item",
      additionalItemRequestId: "addon-1",
    });
    paidRequest({
      additionalPayments: [
        { additionalItemRequestId: "addon-1", status: "completed" },
      ],
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("flags a request that is paid against an order that never completed", async () => {
    // The order exists but is still "created": the request believes it is paid.
    mocks.state.orders.push({
      id: "ORDER-1",
      fields: {
        requestId: "req-1",
        status: "created",
        completedAt: daysAgo(1),
      },
    });
    paidRequest();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "request_paid_order_not_completed",
      orderId: "ORDER-1",
    });
  });

  it("flags a request pointing at an order that was never stored", async () => {
    paidRequest({
      payment: {
        provider: "paypal",
        orderId: "ORDER-GHOST",
        status: "completed",
        paidAt: daysAgo(1),
      },
    });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "request_paid_order_missing",
      orderId: "ORDER-GHOST",
    });
  });
});

describe("POST /api/admin/payments/reconcile — window and summary", () => {
  it("only compares the window it was asked for", async () => {
    // 20 days old and genuinely drifted: outside the default week, inside an
    // explicit 30-day sweep. The request has no payment block at all, so the
    // only reason the default run is clean is the window.
    completedOrder({ completedAt: daysAgo(20) });
    mocks.state.requests.push({
      id: "req-1",
      fields: { status: "awaiting_payment" },
    });

    const defaults = await POST(signedRequest());
    expect(defaults.status).toBe(200);

    const widened = await POST(signedRequest("?days=30"));
    expect(widened.status).toBe(409);
  });

  it("clamps an oversized window instead of scanning everything", async () => {
    // 120 days old and drifted: outside the 90-day cap even when the caller
    // asks for a year, so an unclamped window would answer 409 here.
    completedOrder({ completedAt: daysAgo(120) });
    mocks.state.requests.push({
      id: "req-1",
      fields: { status: "awaiting_payment" },
    });

    const response = await POST(signedRequest("?days=365"));

    expect(response.status).toBe(200);
  });

  it("stores the last verdict so it survives the run history", async () => {
    completedOrder();
    paidRequest();

    await POST(signedRequest());

    expect(mocks.state.writes).toEqual([
      expect.objectContaining({
        path: "system/paymentReconciliation",
        value: expect.objectContaining({
          windowDays: 7,
          driftCount: 0,
          checked: {
            completedOrders: 1,
            paypalPaidRequests: 1,
            completedTopups: 0,
            pendingTopups: 0,
          },
          truncated: false,
        }),
      }),
    ]);
  });

  it("falls back to the default window for an unusable ?days value", async () => {
    completedOrder({ completedAt: daysAgo(1) });
    paidRequest();

    const response = await POST(signedRequest("?days=soon"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.windowDays).toBe(7);
  });
});

describe("POST /api/admin/payments/reconcile — defensive reads", () => {
  it("reads every stored firstSeenAt shape and ignores junk entries", async () => {
    const seen = new Date("2026-01-01T00:00:00Z");
    const caseFor = (orderId: string, firstSeenAt: unknown) => ({
      kind: "order_without_request",
      orderId,
      requestId: "",
      firstSeenAt,
    });

    mocks.state.system.paymentReconciliation = {
      drift: [
        caseFor("gone-date", seen),
        caseFor("gone-timestamp", { toDate: () => seen }),
        caseFor("gone-invalid-timestamp", { toDate: () => ({}) }),
        caseFor("gone-non-function", { toDate: 42 }),
        caseFor("gone-no-to-date", { noDate: true }),
        caseFor("gone-string", "2026-01-01"),
        caseFor("gone-null", null),
        null,
        "junk",
      ],
    };

    const response = await POST(signedRequest());

    // None of the orders exist any more, so every case closes cleanly.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ drift: [] });
  });

  it("caps the scan at ten pages and reports truncation", async () => {
    for (let index = 0; index < 200; index += 1) {
      completedOrder({ requestId: `req-${index}` }, `ORDER-${index}`);
      mocks.state.requests.push({
        id: `req-${index}`,
        fields: {
          payment: {
            orderId: `ORDER-${index}`,
            status: "completed",
            paidAt: daysAgo(1),
          },
        },
      });
    }

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(true);
    // Ten pages of the same 200 rows: the cap is the retry story, and the flag
    // tells the operator the scan did not reach the end of the window.
    expect(body.checked).toEqual({
      completedOrders: 2000,
      paypalPaidRequests: 2000,
      completedTopups: 0,
      pendingTopups: 0,
    });
  });

  it("does not invent a capture id for an order that has none", async () => {
    completedOrder({ captureId: undefined });
    paidRequest({ status: "awaiting_payment", payment: undefined });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].detail).toContain("captured order is not reflected");
    expect(body.drift[0].detail).toContain("no payment block");
  });

  it("describes an unrecognised payment block without guessing fields", async () => {
    completedOrder();
    paidRequest({ payment: { paidAt: daysAgo(1) } });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].detail).toContain(
      "payment.orderId=unset, status=unset"
    );
  });

  it("names an order with no status as unset", async () => {
    mocks.state.orders.push({ id: "ORDER-1", fields: { requestId: "req-1" } });
    paidRequest();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "request_paid_order_not_completed",
      orderId: "ORDER-1",
    });
    expect(body.drift[0].detail).toContain('"unset"');
  });

  it("handles an add-on with no item id and junk payment entries", async () => {
    completedOrder({
      paymentType: "additional_item",
      additionalItemRequestId: undefined,
    });
    paidRequest({ additionalPayments: ["junk", null] });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "order_completed_addon_not_settled",
    });
    expect(body.drift[0].detail).toContain("add-on (unknown)");
  });
});

/**
 * Wallet top-ups are a separate collection and ledger convention from request
 * payments. Before this, `capturePending` was written and never read: a charge
 * whose credit failed was invisible to every job in the repo.
 */
describe("POST /api/admin/payments/reconcile — wallet top-ups", () => {
  it("accepts a completed top-up whose credit exists", async () => {
    topupOrder();
    topupCredit();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drift).toEqual([]);
    expect(body.checked).toMatchObject({
      completedTopups: 1,
      pendingTopups: 0,
    });
  });

  it("flags a completed top-up with no wallet credit", async () => {
    topupOrder();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift).toEqual([
      expect.objectContaining({
        kind: "topup_completed_uncredited",
        orderId: "TOPUP-1",
        requestId: "",
      }),
    ]);
  });

  it("flags a completed top-up whose capture id is missing", async () => {
    topupOrder({ captureId: undefined });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "topup_completed_unverifiable",
      orderId: "TOPUP-1",
    });
  });

  it("does not flag a capture that is still in flight", async () => {
    topupOrder({
      status: "created",
      captureId: undefined,
      capturePending: true,
      captureStartedAt: minutesAgo(5),
      completedAt: undefined,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
  });

  it("flags a capturePending order with no credit after the window", async () => {
    topupOrder({
      status: "created",
      capturePending: true,
      captureStartedAt: minutesAgo(STALE_MINUTES + 1),
      completedAt: undefined,
    });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0]).toMatchObject({
      kind: "topup_capture_pending_uncredited",
      orderId: "TOPUP-1",
    });
    expect(body.drift[0].detail).toContain("may have succeeded at PayPal");
  });

  it("flags a stale pending capture whose credit already landed", async () => {
    topupOrder({
      status: "created",
      capturePending: true,
      captureStartedAt: minutesAgo(STALE_MINUTES + 1),
      completedAt: undefined,
    });
    topupCredit();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].kind).toBe("topup_capture_pending_uncredited");
    expect(body.drift[0].detail).toContain("never marked complete");
  });

  it("flags a stale pending capture with no capture id", async () => {
    topupOrder({
      status: "created",
      captureId: undefined,
      capturePending: true,
      captureStartedAt: minutesAgo(STALE_MINUTES + 1),
      completedAt: undefined,
    });

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.drift[0].detail).toContain("cannot be reconciled");
  });

  it("flags a capturePending flag with no start time instead of trusting it", async () => {
    topupOrder({
      status: "created",
      capturePending: true,
      captureStartedAt: undefined,
      completedAt: undefined,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(409);
  });

  it("stops reporting a top-up case once its credit lands", async () => {
    topupOrder({
      status: "created",
      capturePending: true,
      captureStartedAt: minutesAgo(STALE_MINUTES + 1),
      completedAt: undefined,
    });

    expect((await POST(signedRequest())).status).toBe(409);

    // The retry path finishes the job: credit written, order completed and the
    // flag cleared. The carried case must close rather than persist forever.
    topupCredit();
    mocks.state.topups[0].fields.status = "completed";
    mocks.state.topups[0].fields.capturePending = false;
    mocks.state.topups[0].fields.completedAt = daysAgo(1);

    const second = await POST(signedRequest());

    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      drift: [],
      carriedForward: 0,
    });
  });
});

describe("POST /api/admin/payments/reconcile — carried-case ageing", () => {
  it("keeps the age of a case the same run re-detects", async () => {
    completedOrder();
    paidRequest({ status: "awaiting_payment", payment: undefined });

    const seen = new Date("2026-01-01T00:00:00Z");
    mocks.state.system.paymentReconciliation = {
      drift: [
        {
          kind: "order_completed_request_not_settled",
          orderId: "ORDER-1",
          requestId: "req-1",
          firstSeenAt: seen,
        },
        {
          kind: "order_completed_request_not_settled",
          orderId: "ORDER-1",
          requestId: "req-1",
          firstSeenAt: null,
        },
      ],
    };

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    // Re-detected rather than carried, so the counter stays at zero…
    expect(body.carriedForward).toBe(0);
    // …but the original age is kept instead of resetting to this run.
    expect(body.drift[0].firstSeenAt).toBe(seen.toISOString());
  });

  it("does not duplicate a carried case whose verdict the scan already reports", async () => {
    completedOrder();
    paidRequest({
      payment: { orderId: "ORDER-2", status: "completed", paidAt: daysAgo(1) },
    });
    mocks.state.system.paymentReconciliation = {
      drift: [
        {
          kind: "request_paid_order_missing",
          orderId: "GHOST",
          requestId: "req-1",
          firstSeenAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    };

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    // The scan already reports ORDER-1|req-1 and ORDER-2|req-1; re-checking the
    // GHOST case re-derives the second one and must not add it twice.
    expect(body.drift).toHaveLength(2);
    expect(body.carriedForward).toBe(0);
  });

  it("carries a fresh case with the age it was first seen", async () => {
    const seen = new Date("2026-01-01T00:00:00Z");
    mocks.state.requests.push({
      id: "req-9",
      fields: {
        payment: {
          orderId: "ORDER-9",
          status: "completed",
          // Outside the window, so only the carried case looks at it.
          paidAt: daysAgo(30),
        },
      },
    });
    mocks.state.system.paymentReconciliation = {
      drift: [
        {
          kind: "request_paid_order_missing",
          orderId: "MISSING",
          requestId: "req-9",
          firstSeenAt: seen,
        },
      ],
    };

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.carriedForward).toBe(1);
    expect(body.drift[0]).toMatchObject({
      kind: "request_paid_order_missing",
      orderId: "ORDER-9",
      requestId: "req-9",
      firstSeenAt: seen.toISOString(),
    });
  });
});

describe("POST /api/admin/payments/reconcile — an empty window", () => {
  it("says the run proved nothing about money, instead of looking clean", async () => {
    // The first production run returned 200 with driftCount 0 over a window
    // that held no wallet payments at all. Without this flag that result is
    // indistinguishable from "reconciliation passed".
    const response = await POST(signedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drift).toEqual([]);
    expect(body.checkedTotal).toBe(0);
    expect(body.noActivity).toBe(true);
  });

  it("stores the same flags, so the verdict is readable without the logs", async () => {
    await POST(signedRequest());

    expect(mocks.state.system.paymentReconciliation).toMatchObject({
      checkedTotal: 0,
      noActivity: true,
    });
  });

  it("marks a window that did check something as activity", async () => {
    completedOrder();
    paidRequest();

    const response = await POST(signedRequest());
    const body = await response.json();

    expect(body.checkedTotal).toBe(2);
    expect(body.noActivity).toBe(false);
  });
});
