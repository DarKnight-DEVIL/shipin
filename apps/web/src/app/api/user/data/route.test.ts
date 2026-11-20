/**
 * `GET|POST /api/user/data` — DPDP right of access (Sec 11).
 *
 * Every read is itself an auditable event, so the route must both return the
 * data bundle and close out the rights request with the right status.
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

import { GET, POST } from "./route";

/** One chain object answers every builder call, like the real Firestore query. */
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

const request = () => new NextRequest("http://localhost/api/user/data");

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.logRightsRequest.mockReset().mockResolvedValue("rights-1");
  mocks.updateRightsRequest.mockReset().mockResolvedValue(undefined);
  mocks.collection.mockReset().mockImplementation(() => firestoreStub());
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("GET /api/user/data", () => {
  it("rejects an unauthenticated caller without logging a request", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.logRightsRequest).not.toHaveBeenCalled();
  });

  it("returns the access bundle and closes the request as completed", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.requestId).toBe("rights-1");
    expect(body.data.profile).toEqual({ displayName: "Ada" });
    expect(body.data.orders).toEqual([]);
    expect(body.data.accessedAt).toEqual(expect.any(String));

    expect(mocks.logRightsRequest).toHaveBeenCalledWith({
      userId: "user-1",
      right: "access",
      details: "User requested access to their personal data",
    });
    expect(mocks.updateRightsRequest).toHaveBeenCalledWith(
      "rights-1",
      "completed",
      "Data access provided",
      "system"
    );
  });

  it("maps stored rows with their document ids", async () => {
    mocks.collection.mockImplementation(() =>
      firestoreStub([{ id: "order-1", data: () => ({ status: "delivered" }) }])
    );

    const body = await (await GET(request())).json();

    expect(body.data.orders[0]).toEqual({ id: "order-1", status: "delivered" });
  });

  it("returns null profile and wallet when the documents do not exist", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      q.exists = false;
      return q;
    });

    const body = await (await GET(request())).json();

    expect(body.data.profile).toBeNull();
    expect(body.data.wallet).toBeNull();
  });

  it("marks the request rejected when the data gather fails", async () => {
    mocks.collection.mockImplementation(() => {
      const q = firestoreStub();
      (q.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("firestore down")
      );
      return q;
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("ACCESS_FAILED");
    expect(mocks.updateRightsRequest).toHaveBeenCalledWith(
      "rights-1",
      "rejected",
      "Access request failed"
    );
  });
});

describe("POST /api/user/data", () => {
  it("accepts a form-submitted access request", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.requestId).toBe("rights-1");
    expect(mocks.logRightsRequest).toHaveBeenCalledWith({
      userId: "user-1",
      right: "access",
      details: "User submitted access request via form",
    });
  });

  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await POST(request())).status).toBe(401);
  });
});
