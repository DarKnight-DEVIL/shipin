import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  arrayUnion: vi.fn((value: unknown) => ({ __union: value })),
  arrayRemove: vi.fn((value: unknown) => ({ __remove: value })),
}));

vi.mock("firebase/firestore", () => {
  // Refs are plain objects here; `withConverter` records the converter and
  // keeps the same path so assertions on paths stay readable.
  // Non-enumerable so refs still deep-equal plain `{ path }` in assertions.
  const refWithConverter = (path: string) =>
    Object.defineProperty({ path }, "withConverter", {
      value: vi.fn((converter: unknown) => ({ path, converter })),
      enumerable: false,
    });

  return {
    collection: vi.fn((_db: unknown, name: string) => refWithConverter(name)),
    doc: vi.fn((_db: unknown, col: string, id: string) =>
      refWithConverter(`${col}/${id}`)
    ),
    query: vi.fn((ref: unknown) => ({ ref })),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    startAfter: vi.fn(() => ({})),
    addDoc: mocks.addDoc,
    getDoc: mocks.getDoc,
    getDocs: mocks.getDocs,
    updateDoc: mocks.updateDoc,
    runTransaction: mocks.runTransaction,
    serverTimestamp: vi.fn(() => "__SERVER_TS__"),
    arrayUnion: mocks.arrayUnion,
    arrayRemove: mocks.arrayRemove,
  };
});
vi.mock("@/lib/firebaseDb", () => ({ db: {} }));

// The module mock is asserted directly (limit/startAfter arguments).
const firestore = await import("firebase/firestore");
type QueryDocumentSnapshot = import("firebase/firestore").QueryDocumentSnapshot;

import {
  addRequestToShipment,
  createShipment,
  finalizeShipment,
  getAllUserShipments,
  getShipment,
  getShipmentRequests,
  getUserShipments,
  getUserShipmentsPage,
  SHIPMENTS_PAGE_SIZE,
  markShipmentDelivered,
  markShipmentShipped,
  removeRequestFromShipment,
  saveConsolidatedPackage,
} from "./shipments";

const documentSnapshot = (data?: Record<string, unknown>) => ({
  id: data?.id ?? "doc-1",
  exists: () => data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mocks.addDoc.mockReset().mockResolvedValue({ id: "ship-1" });
  mocks.getDoc.mockReset().mockResolvedValue(documentSnapshot({}));
  mocks.getDocs.mockReset().mockResolvedValue({ docs: [] });
  mocks.updateDoc.mockReset().mockResolvedValue(undefined);
  // The transaction hands its own handle to the callback; routing it at the
  // same spies keeps the assertions about what is written, not how.
  mocks.runTransaction
    .mockReset()
    .mockImplementation(
      async (_db: unknown, callback: (tx: unknown) => unknown) =>
        callback({ get: mocks.getDoc, update: mocks.updateDoc, set: vi.fn() })
    );
});

describe("createShipment", () => {
  it("starts an empty shipment in building state", async () => {
    await expect(createShipment("user-1")).resolves.toBe("ship-1");

    expect(mocks.addDoc.mock.calls[0][1]).toMatchObject({
      userId: "user-1",
      requestIds: [],
      status: "building",
      tracking: "",
      courier: "",
      weight: 0,
      createdAt: "__SERVER_TS__",
    });
  });
});

