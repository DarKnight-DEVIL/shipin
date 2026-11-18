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

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listGet: vi.fn(),
  docGet: vi.fn(),
  docUpdate: vi.fn(),
  adminQueryGet: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: {
    collection: () => ({
      get: mocks.listGet,
      doc: (uid: string) => ({
        id: uid,
        get: () => mocks.docGet(uid),
        update: (data: unknown) => mocks.docUpdate(uid, data),
      }),
      where: () => ({ get: mocks.adminQueryGet }),
    }),
  },
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

const listRequest = () =>
  new NextRequest("https://shipin.test/api/admin/users");

const patchRequest = (body: unknown, raw = false) =>
  new NextRequest("https://shipin.test/api/admin/users", {
    method: "PATCH",
    body: raw ? (body as string) : JSON.stringify(body),
  });

const doc = (uid: string, data: Record<string, unknown>) => ({
  id: uid,
  data: () => data,
});

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
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/users", () => {
  it("lists users newest first with role and MFA state", async () => {
    mocks.listGet.mockResolvedValue({
      docs: [
        doc("u-old", {
          email: "old@example.com",
          displayName: "Old",
          role: "customer",
          createdAt: { toMillis: () => 1_000 },
        }),
        doc("u-new", {
          email: "new@example.com",
          role: "admin",
          createdAt: { toMillis: () => 2_000 },
          mfa: { totp: { enabled: true } },
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
    [{ uid: "user-2" }, "INVALID_ROLE"],
    [{ uid: "user-2", role: "superuser" }, "INVALID_ROLE"],
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
