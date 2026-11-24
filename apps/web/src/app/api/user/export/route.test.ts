/**
 * `GET /api/user/export` — DPDP right to data portability (Sec 13).
 *
 * The export is produced immediately: an earlier revision recorded a request
 * and answered "You will receive a download link when ready", but nothing ever
 * generated that link. The fresh branch must return a file the browser saves
 * rather than a JSON blob it renders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logRightsRequest: vi.fn(),
  updateRightsRequest: vi.fn(),
  collection: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock("@/lib/compliance/rightsOps2", () => ({
  logRightsRequest: mocks.logRightsRequest,
  updateRightsRequest: mocks.updateRightsRequest,
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: mocks.collection },
}));

import { GET } from "./route";

function firestoreStub(docs: Array<{ id: string; data: () => unknown }> = []) {
  const q: Record<string, unknown> = {
    docs,
    empty: docs.length === 0,
    exists: true,
    data: () => ({ displayName: "Ada" }),
  };
  q.get = vi.fn(async () => q);
  q.where = vi.fn(() => q);
  q.orderBy = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.doc = vi.fn(() => q);
  q.collection = vi.fn(() => q);
  return q;
}

const request = () => new NextRequest("http://localhost/api/user/export");

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.logRightsRequest.mockReset().mockResolvedValue("export-1");
  mocks.updateRightsRequest.mockReset().mockResolvedValue(undefined);
  mocks.collection.mockReset().mockImplementation(() => firestoreStub());
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("GET /api/user/export", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await GET(request())).status).toBe(401);
  });

  it("returns the full bundle as a download", async () => {
    mocks.collection.mockImplementation(() =>
      firestoreStub([{ id: "order-1", data: () => ({ status: "delivered" }) }])
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain(
      "shipin-data-user-1-"
    );
    expect(body.profile).toEqual({ displayName: "Ada" });
    expect(body.orders[0]).toEqual({ id: "order-1", status: "delivered" });
    expect(body.exportRequestId).toBe("export-1");

    expect(mocks.updateRightsRequest).toHaveBeenCalledWith(
      "export-1",
      "completed",
      "Data export completed",
      "system"
    );
  });

  it("reports a failed export and marks the request rejected", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      (q.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("quota exceeded")
      );
      return q;
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("EXPORT_FAILED");
    expect(mocks.updateRightsRequest).toHaveBeenCalledWith(
      "export-1",
      "rejected",
      "Export failed: quota exceeded"
    );
  });

  it("exports nulls for a user with no profile or wallet documents", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      q.exists = false;
      return q;
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile).toBeNull();
    expect(body.wallet).toBeNull();
  });

  it("records a generic reason when the failure is not an Error", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      (q.get as ReturnType<typeof vi.fn>).mockRejectedValue("boom");
      return q;
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.updateRightsRequest).toHaveBeenCalledWith(
      "export-1",
      "rejected",
      "Export failed: Unknown error"
    );
  });
});