describe("addRequestToShipment", () => {
  it("links the request both ways", async () => {
    await addRequestToShipment("ship-1", "req-1");

    expect(mocks.updateDoc.mock.calls[0]).toEqual([
      { path: "shipments/ship-1" },
      { requestIds: { __union: "req-1" }, updatedAt: "__SERVER_TS__" },
    ]);
    expect(mocks.updateDoc.mock.calls[1]).toEqual([
      { path: "requests/req-1" },
      {
        consolidation: {
          enabled: true,
          shipmentId: "ship-1",
          consolidatedAt: "__SERVER_TS__",
        },
      },
    ]);
  });

  it("writes both documents inside one transaction", async () => {
    await addRequestToShipment("ship-1", "req-1");

    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    // Both updates go through the transaction handle, so they commit or roll
    // back together.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown shipment", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(addRequestToShipment("ship-1", "req-1")).rejects.toThrow(
      "Shipment not found."
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe("getShipment", () => {
  it("returns null when the shipment does not exist", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(getShipment("ship-1")).resolves.toBeNull();
  });

  it("returns the stored shipment", async () => {
    mocks.getDoc.mockResolvedValue(
      documentSnapshot({ id: "ship-1", status: "building" })
    );

    await expect(getShipment("ship-1")).resolves.toEqual({
      id: "ship-1",
      status: "building",
    });
  });
});

describe("getShipmentRequests", () => {
  it("returns nothing when the shipment is missing", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(getShipmentRequests("ship-1")).resolves.toEqual([]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it("returns nothing when the shipment has no requests", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot({ requestIds: [] }));

    await expect(getShipmentRequests("ship-1")).resolves.toEqual([]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it("loads the linked requests", async () => {
    mocks.getDoc.mockResolvedValue(
      documentSnapshot({ requestIds: ["req-1", "req-2"] })
    );
    mocks.getDocs.mockResolvedValue({
      docs: [{ data: () => ({ id: "req-1" }) }],
    });

    await expect(getShipmentRequests("ship-1")).resolves.toEqual([
      { id: "req-1" },
    ]);
  });
});

describe("getUserShipments", () => {
  it("maps the user shipments", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ id: "ship-1" }) },
        { data: () => ({ id: "ship-2" }) },
      ],
    });

    await expect(getUserShipments("user-1")).resolves.toEqual([
      { id: "ship-1" },
      { id: "ship-2" },
    ]);
  });

  it("asks Firestore for one bounded, newest-first page", async () => {
    mocks.getDocs.mockResolvedValue({ docs: [] });

    await getUserShipments("user-1");

    const queryArgs = vi.mocked(firestore.query).mock.calls.at(-1) ?? [];
    // The collection ref plus three constraints: user filter, order, limit.
    expect(queryArgs).toHaveLength(4);
    expect(firestore.limit).toHaveBeenLastCalledWith(SHIPMENTS_PAGE_SIZE);
  });

  it("returns a cursor only when the page is full", async () => {
    const docs = Array.from(
      { length: SHIPMENTS_PAGE_SIZE },
      (_unused, index) => ({
        id: `ship-${index}`,
        data: () => ({ id: `ship-${index}` }),
      })
    );
    mocks.getDocs.mockResolvedValue({ docs });

    const page = await getUserShipmentsPage("user-1");

    expect(page.shipments).toHaveLength(SHIPMENTS_PAGE_SIZE);
    expect(page.nextPageAfter).toBe(docs[docs.length - 1]);

    mocks.getDocs.mockResolvedValue({ docs: docs.slice(0, 1) });
    await expect(getUserShipmentsPage("user-1")).resolves.toMatchObject({
      nextPageAfter: null,
    });
  });

  it("passes the cursor back to Firestore for the next page", async () => {
    const cursor = { id: "ship-25" } as unknown as QueryDocumentSnapshot;
    mocks.getDocs.mockResolvedValue({ docs: [] });

    await getUserShipmentsPage("user-1", { after: cursor });

    expect(firestore.startAfter).toHaveBeenCalledWith(cursor);
  });

  it("walks every page for callers that need the whole set", async () => {
    const firstPage = Array.from(
      { length: SHIPMENTS_PAGE_SIZE },
      (_unused, index) => ({
        id: `a-${index}`,
        data: () => ({ id: `a-${index}` }),
      })
    );
    const secondPage = [{ id: "b-1", data: () => ({ id: "b-1" }) }];

    mocks.getDocs
      .mockResolvedValueOnce({ docs: firstPage })
      .mockResolvedValueOnce({ docs: secondPage });

    const all = await getAllUserShipments("user-1");

    expect(all).toHaveLength(SHIPMENTS_PAGE_SIZE + 1);
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });
});

describe("shipment status updates", () => {
  it("marks a shipment shipped", async () => {
    await markShipmentShipped("ship-1");

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: "shipments/ship-1" },
      {
        status: "shipped",
        shippedAt: "__SERVER_TS__",
        updatedAt: "__SERVER_TS__",
      }
    );
  });

  it("marks a shipment delivered", async () => {
    await markShipmentDelivered("ship-1");

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: "shipments/ship-1" },
      {
        status: "delivered",
        deliveredAt: "__SERVER_TS__",
        updatedAt: "__SERVER_TS__",
      }
    );
  });
});

describe("removeRequestFromShipment", () => {
  it("unlinks the request both ways", async () => {
    await removeRequestFromShipment("ship-1", "req-1");

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      requestIds: { __remove: "req-1" },
    });
    expect(mocks.updateDoc.mock.calls[1][1]).toEqual({
      consolidation: { enabled: false, shipmentId: null, consolidatedAt: null },
    });
  });
});

describe("saveConsolidatedPackage", () => {
  it("stores the package measurements", async () => {
    await saveConsolidatedPackage("ship-1", {
      weight: 5,
      length: 10,
      width: 8,
      height: 4,
    });

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: "shipments/ship-1" },
      { weight: 5, length: 10, width: 8, height: 4, updatedAt: "__SERVER_TS__" }
    );
  });
});

describe("finalizeShipment", () => {
  const complete = {
    requestIds: ["req-1"],
    weight: 5,
    length: 10,
    width: 8,
    height: 4,
  };

  it("marks a complete shipment ready", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(complete));

    await finalizeShipment("ship-1");

    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: "shipments/ship-1" },
      {
        status: "ready",
        finalizedAt: "__SERVER_TS__",
        updatedAt: "__SERVER_TS__",
      }
    );
  });

  it("writes both documents inside one transaction", async () => {
    await addRequestToShipment("ship-1", "req-1");

    expect(mocks.runTransaction).toHaveBeenCalledTimes(1);
    // Both updates go through the transaction handle, so they commit or roll
    // back together.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown shipment", async () => {
    mocks.getDoc.mockResolvedValue(documentSnapshot(undefined));

    await expect(finalizeShipment("ship-1")).rejects.toThrow(
      "Shipment not found."
    );
  });

  it("rejects an empty shipment", async () => {
    mocks.getDoc.mockResolvedValue(
      documentSnapshot({ ...complete, requestIds: [] })
    );

    await expect(finalizeShipment("ship-1")).rejects.toThrow(
      "Cannot finalize an empty shipment."
    );
  });

  it("requires every measurement", async () => {
    for (const field of ["weight", "length", "width", "height"]) {
      mocks.getDoc.mockResolvedValue(
        documentSnapshot({ ...complete, [field]: 0 })
      );

      await expect(finalizeShipment("ship-1")).rejects.toThrow(
        "Enter the final package weight and dimensions before finalizing."
      );
    }
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
