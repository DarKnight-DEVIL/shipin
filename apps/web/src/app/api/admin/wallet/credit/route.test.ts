import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  txGet: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id?: string) => {
        if (name === "users") return { id, __kind: "user" };
        if (name === "wallets") return { id, __kind: "wallet" };
        if (name === "requests") return { id, __kind: "request" };
        return { id: id ?? "wtx-1", __kind: "wtx" };
      },
    }),
    runTransaction: mocks.runTransaction,
  },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/wallet/credit", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const snap = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

const customer = { role: "customer" };

const snapshots = (overrides: {
  customer?: Record<string, unknown> | undefined;
  wallet?: Record<string, unknown> | undefined;
  request?: Record<string, unknown> | undefined;
}) => {
  const state = {
    customer,
    wallet: { balance: 10, currency: "EUR" },
    request: undefined,
    ...overrides,
  };

  mocks.txGet.mockImplementation(async (ref: { __kind?: string }) => {
    if (ref.__kind === "user") return snap(state.customer);
    if (ref.__kind === "wallet") return snap(state.wallet);
    return snap(state.request);
  });
};

beforeEach(() => {
  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", email: "a@x.com" });
  mocks.getAdminAuthError
    .mockReset()
    .mockReturnValue({ status: 500, error: "Internal error" });
  snapshots({});
  mocks.txSet.mockReset();
  mocks.txUpdate.mockReset();
  mocks.runTransaction
    .mockReset()
    .mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ get: mocks.txGet, set: mocks.txSet, update: mocks.txUpdate })
    );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/wallet/credit", () => {
  it("passes admin auth failures through", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: "Admin access required.",
    });

    const response = await POST(
      request({ customerId: "customer-1", amount: 10 })
    );

    expect(response.status).toBe(403);
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("maps a known auth message reported as 500", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));

    const response = await POST(
      request({ customerId: "customer-1", amount: 10 })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Internal error",
    });
  });

  it("rejects a blank customer id", async () => {
    const response = await POST(request({ customerId: "   ", amount: 10 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Invalid request body.",
    });
  });

  it("requires a positive amount", async () => {
    const zero = await POST(request({ customerId: "customer-1", amount: 0 }));
    const bad = await POST(
      request({ customerId: "customer-1", amount: "abc" })
    );

    expect([zero.status, bad.status]).toEqual([400, 400]);
  });

  it("caps a single credit at 10,000 by default", async () => {
    const response = await POST(
      request({ customerId: "customer-1", amount: 10001 })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "CREDIT_LIMIT_EXCEEDED",
      limit: 10000,
      error: "A maximum of 10,000 credits can be added at once.",
    });
  });

  it("allows exactly the limit", async () => {
    const response = await POST(
      request({ customerId: "customer-1", amount: 10000 })
    );

    // A rail that also rejects the limit itself is off by one for whoever reads it.
    expect(response.status).not.toBe(400);
  });

  it("uses the configured limit, and says which one applied", async () => {
    vi.stubEnv("WALLET_CREDIT_MAX", "25000");

    try {
      const over = await POST(
        request({ customerId: "customer-1", amount: 25001 })
      );
      const body = await over.json();

      expect(over.status).toBe(400);
      expect(body).toMatchObject({
        code: "CREDIT_LIMIT_EXCEEDED",
        limit: 25000,
      });
      // The message names the limit that applied, not a stale hardcoded 10,000.
      expect(body.error).toBe(
        "A maximum of 25,000 credits can be added at once."
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires a request id for refunds", async () => {
    const response = await POST(
      request({ customerId: "customer-1", amount: 10, type: "refund" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Request ID is required for a refund.",
    });
  });

  it("404s when the customer does not exist", async () => {
    snapshots({ customer: undefined });

    const response = await POST(
      request({ customerId: "customer-1", amount: 10 })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Customer could not be found.",
    });
  });

  it("refuses to credit an admin account", async () => {
    snapshots({ customer: { role: "admin" } });

    const response = await POST(request({ customerId: "admin-9", amount: 10 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error:
        "Admin accounts cannot be credited through customer wallet management.",
    });
  });

  it("404s when the refund request is missing", async () => {
    snapshots({ request: undefined });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 10,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Refund request could not be found.",
    });
  });

  it("rejects a request owned by someone else", async () => {
    snapshots({
      request: { userId: "other", refundRequest: { status: "requested" } },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 10,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "This refund request does not belong to the selected customer.",
    });
  });

  it("requires an active refund request", async () => {
    snapshots({
      request: { userId: "customer-1", refundRequest: { status: "completed" } },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 10,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "This request does not have an active refund request.",
    });
  });

  it("refuses to repeat the wallet refund", async () => {
    snapshots({
      request: {
        userId: "customer-1",
        refundRequest: { status: "requested", walletStatus: "completed" },
      },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 10,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "The wallet portion of this refund has already been completed.",
    });
  });

  it("credits a wallet written in integer minor units", async () => {
    // ADR-0008, phase 2: after the wallet migration the document holds
    // `balanceMinor`. The credit has to read either representation, or a
    // migrated customer gets a balance computed from zero.
    snapshots({ wallet: { balanceMinor: 1000, currency: "EUR" } });

    const response = await POST(
      request({ customerId: "customer-1", amount: 15.55 })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        customerId: "customer-1",
        previousBalance: 10,
        creditAdded: 15.55,
        newBalance: 25.55,
      })
    );
  });

  it("refuses a corrupted wallet balance", async () => {
    snapshots({ wallet: { balance: -5 } });

    const response = await POST(
      request({ customerId: "customer-1", amount: 10 })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "The customer's wallet balance is invalid.",
    });
  });

  it("adds an admin credit and records the audit trail", async () => {
    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 15.55,
        description: "  Goodwill  ",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      customerId: "customer-1",
      previousBalance: 10,
      creditAdded: 15.55,
      newBalance: 25.55,
      transactionId: "wtx-1",
      type: "admin_credit",
    });
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: "wallet" }),
      {
        balance: 25.55,
        balanceMinor: 2555,
        currency: "EUR",
        updatedAt: "__SERVER_TS__",
      },
      { merge: true }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wtx-1" }),
      expect.objectContaining({
        userId: "customer-1",
        type: "admin_credit",
        amount: 15.55,
        balanceAfter: 25.55,
        amountMinor: 1555,
        balanceAfterMinor: 2555,
        description: "Goodwill",
        requestId: null,
        createdBy: "admin-1",
      })
    );
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("creates a wallet with the default currency when none exists", async () => {
    snapshots({ wallet: undefined });

    const response = await POST(
      request({ customerId: "customer-1", amount: 5 })
    );

    expect(response.status).toBe(200);
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: "wallet" }),
      expect.objectContaining({ balance: 5, currency: "USD" }),
      { merge: true }
    );
  });

  it("marks a refund complete once every portion is done", async () => {
    snapshots({
      request: {
        userId: "customer-1",
        refundRequest: {
          status: "requested",
          walletAmount: 20,
          paypalAmount: 0,
        },
      },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 20,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ __kind: "request" }),
      expect.objectContaining({
        "refundRequest.walletStatus": "completed",
        "refundRequest.status": "completed",
        status: "refunded",
        "statusHistory.refunded": "__SERVER_TS__",
      })
    );
  });

  it("leaves the refund open while PayPal is still pending", async () => {
    snapshots({
      request: {
        userId: "customer-1",
        refundRequest: {
          status: "requested",
          walletAmount: 20,
          paypalAmount: 30,
          paypalRefundStatus: "pending",
        },
      },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 20,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(200);
    const update = mocks.txUpdate.mock.calls[0][1];
    expect(update).not.toHaveProperty("refundRequest.status");
    expect(update).not.toHaveProperty("status");
  });

  it("refuses a wallet credit when the refund has no wallet portion", async () => {
    snapshots({
      request: {
        userId: "customer-1",
        refundRequest: {
          status: "requested",
          walletAmount: 0,
          paypalAmount: 30,
          paypalRefundStatus: "completed",
        },
      },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 1,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "This refund has no wallet portion to credit.",
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("refuses a credit that does not equal the recorded wallet portion", async () => {
    snapshots({
      request: {
        userId: "customer-1",
        refundRequest: {
          status: "requested",
          walletAmount: 20,
          paypalAmount: 30,
          paypalRefundStatus: "completed",
        },
      },
    });

    const response = await POST(
      request({
        customerId: "customer-1",
        amount: 21,
        type: "refund",
        requestId: "req-1",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "The wallet credit must equal the recorded wallet portion of this refund.",
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("reports unknown failures as a server error", async () => {
    mocks.runTransaction.mockRejectedValue(new Error("boom"));

    const response = await POST(
      request({ customerId: "customer-1", amount: 10 })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Unable to add wallet credits.",
    });
  });

  it("reports an unreadable body as a bad request", async () => {
    const response = await POST(request("not json"));

    expect(response.status).toBe(400);
  });
});
