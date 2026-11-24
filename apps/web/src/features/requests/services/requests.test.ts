import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, direction: string) => ({
    orderBy: [field, direction],
  })),
  limit: vi.fn((value: number) => ({ limit: value })),
  startAfter: vi.fn((cursor: unknown) => ({ startAfter: cursor })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({
    path: `${col}/${id}`,
    id,
  })),
  where: vi.fn(() => ({})),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  onSnapshot: mocks.onSnapshot,
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  startAfter: mocks.startAfter,
  query: mocks.query,
  serverTimestamp: vi.fn(() => "__SERVER_TS__"),
}));
vi.mock("@/lib/firebaseDb", () => ({ db: {} }));

import {
  approveAdditionalItem,
  getRequestById,
  getRequests,
  rejectAdditionalItem,
  subscribeToRequest,
  subscribeToRequests,
  updateAdditionalItemStatus,
} from "./requests";

const docSnapshot = (data?: Record<string, unknown>, id = "req-1") => ({
  exists: () => data !== undefined,
  id,
  data: () => data,
});

const createData = {
  customerName: "Ada",
  email: "ada@example.com",
  items: [],
  shippingAddress: { country: "GB" },
};

beforeEach(() => {
  mocks.addDoc.mockReset().mockResolvedValue({ id: "req-new" });
  mocks.getDoc.mockReset().mockResolvedValue(docSnapshot({ userId: "user-1" }));
  mocks.getDocs.mockReset().mockResolvedValue({ docs: [] });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  mocks.onSnapshot.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRequests", () => {
  const docs = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `req-${index}`,
      data: () => ({ status: "submitted" }),
    }));

  it("reports more pages and trims the extra document", async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(21) });

    const page = await getRequests("user-1");

    expect(page.requests).toHaveLength(20);
    expect(page.hasMore).toBe(true);
    expect(page.lastDoc?.id).toBe("req-19");
  });

  it("reports the last page", async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(3) });

    const page = await getRequests("user-1", { limit: 5 });

    expect(page.requests).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.lastDoc?.id).toBe("req-2");
  });

  it("honours the sort options and page size", async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(1) });

    await getRequests("user-1", {
      limit: 2,
      sortField: "updatedAt",
      sortDirection: "asc",
    });

    expect(mocks.orderBy).toHaveBeenCalledWith("updatedAt", "asc");
    expect(mocks.limit).toHaveBeenCalledWith(3);
  });

  it("applies a pagination cursor", async () => {
    mocks.getDocs.mockResolvedValue({ docs: docs(1) });
    const cursor = docs(1)[0];

    await getRequests("user-1", { startAfter: cursor as never });

    expect(mocks.startAfter).toHaveBeenCalledWith(cursor);
    expect(
      mocks.query.mock.calls.some((call) =>
        call.includes(mocks.startAfter.mock.results[0].value)
      )
    ).toBe(true);
  });

  it("wraps read failures", async () => {
    mocks.getDocs.mockRejectedValue(new Error("offline"));

    await expect(getRequests("user-1")).rejects.toBeInstanceOf(Error);
  });
});

describe("getRequestById", () => {
  it("returns null when the request is missing", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await expect(getRequestById("req-1")).resolves.toBeNull();
  });

  it("returns the request with its id", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot({ status: "paid" }, "req-9"));

    await expect(getRequestById("req-9")).resolves.toEqual({
      id: "req-9",
      status: "paid",
    });
  });

  it("wraps read failures", async () => {
    mocks.getDoc.mockRejectedValue(new Error("offline"));

    await expect(getRequestById("req-1")).rejects.toBeInstanceOf(Error);
  });
});

describe("subscriptions", () => {
  function capture() {
    const unsubscribe = vi.fn();
    let emit: (snapshot: unknown) => void = () => {};
    let emitError: ((error: Error) => void) | undefined;
    mocks.onSnapshot.mockImplementation(
      (
        _ref: unknown,
        callback: (snapshot: unknown) => void,
        onError?: (error: Error) => void
      ) => {
        emit = callback;
        emitError = onError;
        return unsubscribe;
      }
    );
    return {
      unsubscribe,
      emit: (snapshot: unknown) => emit(snapshot),
      emitError: () => emitError,
    };
  }

  it("streams a user request list", () => {
    const { emit, unsubscribe } = capture();
    const received: unknown[] = [];

    const stop = subscribeToRequests("user-1", (items) => received.push(items));
    emit({ docs: [{ id: "req-1", data: () => ({ status: "paid" }) }] });

    expect(received).toEqual([[{ id: "req-1", status: "paid" }]]);
    expect(stop).toBe(unsubscribe);
  });

  it("streams a single request", () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest("req-1", (request) => received.push(request));
    emit(docSnapshot({ status: "paid" }));

    expect(received).toEqual([{ id: "req-1", status: "paid" }]);
  });

  it("reports a deleted request as null", () => {
    const { emit } = capture();
    const received: unknown[] = [];

    subscribeToRequest("req-1", (request) => received.push(request));
    emit(docSnapshot(undefined));

    expect(received).toEqual([null]);
  });

  it("forwards the error callback", () => {
    const { emitError } = capture();
    const onError = vi.fn();

    subscribeToRequest("req-1", () => {}, onError);

    expect(emitError()).toBe(onError);
  });
});

describe("additional item decisions", () => {
  const existing = {
    additionalItemRequests: [
      { id: "item-1", status: "pending" },
      { id: "item-2", status: "pending" },
    ],
  };

  it("approves an item with its quote", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await approveAdditionalItem("req-1", "item-1", 40);

    const [approved, untouched] =
      mocks.updateDoc.mock.calls[0][1].additionalItemRequests;
    expect(approved).toMatchObject({
      id: "item-1",
      status: "awaiting_payment",
      unitPrice: 40,
      totalDue: 40,
    });
    expect(approved.quote).toMatchObject({ unitPrice: 40, totalDue: 40 });
    expect(untouched).toEqual({ id: "item-2", status: "pending" });
  });

  it("rejects an item", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await rejectAdditionalItem("req-1", "item-2");

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests).toEqual([
      { id: "item-1", status: "pending" },
      { id: "item-2", status: "rejected" },
    ]);
  });

  it("advances an item status", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(existing));

    await updateAdditionalItemStatus("req-1", "item-1", "paid");

    expect(
      mocks.updateDoc.mock.calls[0][1].additionalItemRequests[0].status
    ).toBe("paid");
  });

  it("handles a missing request document", async () => {
    mocks.getDoc.mockResolvedValue(docSnapshot(undefined));

    await approveAdditionalItem("req-1", "item-1", 10);

    expect(mocks.updateDoc.mock.calls[0][1].additionalItemRequests).toEqual([]);
  });

  it("wraps failures", async () => {
    mocks.updateDoc.mockRejectedValue(new Error("offline"));

    await expect(
      approveAdditionalItem("req-1", "item-1", 10)
    ).rejects.toBeInstanceOf(Error);
    await expect(
      rejectAdditionalItem("req-1", "item-1")
    ).rejects.toBeInstanceOf(Error);
    await expect(
      updateAdditionalItemStatus("req-1", "item-1", "paid")
    ).rejects.toBeInstanceOf(Error);
  });
});
