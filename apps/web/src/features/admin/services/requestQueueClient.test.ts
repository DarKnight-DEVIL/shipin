import { describe, it, expect, vi, beforeEach } from "vitest";

const customerApiMock = vi.fn();

vi.mock("@/lib/customerApiClient", () => ({
  customerApi: (...args: unknown[]) => customerApiMock(...args),
}));

import { Timestamp } from "firebase/firestore";

import {
  getAdminRequestPriority,
  getAdminRequestQueue,
  getAllRequests,
  matchesAdminRequestFilter,
} from "./requestQueueClient";
import type { Request } from "@/types/request";

const request = (overrides: Record<string, unknown> = {}) =>
  ({ id: "r-1", status: "submitted", ...overrides }) as unknown as Request;

beforeEach(() => {
  customerApiMock.mockReset();
});

describe("getAllRequests", () => {
  it("maps documents with their ids", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "r-1",
          userId: "",
          customerName: "",
          email: "",
          status: "submitted",
        },
        { id: "r-2", userId: "", customerName: "", email: "", status: "paid" },
      ],
    });

    await expect(getAllRequests()).resolves.toEqual([
      {
        id: "r-1",
        userId: "",
        customerName: "",
        email: "",
        status: "submitted",
        items: [],
      },
      {
        id: "r-2",
        userId: "",
        customerName: "",
        email: "",
        status: "paid",
        items: [],
      },
    ]);
  });

  it("restores real Firestore Timestamps", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "r-1",
          userId: "",
          customerName: "",
          email: "",
          status: "submitted",
          createdAt: { seconds: 1_800_000_000, nanoseconds: 500_000_000 },
        },
      ],
    });

    const [record] = await getAllRequests();

    expect(record.createdAt).toBeInstanceOf(Timestamp);
    expect(record.createdAt!.toDate().toISOString()).toBe(
      new Date(1_800_000_000_500).toISOString()
    );
  });

  it("keeps the fields the queue and the filters read", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "r-1",
          userId: "u-1",
          customerName: "Ada",
          email: "ada@example.com",
          status: "purchased",
          items: [{ name: "Toy car", quantity: 2 }],
          quote: { breakdown: { grandTotal: 523.33 } },
          refundRequest: { status: "requested" },
          quoteRegenerationRequested: true,
          purchases: [
            {
              vendor: "Amazon",
              amount: 42,
              recordedAt: { seconds: 1_700_000_200, nanoseconds: 0 },
            },
          ],
          // Written by POST /api/admin/requests/[id]/purchase; the purchasing
          // page sorts its history on it.
          purchasedAt: { seconds: 1_700_000_300, nanoseconds: 0 },
        },
      ],
    });

    const [record] = await getAllRequests();

    expect(record.items).toEqual([{ name: "Toy car", quantity: 2 }]);
    expect(record.quote?.breakdown?.grandTotal).toBe(523.33);
    expect(record.refundRequest?.status).toBe("requested");
    expect(record.quoteRegenerationRequested).toBe(true);
    // Timestamps are restored at any depth: the page calls
    // `request.purchasedAt.toMillis()` and the receipt list reads
    // `purchases[].recordedAt`.
    expect(record.purchasedAt).toBeInstanceOf(Timestamp);
    expect(record.purchasedAt?.toMillis()).toBe(1_700_000_300_000);
    expect(record.purchases?.[0]?.recordedAt).toBeInstanceOf(Timestamp);
    expect(record.purchases?.[0]?.recordedAt?.toMillis()).toBe(
      1_700_000_200_000
    );
  });

  it("defaults items rather than dropping the document", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "r-legacy",
          userId: "u-1",
          customerName: "",
          email: "",
          status: "paid",
        },
      ],
    });

    const [record] = await getAllRequests();

    expect(record.items).toEqual([]);
    expect(record.id).toBe("r-legacy");
  });

  it("leaves a plain object with a seconds field alone", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "r-1",
          userId: "u-1",
          customerName: "",
          email: "",
          status: "paid",
          items: [],
          // Not a serialized Timestamp: no nanoseconds key.
          storage: { seconds: 30 },
        },
      ],
    });

    const [record] = await getAllRequests();

    expect(record.storage).toEqual({ seconds: 30 });
  });

  it("wraps read failures", async () => {
    customerApiMock.mockRejectedValue(new Error("offline"));

    await expect(getAllRequests()).rejects.toBeInstanceOf(Error);
  });
});

