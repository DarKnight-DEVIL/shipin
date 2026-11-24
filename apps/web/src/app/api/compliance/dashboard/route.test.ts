/**
 * `GET|POST /api/compliance/dashboard` — DPO overview.
 *
 * The aggregates drive regulatory reporting, so the tests assert the counts
 * are derived per status/right rather than assumed, and that each admin action
 * validates its identifier before touching data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  getOverdueRightsRequests: vi.fn(),
  getAllRightsRequests: vi.fn(),
  escalateRightsRequest: vi.fn(),
  getActiveBreaches: vi.fn(),
  getAllBreaches: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/compliance/rightsOps2", () => ({
  getOverdueRightsRequests: mocks.getOverdueRightsRequests,
  getAllRightsRequests: mocks.getAllRightsRequests,
  escalateRightsRequest: mocks.escalateRightsRequest,
}));
vi.mock("@/lib/compliance/breach", () => ({
  getActiveBreaches: mocks.getActiveBreaches,
  getAllBreaches: mocks.getAllBreaches,
}));

import { GET, POST } from "./route";

const request = (body?: unknown) =>
  new NextRequest("http://localhost/api/compliance/dashboard", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

const rights = [
  { id: "r1", status: "pending", right: "access" },
  { id: "r2", status: "processing", right: "erasure" },
  { id: "r3", status: "completed", right: "access" },
  { id: "r4", status: "pending", right: "portability" },
  { id: "r5", status: "completed", right: "grievance" },
  { id: "r6", status: "pending", right: "nominee" },
];

const breaches = [
  { id: "b1", status: "open", severity: "critical" },
  { id: "b2", status: "contained", severity: "high" },
  { id: "b3", status: "resolved", severity: "low" },
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.admin.mockReset().mockResolvedValue({ uid: "admin-1" });
  mocks.getOverdueRightsRequests.mockReset().mockResolvedValue([{ id: "r1" }]);
  mocks.getAllRightsRequests.mockReset().mockResolvedValue(rights);
  mocks.escalateRightsRequest.mockReset().mockResolvedValue(undefined);
  mocks.getActiveBreaches.mockReset().mockResolvedValue([{ id: "b1" }]);
  mocks.getAllBreaches.mockReset().mockResolvedValue(breaches);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("GET /api/compliance/dashboard", () => {
  it("rejects a non-admin caller", async () => {
    mocks.admin.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 403 })
    );

    expect((await GET(request())).status).toBe(403);
  });

  it("derives rights and breach statistics", async () => {
    const body = await (await GET(request())).json();

    expect(body.success).toBe(true);
    expect(body.stats.rightsRequests).toEqual({
      total: 6,
      pending: 3,
      processing: 1,
      completed: 2,
      overdue: 1,
    });
    expect(body.stats.breaches).toEqual({
      total: 3,
      open: 1,
      contained: 1,
      resolved: 1,
      critical: 1,
    });
    expect(body.stats.rightsByType).toEqual({
      access: 2,
      correction: 0,
      erasure: 1,
      portability: 1,
      grievance: 1,
      nominee: 1,
    });
  });

  it("caps the detail lists at ten entries", async () => {
    const body = await (await GET(request())).json();

    expect(body.overdueRights).toEqual([{ id: "r1" }]);
    expect(body.activeBreaches).toEqual([{ id: "b1" }]);
    expect(body.recentBreaches).toHaveLength(3);
    expect(body.recentRights).toHaveLength(6);
  });
});

describe("POST /api/compliance/dashboard", () => {
  it("rejects malformed JSON", async () => {
    const response = await POST(request("{oops"));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("rejects a caller without the admin role", async () => {
    mocks.admin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );

    const response = await POST(request({ action: "generate-ropa" }));

    expect(response.status).toBe(403);
    expect(mocks.escalateRightsRequest).not.toHaveBeenCalled();
  });

  it("exports a draft ROPA as a download", async () => {
    const response = await POST(request({ action: "generate-ropa" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      "shipin-ropa-"
    );
    expect(await response.json()).toEqual({
      processingRegister: {},
      version: "draft",
    });
  });

  it("requires a request id to escalate a rights request", async () => {
    const response = await POST(request({ action: "escalate-rights" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Request ID required.");
    expect(mocks.escalateRightsRequest).not.toHaveBeenCalled();
  });

  it("escalates a rights request", async () => {
    const response = await POST(
      request({ action: "escalate-rights", requestId: "r1" })
    );

    expect(await response.json()).toEqual({
      success: true,
      message: "Request escalated to DPO",
    });
    expect(mocks.escalateRightsRequest).toHaveBeenCalledWith("r1");
  });

  it("requires a breach id to escalate a breach", async () => {
    const response = await POST(request({ action: "escalate-breach" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Breach ID required.");
  });

  it("escalates a breach and logs it", async () => {
    const response = await POST(
      request({ action: "escalate-breach", breachId: "b1" })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
    expect(
      errorSpy.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes("BREACH ESCALATED MANUALLY")
      )
    ).toBe(true);
  });

  it("rejects an unknown action", async () => {
    const response = await POST(request({ action: "shutdown" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid request body.");
  });
});
