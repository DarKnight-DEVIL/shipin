/**
 * `GET/PATCH /api/admin/users` — admin user management.
 *
 * The two invariants that keep the console usable live here, not in the UI:
 * an administrator cannot change their own role, and the last administrator
 * cannot be demoted. Both are asserted directly, alongside the role/MFA
 * projection the page renders.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  /**
   * Chainable stand-in for the users-collection query: the GET path builds
   * `orderBy().limit().startAfter()`, PATCH reads through `where('role',…)`,
   * and both need to record what was asked of them.
   */
  const makeCollection = () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chain: Record<string, unknown> = {};
    const step =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    chain.orderBy = step("orderBy");
    chain.limit = step("limit");
    chain.startAfter = step("startAfter");
    chain.get = () => {
      calls.push({ method: "get", args: [] });
      return mocks.listGet();
    };
    chain.where = () => ({ get: () => mocks.adminQueryGet() });
    chain.doc = (uid: string) => ({
      id: uid,
      get: () => mocks.docGet(uid),
      update: (data: unknown) => mocks.docUpdate(uid, data),
    });
    return { chain, calls };
  };

  return {
    requireAdmin: vi.fn(),
    listGet: vi.fn(),
    docGet: vi.fn(),
    docUpdate: vi.fn(),
    adminQueryGet: vi.fn(),
    collection: vi.fn(),
    makeCollection,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: () => mocks.collection() },
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: (error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (message === "AUTHENTICATION_REQUIRED") {
      return { status: 401, error: "Authentication required." };
    }
    if (message === "ADMIN_ACCESS_REQUIRED") {
      return { status: 403, error: "Administrator access required." };
    }
    return { status: 500, error: "Unable to verify administrator access." };
  },
}));

import { GET, PATCH } from "./route";
import { logger } from "../../../../lib/logger";

const listRequest = (search = "") =>
  new NextRequest(`https://shipin.test/api/admin/users${search}`);

const patchRequest = (body: unknown, raw = false) =>
  new NextRequest("https://shipin.test/api/admin/users", {
    method: "PATCH",
    body: raw ? (body as string) : JSON.stringify(body),
  });

const doc = (uid: string, data: Record<string, unknown>) => ({
  id: uid,
  data: () => data,
  // `toAdminPage` reads `createdAt` off the snapshot to build the cursor.
  get: (field: string) => data[field],
});

let calls: Array<{ method: string; args: unknown[] }>;

const snapshot = (data: Record<string, unknown> | undefined) => ({
  exists: data !== undefined,
  data: () => data,
});

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({
    uid: "admin-1",
    email: "root@shipin.app",
    mfaVerified: true,
  });
  mocks.listGet.mockReset().mockResolvedValue({ docs: [] });
  mocks.docGet.mockReset().mockResolvedValue(snapshot({ role: "customer" }));
  mocks.docUpdate.mockReset().mockResolvedValue(undefined);
  mocks.adminQueryGet.mockReset().mockResolvedValue({ size: 2 });
  const chain = mocks.makeCollection();
  calls = chain.calls;
  mocks.collection.mockReset().mockReturnValue(chain.chain);
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/users", () => {
  it("lists users in the order the query returns, with role and MFA state", async () => {
    // Newest first is the query's job now, so the fixtures are already in
    // snapshot order and the test asserts the route no longer re-sorts.
    mocks.listGet.mockResolvedValue({
      docs: [
        doc("u-new", {
          email: "new@example.com",
          role: "admin",
          createdAt: { toMillis: () => 2_000 },
          mfa: { totp: { enabled: true } },
        }),
        doc("u-old", {
          email: "old@example.com",
          displayName: "Old",
          role: "customer",
          createdAt: { toMillis: () => 1_000 },
        }),
        doc("u-sms", { mfa: { sms: { enabled: true } }, createdAt: 5 }),
        doc("u-key", {
          mfa: { webauthn: { enabled: true } },
          role: "superuser",
        }),
      ],
    });

    const response = await GET(listRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.users.map((u: { uid: string }) => u.uid)).toEqual([
      "u-new",
      "u-old",
      "u-sms",
      "u-key",
    ]);
    expect(body.users[0]).toEqual({
      uid: "u-new",
      email: "new@example.com",
      displayName: "",
      role: "admin",
      mfaEnabled: true,
      createdAt: 2_000,
    });
    expect(body.users[1]).toMatchObject({ uid: "u-old", mfaEnabled: false });
    expect(body.users[2]).toMatchObject({
      uid: "u-sms",
      mfaEnabled: true,
      createdAt: null,
    });
    // Unknown roles are projected as customers, never as admins.
    expect(body.users[3]).toMatchObject({
      uid: "u-key",
      role: "customer",
      mfaEnabled: true,
    });
    // The query, not the route, decides the order and the page size.
    expect(calls.map((call) => call.method)).toEqual([
      "orderBy",
      "limit",
      "get",
    ]);
    expect(calls[0].args).toEqual(["createdAt", "desc"]);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("continues after the cursor the previous page returned", async () => {
    mocks.listGet.mockResolvedValue({
      docs: [doc("u-1", { createdAt: { toMillis: () => 5_000 } })],
    });

    const first = await GET(listRequest("?limit=1"));
    const body = await first.json();

    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();

    const second = await GET(listRequest(`?cursor=${body.nextCursor}`));

    expect(second.status).toBe(200);
    const startAfter = calls.find((call) => call.method === "startAfter");
    expect((startAfter?.args[0] as { toMillis: () => number }).toMillis()).toBe(
      5_000
    );
  });

  it("rejects a cursor it cannot read", async () => {
    const response = await GET(listRequest("?cursor=garbage"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "INVALID_PAGE_PARAM",
    });
    expect(calls).toEqual([]);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));

    const response = await GET(listRequest());

    expect(response.status).toBe(401);
    expect(mocks.listGet).not.toHaveBeenCalled();
  });

  it("returns 500 when the user list read fails", async () => {
    mocks.listGet.mockRejectedValue(new Error("firestore down"));

    const response = await GET(listRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to load users.",
    });
  });
});

