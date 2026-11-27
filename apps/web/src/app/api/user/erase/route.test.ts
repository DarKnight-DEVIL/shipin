/**
 * `POST|GET /api/user/erase` — DPDP right to erasure (Sec 12).
 *
 * The cascade is destructive, so the tests assert that every user-scoped
 * collection is queued for deletion, that the profile and the user's requests
 * are anonymised rather than removed outright (legal/tax retention), that the
 * Firebase Auth user is actually deleted, and that a failure surfaces as a 500
 * instead of a silent success.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logRightsRequest: vi.fn(),
  getUserRightsRequests: vi.fn(),
  collection: vi.fn(),
  batch: vi.fn(),
  deleteUser: vi.fn(),
  deleteR2Objects: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock("@/lib/compliance/rightsOps2", () => ({
  logRightsRequest: mocks.logRightsRequest,
  getUserRightsRequests: mocks.getUserRightsRequests,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection, batch: mocks.batch },
  adminAuth: { deleteUser: mocks.deleteUser },
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__TS__",
    delete: () => "__DELETE__",
  },
}));
vi.mock("@/lib/r2Delete", () => ({
  deleteR2Objects: mocks.deleteR2Objects,
}));

import { GET, POST } from "./route";

// A Query stub that supports chained where() and .get() returning a snapshot.
// Default: empty. Tests override via the docs passed to makeQuery.
function makeQuery(
  initialDocs: Array<{ id: string; data: () => unknown }> = []
) {
  const docs = initialDocs;
  const q = {
    where: () => q,
    limit: () => q,
    // `userSecretsRef` resolves a doc reference before it is handed to a batch.
    doc: () => q,
    get: () => ({
      empty: docs.length === 0,
      docs,
    }),
  } as unknown as {
    where: () => typeof q;
    limit: () => typeof q;
    get: () => {
      empty: boolean;
      docs: Array<{ id: string; data: () => unknown }>;
    };
  };
  return q;
}

function firestoreStub(
  rawDocs: Array<{ id: string; data: () => unknown }> = []
) {
  // Real snapshots carry a `ref`; the handler deletes and updates through it.
  const docs = rawDocs.map((doc) => ({ ref: { id: doc.id }, ...doc }));
  const q: Record<string, unknown> = {
    docs,
    empty: docs.length === 0,
    exists: true,
    data: () => ({}),
  };
  q.get = vi.fn(async () => q);
  q.where = vi.fn(() => q);
  q.orderBy = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.doc = vi.fn(() => q);
  q.collection = vi.fn(() => q);
  q.update = vi.fn(async () => undefined);
  return q;
}

const request = () => new NextRequest("http://localhost/api/user/erase");

let errorSpy: ReturnType<typeof vi.spyOn>;
let batch: {
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.logRightsRequest.mockReset().mockResolvedValue("erasure-1");
  mocks.getUserRightsRequests.mockReset().mockResolvedValue([]);
  mocks.collection.mockReset().mockImplementation(() => makeQuery());
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.deleteR2Objects.mockReset().mockResolvedValue({
    deleted: 0,
    failed: 0,
  });
  batch = {
    delete: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  };
  mocks.batch.mockReset().mockReturnValue(batch);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/user/erase", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await POST(request())).status).toBe(401);
    expect(mocks.logRightsRequest).not.toHaveBeenCalled();
  });

  it("logs the request, queues every user-scoped collection and commits", async () => {
    const docWithRef = {
      id: "row-1",
      ref: {} as unknown as ReturnType<typeof vi.fn>,
      data: () => ({}),
    };
    mocks.collection.mockImplementation((name: string) =>
      name === "users"
        ? {
            doc: () => ({
              update: async () => undefined,
              collection: () => ({
                get: async () => ({ empty: false, docs: [docWithRef] }),
              }),
            }),
          }
        : name === "wallets"
          ? {
              doc: () => ({
                get: async () => ({ exists: false, data: () => undefined }),
              }),
            }
          : name === "walletHolds" || name === "walletTopupOrders"
            ? makeQuery()
            : name === "rightsRequests"
              ? {
                  doc: () => ({
                    update: async () => undefined,
                  }),
                  add: () => ({
                    then: async () => undefined,
                  }),
                  where: () => {
                    const q = {
                      where: () => q,
                      limit: () => q,
                      get: async () => ({ empty: false, docs: [docWithRef] }),
                    };
                    return q;
                  },
                }
              : makeQuery([docWithRef])
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("erasure-1");
    expect(mocks.logRightsRequest).toHaveBeenCalledWith({
      userId: "user-1",
      right: "erasure",
      details: "User requested account and data deletion",
    });

    // addresses, supportTickets, supportMessages, notifications, wallet holds
    // and consentLogs each contribute at least one document.
    expect(batch.delete.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it("anonymises the profile but keeps the document", async () => {
    const users = firestoreStub();
    mocks.collection.mockImplementation((name: string) =>
      name === "users" ? users : firestoreStub()
    );

    await POST(request());

    expect(users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        erased: true,
        displayName: "Deleted User",
        email: "deleted@user.local",
        phone: "",
        photoURL: "",
        dateOfBirth: null,
        erasedAt: "__TS__",
        // The real audit id, not the placeholder the handler used to write.
        erasureRequestId: "erasure-1",
      })
    );

    // The rights-request document is closed, not left pending.
    expect(users.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" })
    );
  });

  it("keeps the audit request that is being served and deletes the other ones", async () => {
    const rights = firestoreStub([
      { id: "erasure-1", data: () => ({}) },
      { id: "erasure-0", data: () => ({}) },
    ]);
    mocks.collection.mockImplementation((name: string) =>
      name === "rightsRequests"
        ? rights
        : name === "users"
          ? {
              doc: () => ({
                update: async () => undefined,
                collection: () => ({
                  get: async () => ({ empty: true, docs: [] }),
                }),
              }),
            }
          : firestoreStub()
    );

    await POST(request());

    const deleted = batch.delete.mock.calls.map((call) => call[0].id);
    expect(deleted).not.toContain("erasure-1");
    expect(deleted).toContain("erasure-0");
  });

  it("anonymises the user's requests instead of leaving their PII queryable", async () => {
    const requests = firestoreStub([{ id: "req-1", data: () => ({}) }]);
    mocks.collection.mockImplementation((name: string) =>
      name === "requests" ? requests : firestoreStub()
    );

    await POST(request());

    expect(batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1" }),
      expect.objectContaining({
        email: "deleted@user.local",
        customerName: "Deleted User",
        shippingAddress: "__DELETE__",
        erasureRequestId: "erasure-1",
        erasedAt: "__TS__",
      })
    );
  });

  it("deletes inspection photos from R2 before anonymising the request", async () => {
    const requests = firestoreStub([
      {
        id: "req-1",
        data: () => ({
          warehouse: { inspectionPhotos: ["inspection/req-1/a.jpg"] },
        }),
      },
    ]);
    mocks.collection.mockImplementation((name: string) =>
      name === "requests" ? requests : firestoreStub()
    );
    mocks.deleteR2Objects.mockResolvedValue({ deleted: 1, failed: 0 });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deleteR2Objects).toHaveBeenCalledWith([
      "inspection/req-1/a.jpg",
    ]);
    expect(batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1" }),
      expect.objectContaining({
        "warehouse.inspectionPhotos": [],
        "warehouse.photos": [],
        "warehouse.shippingLabel": null,
      })
    );
  });

  it("fails the erasure when R2 refuses a photo delete", async () => {
    const requests = firestoreStub([
      {
        id: "req-1",
        data: () => ({
          warehouse: { inspectionPhotos: ["inspection/req-1/a.jpg"] },
        }),
      },
    ]);
    mocks.collection.mockImplementation((name: string) =>
      name === "requests" ? requests : firestoreStub()
    );
    mocks.deleteR2Objects.mockResolvedValue({ deleted: 0, failed: 1 });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(batch.commit).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the Firebase Auth user so the account cannot sign in again", async () => {
    mocks.collection.mockImplementation((name: string) =>
      name === "users"
        ? {
            doc: () => ({
              update: async () => undefined,
              collection: () => ({
                get: async () => ({ empty: true, docs: [] }),
              }),
            }),
          }
        : (() => {
            const q = {
              where: () => q,
              limit: () => q,
              doc: () => q,
              get: async () => ({ empty: true, docs: [] }),
            };
            return q;
          })()
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("treats an already-deleted Auth user as success", async () => {
    mocks.deleteUser.mockRejectedValue(
      Object.assign(new Error("no user"), { code: "auth/user-not-found" })
    );
    mocks.collection.mockImplementation((name: string) =>
      name === "users"
        ? {
            doc: () => ({
              update: async () => undefined,
              collection: () => ({
                get: async () => ({ empty: true, docs: [] }),
              }),
            }),
          }
        : (() => {
            const q = {
              where: () => q,
              limit: () => q,
              doc: () => q,
              get: async () => ({ empty: true, docs: [] }),
            };
            return q;
          })()
    );

    expect((await POST(request())).status).toBe(200);
  });

  it("returns 500 and does not claim success when the cascade fails", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      (q.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("permission-denied")
      );
      return q;
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("ERASURE_FAILED");
    expect(batch.commit).not.toHaveBeenCalled();
    // The Auth account must survive a failed cascade, or the user loses access
    // to data that was never purged.
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("returns 500 when the Auth delete fails for any other reason", async () => {
    mocks.deleteUser.mockRejectedValue(
      Object.assign(new Error("revoked"), { code: "auth/internal-error" })
    );
    mocks.collection.mockImplementation((name: string) =>
      name === "users"
        ? {
            doc: () => ({
              update: async () => undefined,
              collection: () => ({
                get: async () => ({ empty: true, docs: [] }),
              }),
            }),
          }
        : (() => {
            const q = {
              where: () => q,
              limit: () => q,
              doc: () => q,
              get: async () => ({ empty: true, docs: [] }),
            };
            return q;
          })()
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("ERASURE_FAILED");
    // The profile documents are already anonymised at this point; the failure
    // must still surface rather than reporting success.
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });
});

// If the pre-check finds active wallet obligations, the cascade is cancelled
// before anything is touched and before the Auth user is deleted, so the
// account and every Firestore record remain exactly as they were.
it("cancels the erasure request while the wallet still holds money", async () => {
  // A positive balance is the real obligation; a completed ledger row is not.
  mocks.collection.mockImplementation((name: string) => {
    if (name === "wallets") {
      return {
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({ balance: 10 }),
          }),
        }),
      };
    }
    if (name === "rightsRequests") {
      return {
        doc: () => ({
          update: async () => undefined,
        }),
        where: () => ({
          get: async () => ({ empty: true, docs: [] }),
        }),
      };
    }
    return makeQuery();
  });

  const requestId = "erasure-1";
  const response = await POST(request());

  // The request is marked cancelled; nothing else is touched.
  expect(mocks.batch).not.toHaveBeenCalled();
  expect(mocks.deleteUser).not.toHaveBeenCalled();
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    code: "ERASURE_CANCELLED",
    requestId,
  });
});

describe("GET /api/user/erase", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await GET(request())).status).toBe(401);
  });

  it("returns only erasure requests", async () => {
    mocks.getUserRightsRequests.mockResolvedValue([
      { id: "r1", right: "erasure", status: "pending" },
      { id: "r2", right: "access", status: "completed" },
    ]);

    const body = await (await GET(request())).json();

    expect(body.requests).toEqual([
      { id: "r1", right: "erasure", status: "pending" },
    ]);
  });
});
