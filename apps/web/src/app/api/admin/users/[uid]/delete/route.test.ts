// @vitest-environment node

/**
 * `POST /api/admin/users/[uid]/delete` — removing a throwaway account.
 *
 * This is the only route in the console that destroys an account, so the tests are
 * about the refusals first: yourself, another administrator, the wrong typed address,
 * and any account with orders or money behind it. The success case is checked for
 * ordering as well — Firestore must be clean before Auth is touched, or a failure
 * leaves a login with no profile and nothing to trace it by.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  profileGet: vi.fn(),
  /** Any non-profile document lookup: the wallet check. */
  docGet: vi.fn(),
  listCollections: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
  recordAdminAudit: vi.fn(),
  /** Every collection the route queries, so a test can decide what exists. */
  queryResults: new Map<string, unknown[]>(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock("@/lib/firebaseAdmin", () => {
  const collection = (name: string) => ({
    doc: () => ({
      // `users/{uid}` is the profile; every other document lookup is a wallet that,
      // in these tests, does not exist unless a test says otherwise.
      get: name === "users" ? mocks.profileGet : mocks.docGet,
      listCollections: mocks.listCollections,
    }),
    where: () => ({
      limit: () => ({
        get: async () => ({
          empty: (mocks.queryResults.get(name) ?? []).length === 0,
          size: (mocks.queryResults.get(name) ?? []).length,
          docs: mocks.queryResults.get(name) ?? [],
        }),
      }),
      get: async () => ({
        empty: (mocks.queryResults.get(name) ?? []).length === 0,
        size: (mocks.queryResults.get(name) ?? []).length,
        docs: mocks.queryResults.get(name) ?? [],
      }),
    }),
  });

  return {
    adminAuth: { getUser: mocks.getUser, deleteUser: mocks.deleteUser },
    adminDb: {
      collection,
      batch: () => ({
        delete: mocks.batchDelete,
        commit: mocks.batchCommit,
      }),
    },
  };
});

vi.mock("@/lib/adminAudit", () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

import { POST } from "./route";

const context = (uid = "user-1") => ({ params: Promise.resolve({ uid }) });

const request = (
  body: unknown = { reason: "throwaway checkout test", confirmEmail: "customer@example.com" }
) =>
  new NextRequest("http://localhost/api/admin/users/user-1/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** The profile document the route reads for the role, and deletes later. */
function profileFor(role: string | undefined) {
  mocks.profileGet.mockResolvedValue({
    exists: role !== undefined,
    ref: { id: "user-1" },
    data: () => ({ role }),
  });
}

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({
    uid: "admin-1",
    email: "admin@example.com",
  });
  mocks.getAdminAuthError.mockReset().mockReturnValue(null);
  mocks.getUser.mockReset().mockResolvedValue({
    uid: "user-1",
    email: "customer@example.com",
    emailVerified: true,
    customClaims: {},
  });
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.docGet.mockReset().mockResolvedValue({ exists: false });
  mocks.listCollections.mockReset().mockResolvedValue([]);
  mocks.batchDelete.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
  mocks.queryResults.clear();
  profileFor("customer");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/users/[uid]/delete", () => {
  it("refuses to delete the account the admin is signed in with", async () => {
    const response = await POST(request(), context("admin-1"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CANNOT_DELETE_SELF",
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses to delete another administrator", async () => {
    profileFor("admin");

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TARGET_IS_ADMIN" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses an admin whose role lives only in the custom claims", async () => {
    profileFor(undefined);
    mocks.getUser.mockResolvedValue({
      uid: "user-1",
      email: "customer@example.com",
      customClaims: { admin: true },
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TARGET_IS_ADMIN" });
  });

  it("refuses when the typed address is not the account's address", async () => {
    const response = await POST(
      request({ reason: "throwaway checkout test", confirmEmail: "someone@else.test" }),
      context()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "EMAIL_CONFIRMATION_MISMATCH",
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it("compares the typed address case-insensitively", async () => {
    const response = await POST(
      request({
        reason: "throwaway checkout test",
        confirmEmail: "CUSTOMER@EXAMPLE.COM",
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("requires a reason", async () => {
    const response = await POST(
      request({ reason: "x", confirmEmail: "customer@example.com" }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses an account with orders, naming what blocked it", async () => {
    mocks.queryResults.set("requests", [{ ref: { id: "req-1" } }]);

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("ACCOUNT_HAS_HISTORY");
    expect(body.blockedBy).toContain("orders");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });

  it("refuses an account that only ever held wallet history", async () => {
    mocks.queryResults.set("walletTransactions", [{ ref: { id: "txn-1" } }]);

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect((await response.json()).blockedBy).toContain("wallet history");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes Firestore records before the Auth user, then audits both", async () => {
    const order: string[] = [];
    mocks.batchCommit.mockImplementation(async () => void order.push("firestore"));
    mocks.deleteUser.mockImplementation(async () => void order.push("auth"));
    mocks.recordAdminAudit.mockImplementation(async () => void order.push("audit"));

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(order).toEqual(["firestore", "auth", "audit"]);
    expect(await response.json()).toMatchObject({
      success: true,
      uid: "user-1",
      email: "customer@example.com",
    });
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.account.delete",
        targetId: "user-1",
        actorUid: "admin-1",
        detail: expect.objectContaining({
          reason: "throwaway checkout test",
          email: "customer@example.com",
        }),
      })
    );
  });

  it("leaves the Auth user alone when Firestore cleanup fails", async () => {
    mocks.batchCommit.mockRejectedValue(new Error("firestore down"));

    // `withErrorHandler` turns the throw into a 500 rather than letting it escape.
    const response = await POST(request(), context());

    expect(response.status).toBe(500);

    // A half-deleted account is recoverable; an orphaned login is not.
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it("returns 404 for an account that does not exist", async () => {
    mocks.getUser.mockRejectedValue(
      Object.assign(new Error("no user"), { code: "auth/user-not-found" })
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("deletes the profile and the account's own documents, and reports counts", async () => {
    mocks.queryResults.set("addresses", [{ ref: { id: "a1" } }, { ref: { id: "a2" } }]);
    mocks.queryResults.set("notifications", [{ ref: { id: "n1" } }]);

    const response = await POST(request(), context());
    const body = await response.json();

    expect(body.removed).toMatchObject({
      users: 1,
      addresses: 2,
      notifications: 1,
    });
    // Two addresses, one notification, one profile.
    expect(mocks.batchDelete).toHaveBeenCalledTimes(4);
  });
});
