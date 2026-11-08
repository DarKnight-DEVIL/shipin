import { afterEach, describe, expect, it, vi } from "vitest";

import { MfaApiError, mfaApi } from "./mfaApi";

const originalFetch = global.fetch;

function mockFetch(implementation: (url: string, init: RequestInit) => unknown) {
  global.fetch = vi.fn(implementation) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("mfaApi", () => {
  it("sends the bearer token and parses JSON", async () => {
    const calls: Array<[string, RequestInit]> = [];

    mockFetch((url, init) => {
      calls.push([url, init]);
      return {
        ok: true,
        status: 200,
        json: async () => ({ elevated: true }),
      };
    });

    const result = await mfaApi<{ elevated: boolean }>("/api/x", {
      idToken: "token-1",
    });

    expect(result).toEqual({ elevated: true });
    expect(calls[0][0]).toBe("/api/x");
    expect(calls[0][1].method).toBe("GET");
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer token-1"
    );
    expect(calls[0][1].cache).toBe("no-store");
  });

  it("serializes a JSON body when one is given", async () => {
    let captured: RequestInit | undefined;

    mockFetch((_url, init) => {
      captured = init;
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await mfaApi("/api/x", {
      idToken: "t",
      method: "POST",
      body: { code: "123456" },
    });

    expect(captured?.body).toBe('{"code":"123456"}');
    expect((captured?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("maps an error response to MfaApiError with its code", async () => {
    mockFetch(() => ({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: "Invalid TOTP code.", code: "INVALID_TOTP_CODE" }),
    }));

    await expect(mfaApi("/api/x", { idToken: "t" })).rejects.toMatchObject({
      name: "MfaApiError",
      message: "Invalid TOTP code.",
      code: "INVALID_TOTP_CODE",
      status: 400,
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    mockFetch(() => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    }));

    let error: MfaApiError | null = null;

    try {
      await mfaApi("/api/x", { idToken: "t" });
    } catch (caught) {
      error = caught as MfaApiError;
    }

    expect(error).toBeInstanceOf(MfaApiError);
    expect(error?.code).toBe("UNKNOWN_ERROR");
    expect(error?.message).toBe("Request failed (502).");
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(mfaApi("/api/x", { idToken: "t" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
