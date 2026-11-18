/**
 * Data-subject request workflow: logging, assignment and escalation.
 *
 * Firestore access is stubbed in this file rather than in a shared helper: the
 * suite runs with `isolate: false`, so a worker shares one module registry and
 * a file whose subject was already evaluated against a different
 * `@/lib/firebaseAdmin` mock would silently reuse that instance. Owning the mock
 * here keeps each file self-contained, and `vi.resetModules()` in the hoisted
 * block clears whatever a previous file left behind before these imports run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  logRightsRequest,
  getUserRightsRequests,
  updateRightsRequest,
  getPendingRightsRequests,
  getAllRightsRequests,
  getOverdueRightsRequests,
  assignRightsRequest,
  escalateRightsRequest,
} from "./rightsOps2";

// Runs before this file's imports are evaluated, so the subjects below bind to
// the stubs declared in this file.
vi.hoisted(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Shared stubs for the Firestore-backed compliance modules.
// ---------------------------------------------------------------------------

function fakeDoc(data: Record<string, unknown>, exists = true) {
  const safeData = { id: "doc-id", ...data };
  const snap = {
    exists,
    data: () => safeData,
    id: safeData.id as string,
  };
  return {
    ...snap,
    get: () => Promise.resolve(snap),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeCollection(docs: ReturnType<typeof fakeDoc>[]) {
  return {
    doc: (id?: string) => docs.find((d) => d.data().id === id) || docs[0],
    add: vi.fn((_data?: Record<string, unknown>) => ({ id: "added-id" })),
    get: () => ({ docs, empty: docs.length === 0 }),
    where: () => fakeCollection(docs),
    orderBy: () => fakeCollection(docs),
    limit: () => fakeCollection(docs),
  };
}

function fakeBatch() {
  return {
    delete: () => {},
    update: () => {},
    commit: () => Promise.resolve(),
  };
}

// Top-level mocks — installed once via vi.mock so subjects imported at the
// top of this file resolve against these stubs automatically.
const mocks = vi.hoisted(() => ({
  adminDb: {
    collection: vi.fn(() => fakeCollection([])),
    batch: fakeBatch,
  },
  // Return a placeholder object that mimics FieldValue.serverTimestamp()'s .toDate()
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date() })),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: mocks.adminDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

beforeEach(() => {
  mocks.adminDb.collection.mockReset();
  mocks.adminDb.collection.mockImplementation(() => fakeCollection([]));
  mocks.serverTimestamp.mockReset();
  mocks.serverTimestamp.mockImplementation(() => ({
    toDate: () => new Date(),
  }));
});

/**
 * `mocks.adminDb.collection` is declared with no parameters, so a per-test
 * implementation that inspects the requested collection name needs a cast
 * rather than a narrower function type.
 */
function stubCollections(
  factory: (name: string) => ReturnType<typeof fakeCollection>
): void {
  (
    mocks.adminDb.collection as unknown as {
      mockImplementation: (
        impl: (name: string) => ReturnType<typeof fakeCollection>
      ) => void;
    }
  ).mockImplementation(factory);
}

describe("compliance rights ops", () => {
  it("logRightsRequest creates a request with the correct deadline", async () => {
    const collection = fakeCollection([]);
    mocks.adminDb.collection.mockImplementation(() => collection);
    collection.add.mockReturnValue({ id: "req-1" });

    const id = await logRightsRequest({
      userId: "u-1",
      right: "erasure",
      details: "Please erase my data",
    });

    expect(id).toBe("req-1");
    expect(collection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        right: "erasure",
        status: "pending",
        details: "Please erase my data",
      })
    );
  });

  it("getUserRightsRequests returns every request for the user", async () => {
    const stored: Record<string, unknown> = {
      userId: "u-1",
      right: "access",
      status: "completed",
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: new Date(),
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getUserRightsRequests("u-1");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("u-1");
    expect(result[0].right).toBe("access");
  });

  it("updateRightsRequest writes status and optional response/assignee", async () => {
    const stored: Record<string, unknown> = {
      userId: "u-1",
      right: "access",
      status: "pending",
      id: "req-1",
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    await updateRightsRequest("req-1", "completed", "Done", "dpo");

    expect(mocks.adminDb.collection).toHaveBeenCalledWith("rightsRequests");
    expect(collection.doc("req-1").update).toHaveBeenCalledOnce();
  });

  it("getPendingRightsRequests only returns pending/processing/on_hold requests", async () => {
    const stored: Record<string, unknown> = {
      userId: "u-1",
      right: "correction",
      status: "on_hold",
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: undefined,
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getPendingRightsRequests("u-1");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("on_hold");
  });

  it("getAllRightsRequests supports filtering by status", async () => {
    const stored: Record<string, unknown> = {
      userId: "u-1",
      right: "access",
      status: "completed",
      details: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      responseDeadline: null,
      completedAt: new Date(),
    };
    const collection = fakeCollection([fakeDoc(stored)]);
    mocks.adminDb.collection.mockImplementation(() => collection);

    const result = await getAllRightsRequests("completed", 100);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Consent ops
// ---------------------------------------------------------------------------

describe("compliance rights escalation", () => {
  it("getOverdueRightsRequests maps the returned rows", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: "overdue-1",
          userId: "user-1",
          right: "erasure",
          status: "processing",
          createdAt: { toDate: () => new Date("2026-01-01T00:00:00Z") },
        }),
      ])
    );

    const result = await getOverdueRightsRequests();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "overdue-1", status: "processing" });
    expect(result[0].createdAt).toBeInstanceOf(Date);
  });

  it("getOverdueRightsRequests returns an empty list when nothing is overdue", async () => {
    stubCollections(() => fakeCollection([]));

    await expect(getOverdueRightsRequests()).resolves.toEqual([]);
  });

  it("assignRightsRequest moves the request to processing", async () => {
    const requests = fakeCollection([fakeDoc({ id: "rights-1" })]);
    stubCollections(() => requests);

    await assignRightsRequest("rights-1", "dpo@shipin.test");

    const doc = requests.doc("rights-1") as ReturnType<typeof fakeDoc>;
    expect(doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedTo: "dpo@shipin.test",
        status: "processing",
      })
    );
  });

  it("escalateRightsRequest is a no-op for a missing request", async () => {
    const requests = fakeCollection([fakeDoc({ id: "other" }, false)]);
    stubCollections(() => requests);

    await escalateRightsRequest("missing");

    expect(requests.add).not.toHaveBeenCalled();
  });

  it("escalateRightsRequest records a level-1 escalation", async () => {
    const deadline = new Date("2026-02-01T00:00:00Z");
    const requests = fakeCollection([
      fakeDoc({
        id: "rights-1",
        userId: "user-1",
        right: "erasure",
        responseDeadline: deadline,
      }),
    ]);
    stubCollections(() => requests);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await escalateRightsRequest("rights-1");

    expect(requests.add).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "rights-1",
        userId: "user-1",
        originalDeadline: deadline,
        escalationLevel: 1,
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("RIGHTS REQUEST ESCALATED")
    );

    warn.mockRestore();
  });

  it("getAllRightsRequests applies an optional status filter", async () => {
    stubCollections(() =>
      fakeCollection([
        fakeDoc({
          id: "rights-8",
          userId: "user-1",
          right: "access",
          status: "completed",
        }),
      ])
    );

    const result = await getAllRightsRequests("completed", 10);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("completed");
  });
});
// ---------------------------------------------------------------------------
// Retention sweep (retentionOps.ts)
// ---------------------------------------------------------------------------