describe("PATCH /api/admin/users", () => {
  it("promotes a customer to administrator", async () => {
    const response = await PATCH(
      patchRequest({ uid: "user-2", role: "admin" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      uid: "user-2",
      role: "admin",
    });
    expect(mocks.docUpdate).toHaveBeenCalledWith("user-2", { role: "admin" });
  });

  it("demotes an administrator when another one remains", async () => {
    mocks.docGet.mockResolvedValue(snapshot({ role: "admin" }));
    mocks.adminQueryGet.mockResolvedValue({ size: 2 });

    const response = await PATCH(
      patchRequest({ uid: "admin-2", role: "customer" })
    );

    expect(response.status).toBe(200);
    expect(mocks.adminQueryGet).toHaveBeenCalled();
    expect(mocks.docUpdate).toHaveBeenCalledWith("admin-2", {
      role: "customer",
    });
  });

  it("refuses to demote the last administrator", async () => {
    mocks.docGet.mockResolvedValue(snapshot({ role: "admin" }));
    mocks.adminQueryGet.mockResolvedValue({ size: 1 });

    const response = await PATCH(
      patchRequest({ uid: "admin-2", role: "customer" })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "LAST_ADMIN",
    });
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("refuses to change your own role", async () => {
    const response = await PATCH(
      patchRequest({ uid: "admin-1", role: "customer" })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "CANNOT_CHANGE_OWN_ROLE",
    });
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("404s for an unknown user", async () => {
    mocks.docGet.mockResolvedValue(snapshot(undefined));

    const response = await PATCH(patchRequest({ uid: "ghost", role: "admin" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "USER_PROFILE_NOT_FOUND",
    });
  });

  it.each([
    [{ role: "admin" }, "INVALID_REQUEST_BODY"],
    [{ uid: 42, role: "admin" }, "INVALID_REQUEST_BODY"],
    [{ uid: "user-2" }, "INVALID_REQUEST_BODY"],
    [{ uid: "user-2", role: "superuser" }, "INVALID_REQUEST_BODY"],
  ])("rejects the body %j", async (body, code) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body", async () => {
    const response = await PATCH(patchRequest("{broken", true));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
  });

  it("rejects a caller without the admin role", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));

    const response = await PATCH(
      patchRequest({ uid: "user-2", role: "admin" })
    );

    expect(response.status).toBe(403);
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 when the role update fails", async () => {
    mocks.docUpdate.mockRejectedValue(new Error("firestore down"));

    const response = await PATCH(
      patchRequest({ uid: "user-2", role: "admin" })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to update that user.",
    });
  });
});
