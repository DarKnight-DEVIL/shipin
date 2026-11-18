/**
 * `GET /api/admin/requests` — the admin request list.
 *
 * The route is a thin serializer over the `requests` collection: it must not
 * leak Firestore Timestamp objects into JSON, must default every missing field,
 * and must answer 401/403 through the admin gate instead of a 500.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: () => ({ get: mocks.get }) },
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

import { GET } from "./route";

const request = () => new NextRequest("https://shipin.test/api/admin/requests");

const doc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

beforeEach(() => {
  mocks.requireAdmin
    .mockReset()
    .mockResolvedValue({ uid: "admin-1", mfaVerified: true });
  mocks.get.mockReset().mockResolvedValue({ docs: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/requests", () => {
  it("serializes timestamps and defaults missing fields", async () => {
    mocks.get.mockResolvedValue({
      docs: [
        doc("req-1", {
          userId: "user-1",
          customerName: "Ada",
          email: "ada@example.com",
          status: "submitted",
          createdAt: { seconds: 1700000000, nanoseconds: 500 },
          updatedAt: { seconds: 1700000100 },
        }),
        doc("req-2", {}),
        doc("req-3", {
          createdAt: "not-a-timestamp",
          updatedAt: { seconds: "soon" },
        }),
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.requests).toEqual([
      {
        id: "req-1",
        userId: "user-1",
        customerName: "Ada",
        email: "ada@example.com",
        status: "submitted",
        createdAt: { seconds: 1700000000, nanoseconds: 500 },
        updatedAt: { seconds: 1700000100, nanoseconds: 0 },
      },
      {
        id: "req-2",
        userId: "",
        customerName: "",
        email: "",
        status: "",
        createdAt: undefined,
        updatedAt: undefined,
      },
      {
        id: "req-3",
        userId: "",
        customerName: "",
        email: "",
        status: "",
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.requireAdmin.mockRejectedValue(
      Object.assign(new Error("AUTHENTICATION_REQUIRED"), {})
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a caller without the admin role", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns 500 when the collection read fails", async () => {
    mocks.get.mockRejectedValue(new Error("firestore down"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Unable to load requests.",
    });
    expect(console.error).toHaveBeenCalled();
  });
});