describe("matchesAdminRequestFilter", () => {
  it("accepts everything without a filter", () => {
    expect(matchesAdminRequestFilter(request(), null)).toBe(true);
    expect(matchesAdminRequestFilter(request(), "")).toBe(true);
  });

  it("selects requested refunds", () => {
    expect(
      matchesAdminRequestFilter(
        request({ refundRequest: { status: "requested" } }),
        "refund_requested"
      )
    ).toBe(true);
    expect(
      matchesAdminRequestFilter(
        request({ refundRequest: { status: "completed" } }),
        "refund_requested"
      )
    ).toBe(false);
    expect(matchesAdminRequestFilter(request(), "refund_requested")).toBe(
      false
    );
  });

  it("selects quote regeneration requests that are still open", () => {
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: true }),
        "quote_requested"
      )
    ).toBe(true);
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: true, status: "rejected" }),
        "quote_requested"
      )
    ).toBe(false);
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: true, status: "refunded" }),
        "quote_requested"
      )
    ).toBe(false);
    expect(
      matchesAdminRequestFilter(
        request({ quoteRegenerationRequested: false }),
        "quote_requested"
      )
    ).toBe(false);
  });

  it("matches a plain status", () => {
    expect(
      matchesAdminRequestFilter(request({ status: "packed" }), "packed")
    ).toBe(true);
    expect(
      matchesAdminRequestFilter(request({ status: "packed" }), "shipped")
    ).toBe(false);
  });
});

describe("getAdminRequestPriority", () => {
  it.each([
    [{ quoteRegenerationRequested: true }, 1],
    [{ refundRequest: { status: "requested" } }, 2],
    [{ status: "submitted" }, 3],
    [{ status: "review" }, 3],
    [{ status: "paid" }, 4],
    [{ status: "warehouse_received" }, 5],
    [{ status: "purchased" }, 6],
    [{ status: "packed" }, 7],
    [{ status: "shipped" }, 7],
    [{ status: "awaiting_payment" }, 8],
    [{ status: "out_for_delivery" }, 9],
    [{ status: "delivered" }, 10],
    /* Any status not handled above reaches the refund-offer branch. */
    [{ refundOffer: { offered: true }, status: "archived" }, 11],
    [{ status: "refunded" }, 12],
    [{ status: "rejected" }, 13],
  ])("ranks %j as %i", (overrides, expected) => {
    expect(getAdminRequestPriority(request(overrides))).toBe(expected);
  });

  it("ignores a rejected regeneration request", () => {
    expect(
      getAdminRequestPriority(
        request({ quoteRegenerationRequested: true, status: "rejected" })
      )
    ).toBe(13);
  });

  it("ignores a refund offer on a refunded request", () => {
    expect(
      getAdminRequestPriority(
        request({ refundOffer: { offered: true }, status: "refunded" })
      )
    ).toBe(12);
  });

  it("ignores a refund offer on a rejected request", () => {
    expect(
      getAdminRequestPriority(
        request({ refundOffer: { offered: true }, status: "rejected" })
      )
    ).toBe(13);
  });
});

describe("getAdminRequestQueue", () => {
  it("filters and sorts by operational priority", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "delivered",
          userId: "",
          customerName: "",
          email: "",
          status: "delivered",
        },
        {
          id: "refund",
          userId: "",
          customerName: "",
          email: "",
          status: "submitted",
          refundRequest: { status: "requested" },
        },
        {
          id: "regen",
          userId: "",
          customerName: "",
          email: "",
          status: "review",
          quoteRegenerationRequested: true,
        },
        {
          id: "submitted",
          userId: "",
          customerName: "",
          email: "",
          status: "submitted",
        },
      ],
    });

    const queue = await getAdminRequestQueue(null);

    // Priority first: "regen" (quote regeneration, 1) outranks "refund" (2),
    // then "submitted" (3) and "delivered" (10). This is the ordering the
    // screen promises; it used to come out as refund-before-regen because the
    // client dropped `quoteRegenerationRequested` and `refundRequest`.
    expect(queue.map((item) => item.id)).toEqual([
      "regen",
      "refund",
      "submitted",
      "delivered",
    ]);
  });

  it("applies the filter before sorting", async () => {
    customerApiMock.mockResolvedValue({
      success: true,
      requests: [
        {
          id: "delivered",
          userId: "",
          customerName: "",
          email: "",
          status: "delivered",
        },
        {
          id: "submitted",
          userId: "",
          customerName: "",
          email: "",
          status: "submitted",
        },
      ],
    });

    const queue = await getAdminRequestQueue("delivered");

    expect(queue.map((item) => item.id)).toEqual(["delivered"]);
  });
});
