import { afterEach, describe, expect, it, vi } from "vitest";

const appCheck = vi.hoisted(() => ({
  token: "app-check-token" as string | null,
  calls: [] as boolean[],
  refreshValue: "refreshed-app-check" as string | null,
}));

vi.mock("@/lib/firebase", () => ({
  getAppCheckToken: async (forceRefresh = false) => {
    appCheck.calls.push(forceRefresh);
    return forceRefresh ? appCheck.refreshValue : appCheck.token;
  },
}));

import { MfaApiError, mfaApi } from "./mfaApi";

const originalFetch = global.fetch;

function mockFetch(
  implementation: (url: string, init: RequestInit) => unknown
) {
  global.fetch = vi.fn(implementation) as unknown as typeof fetch;
}

afterEach(() => {
  appCheck.calls = [];
  appCheck.token = "app-check-token";
  appCheck.refreshValue = "refreshed-app-check";
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
      json: async () => ({
        success: false,
        error: "Invalid TOTP code.",
        code: "INVALID_TOTP_CODE",
      }),
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

describe("app check", () => {
  it("attaches the App Check token to every MFA request", async () => {
    // These routes sit behind the same customer gate as the rest of /api. The
    // MFA client was written without the header, so with enforcement on the
    // admin gate's own status request, TOTP setup, security keys and SMS all
    // failed as "App verification failed" - with no token ever requested, which
    // is why the panel could not name a reason.
    let headers: Record<string, string> = {};

    mockFetch((_url, init) => {
      headers = init.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await mfaApi("/api/auth/mfa/session", { idToken: "id" });

    expect(headers["X-Firebase-AppCheck"]).toBe("app-check-token");
    expect(headers.Authorization).toBe("Bearer id");
  });

  it("replays once with a refreshed token after a rejection", async () => {
    const seen: Array<string | undefined> = [];
    let call = 0;

    mockFetch((_url, init) => {
      const token = (init.headers as Record<string, string>)["X-Firebase-AppCheck"];
      seen.push(token);
      call += 1;
      return call === 1
        ? { ok: false, status: 401, json: async () => ({ code: "APP_CHECK_FAILED", error: "App verification failed." }) }
        : { ok: true, status: 200, json: async () => ({ elevated: true }) };
    });

    await expect(mfaApi("/api/auth/mfa/session", { idToken: "id" })).resolves.toEqual({ elevated: true });
    expect(seen).toEqual(["app-check-token", "refreshed-app-check"]);
    expect(appCheck.calls).toEqual([false, true]);
  });

  it("surfaces the rejection when no new token can be minted", async () => {
    appCheck.refreshValue = null;
    mockFetch(() => ({
      ok: false,
      status: 401,
      json: async () => ({ code: "APP_CHECK_FAILED", error: "App verification failed." }),
    }));

    await expect(mfaApi("/api/auth/mfa/session", { idToken: "id" })).rejects.toMatchObject({
      code: "APP_CHECK_FAILED",
      status: 401,
    });
  });
});
