/**
 * `POST|GET /api/user/grievance` — DPDP grievance redressal (Sec 13).
 *
 * The route accepts any of the six statutory rights, so the allow-list is the
 * behaviour under test: an unknown right must never reach the audit log.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logRightsRequest: vi.fn(),
  getUserRightsRequests: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuthWithProfile: mocks.auth }));
vi.mock("@/lib/compliance/rightsOps2", () => ({
  logRightsRequest: mocks.logRightsRequest,
  getUserRightsRequests: mocks.getUserRightsRequests,
}));

import { GET, POST } from "./route";

const request = (body?: unknown) =>
  new NextRequest("http://localhost/api/user/grievance", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ profile: { uid: "user-1" } });
  mocks.logRightsRequest.mockReset().mockResolvedValue("rights-9");
  mocks.getUserRightsRequests.mockReset().mockResolvedValue([]);
});

describe("POST /api/user/grievance", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await POST(request({ right: "grievance" }))).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("{not json"));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
  });

  it("requires a right type", async () => {
    const response = await POST(request({ details: "help" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid request body.");
  });

  it("rejects a right outside the statutory list", async () => {
    const response = await POST(request({ right: "refund" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid request body.");
    expect(mocks.logRightsRequest).not.toHaveBeenCalled();
  });

  it.each([
    "access",
    "correction",
    "erasure",
    "portability",
    "grievance",
    "nominee",
  ])("accepts the %s right", async (right) => {
    const response = await POST(
      request({ right, details: "Please process this" })
    );

    expect(response.status).toBe(202);
    expect(mocks.logRightsRequest).toHaveBeenCalledWith({
      userId: "user-1",
      right,
      details: "Please process this",
    });
  });

  it("rejects a non-string details payload", async () => {
    const response = await POST(
      request({ right: "access", details: { nested: true } })
    );

    expect(response.status).toBe(400);
    expect(mocks.logRightsRequest).not.toHaveBeenCalled();
  });
});

describe("GET /api/user/grievance", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(
      NextResponse.json({ error: "nope" }, { status: 401 })
    );

    expect((await GET(request())).status).toBe(401);
  });

  it("lists the caller rights requests", async () => {
    mocks.getUserRightsRequests.mockResolvedValue([
      { id: "r1", right: "grievance", status: "pending" },
    ]);

    const body = await (await GET(request())).json();

    expect(body).toEqual({
      success: true,
      requests: [{ id: "r1", right: "grievance", status: "pending" }],
    });
    expect(mocks.getUserRightsRequests).toHaveBeenCalledWith("user-1");
  });
});
