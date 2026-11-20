/**
 * `GET|POST /api/notifications/unsubscribe`
 *
 * The link is unauthenticated by design, so the token is the only thing standing
 * between a stranger and another customer's inbox. These tests pin both
 * outcomes: a bad token writes nothing and answers 400, a good one flips exactly
 * the email channel and leaves the rest of the preferences alone.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  update: vi.fn(),
  doc: vi.fn(),
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  adminDb: { collection: () => ({ doc: mocks.doc }) },
}));

vi.mock("@/lib/privacy/unsubscribeToken", () => ({
  verifyUnsubscribeToken: mocks.verify,
}));

import { GET, POST } from "./route";

function request(query: string) {
  return new NextRequest(`http://localhost/api/notifications/unsubscribe${query}`);
}

beforeEach(() => {
  mocks.verify.mockReset();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.doc.mockReset().mockReturnValue({ update: mocks.update });
});

describe("GET /api/notifications/unsubscribe", () => {
  it("rejects a forged link without touching Firestore", async () => {
    mocks.verify.mockReturnValue(false);

    const response = await GET(request("?uid=user-1&token=forged"));
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("This unsubscribe link is not valid");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a link with missing parameters", async () => {
    const response = await GET(request(""));

    expect(response.status).toBe(400);
    // Short-circuits before the signature check: there is no user to verify.
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("turns off email only, and confirms in the page", async () => {
    mocks.verify.mockReturnValue(true);

    const response = await GET(request("?uid=user-1&token=good"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toContain("You are unsubscribed from ShipIN emails");
    expect(mocks.doc).toHaveBeenCalledWith("user-1");
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        "preferences.notifications.channels.email": false,
        "preferences.notifications.emailOptOutAt": expect.any(String),
      })
    );
    // Dot paths, so in-app and WhatsApp preferences survive the write.
    expect(
      Object.keys(mocks.update.mock.calls[0][0] as Record<string, unknown>)
    ).toHaveLength(2);
  });
});

describe("POST /api/notifications/unsubscribe", () => {
  it("returns JSON 400 for an invalid token (RFC 8058 one-click)", async () => {
    mocks.verify.mockReturnValue(false);

    const response = await POST(request("?uid=user-1&token=forged"));
    const body = (await response.json()) as { error?: string; code?: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_TOKEN");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("applies the unsubscribe and answers JSON", async () => {
    mocks.verify.mockReturnValue(true);

    const response = await POST(request("?uid=user-1&token=good"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
