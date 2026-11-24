import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminAuthError: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  requireAdmin: mocks.requireAdmin,
  getAdminAuthError: mocks.getAdminAuthError,
}));
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
}));

import { POST } from "./route";

const request = (body: unknown = { phone: "919876543210" }) =>
  new NextRequest("http://localhost/api/whatsapp/test", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ uid: "admin-1" });
  mocks.getAdminAuthError
    .mockReset()
    .mockReturnValue({
      status: 500,
      error: "Unable to verify administrator access.",
    });
  mocks.sendWhatsAppTemplate.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/whatsapp/test", () => {
  it("passes the full admin gate before touching WhatsApp", async () => {
    const response = await POST(request());

    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects unauthenticated callers", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));
    mocks.getAdminAuthError.mockReturnValue({
      status: 401,
      error: "Authentication required.",
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("rejects a caller without the admin role", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_ACCESS_REQUIRED"));
    mocks.getAdminAuthError.mockReturnValue({
      status: 403,
      error: "Administrator access required.",
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Administrator access required.",
    });
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("rejects an admin who has not completed MFA", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("MFA_REQUIRED"));
    mocks.getAdminAuthError.mockReturnValue({
      status: 401,
      error:
        "Multi-factor authentication required. Provide a TOTP code, a backup code, or sign in again so Identity Platform completes your SMS second factor.",
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone number", async () => {
    const response = await POST(request({ phone: "12" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST_BODY",
    });
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body", async () => {
    const response = await POST(request("{nope"));

    expect(response.status).toBe(400);
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("sends the hello_world template", async () => {
    const response = await POST(request());

    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: "919876543210",
      templateName: "hello_world",
      languageCode: "en_US",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("does not leak provider errors", async () => {
    mocks.sendWhatsAppTemplate.mockRejectedValue(
      new Error("meta token expired")
    );

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      success: false,
      error: "Unable to send WhatsApp message.",
      code: "EXTERNAL_SERVICE_ERROR",
    });
    expect(JSON.stringify(body)).not.toContain("meta token expired");
    expect(console.error).toHaveBeenCalledWith(
      "WhatsApp test failed:",
      "meta token expired"
    );
  });
});
