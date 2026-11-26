// @vitest-environment node

/**
 * `POST /api/admin/users/[uid]/verify-email` — the emergency override.
 *
 * This is a bypass of a security control, so what matters is what it refuses and what
 * it records: no admin, no reason, an unknown user, or an account that is already
 * verified. And every successful call must leave an audit entry, because the only
 * defence this bypass has is being reviewable afterwards.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  profileGet: vi.fn(),
  profileUpdate: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminAuth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mocks.profileGet, update: mocks.profileUpdate }),
    }),
  },
}));

vi.mock("@/lib/adminAudit", () => ({
  recordAdminAudit: mocks.recordAdminAudit,
}));

import { POST } from "./route";

const context = (uid = "user-1") => ({ params: Promise.resolve({ uid }) });

const request = (body: unknown = { reason: "customer lost mailbox access" }) =>
  new NextRequest("http://localhost/api/admin/users/user-1/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({
    uid: "admin-1",
    email: "admin@example.com",
  });
  mocks.getAdminAuthError.mockReset().mockReturnValue(null);
  mocks.getUser.mockReset().mockResolvedValue({
    uid: "user-1",
    email: "customer@example.com",
    emailVerified: false,
  });
  mocks.updateUser.mockReset().mockResolvedValue(undefined);
  mocks.profileGet.mockReset().mockResolvedValue({ exists: true });
  mocks.profileUpdate.mockReset().mockResolvedValue(undefined);
  mocks.recordAdminAudit.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/users/[uid]/verify-email", () => {
  it("verifies the account and records who did it and why", async () => {
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, tokenRefreshRequired: true });
    expect(mocks.updateUser).toHaveBeenCalledWith("user-1", {
      emailVerified: true,
    });

    // The reason is the audit trail; without it the override is unattributable.
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith({
      actorUid: "admin-1",
      actorEmail: "admin@example.com",
      action: "user.email.verify_override",
      targetType: "user",
      targetId: "user-1",
      detail: { reason: "customer lost mailbox access" },
    });
  });

  it("requires a reason", async () => {
    const response = await POST(request({}), context());

    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it("refuses a non-admin before doing anything", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_AN_ADMIN"));
    mocks.getAdminAuthError.mockReturnValue({ status: 403, error: "Forbidden." });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("answers 404 for a uid Firebase does not know", async () => {
    mocks.getUser.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "auth/user-not-found" })
    );

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("USER_NOT_FOUND");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("answers 409 when the address is already verified", async () => {
    mocks.getUser.mockResolvedValue({
      uid: "user-1",
      email: "customer@example.com",
      emailVerified: true,
    });

    const response = await POST(request(), context());
    const body = await response.json();

    // A repeated call is a mistake worth surfacing, not a silent no-op.
    expect(response.status).toBe(409);
    expect(body.code).toBe("ALREADY_VERIFIED");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordAdminAudit).not.toHaveBeenCalled();
  });

  it("does not create a profile document for an account without one", async () => {
    mocks.profileGet.mockResolvedValue({ exists: false });

    await POST(request(), context());

    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    // The Auth side is still updated: that is what unblocks the customer.
    expect(mocks.updateUser).toHaveBeenCalled();
  });
});
