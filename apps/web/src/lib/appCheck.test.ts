/**
 * `lib/appCheck.ts` — server-side App Check verification.
 *
 * The important property is the default: a production build that ships a site
 * key enforces the check (a forgotten variable must not leave a live
 * deployment unprotected), while `false` disables it and a build with no site
 * key — local development, CI, previews — stays off. A gate that switched
 * itself on without a site key would break every run with no Firebase project
 * behind it.
 */

import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const admin = vi.hoisted(() => ({ verifyToken: vi.fn() }));
// `vitest.setup.ts` mocks '@/config/env' for the whole suite with a static
// object, so this file supplies its own mutable version instead of relying on
// `process.env` (which that global mock never reads).
const env = vi.hoisted(() => ({
  enforcement: undefined as string | undefined,
  siteKey: "" as string,
  production: false as boolean,
}));

vi.mock("firebase-admin/app-check", () => ({
  getAppCheck: () => ({ verifyToken: admin.verifyToken }),
}));

vi.mock("@/config/env", () => ({
  get serverEnv() {
    return { APP_CHECK_ENFORCEMENT: env.enforcement };
  },
  get clientEnv() {
    return {
      NODE_ENV: "test",
      NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: env.siteKey,
    };
  },
  get isProduction() {
    return env.production;
  },
  isDevelopment: true,
  isTest: true,
}));

// Imported per file, after `vi.resetModules()`: with a shared module registry
// another file can load `./appCheck` before this file's `@/config/env` mock is
// registered, and the module then keeps the global mock's env forever.
let appCheck: typeof import("./appCheck");

function requestWithHeaders(headers: Record<string, string> = {}): Request {
  return new Request("https://shipin.test/api/thing", { headers });
}

beforeEach(async () => {
  vi.resetModules();
  appCheck = await import("./appCheck");
  env.enforcement = undefined;
  env.siteKey = "";
  env.production = false;
  admin.verifyToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAppCheckEnforced", () => {
  it("is off by default", () => {
    expect(appCheck.isAppCheckEnforced()).toBe(false);
  });

  it('turns on for the exact string "true"', () => {
    env.enforcement = "true";
    expect(appCheck.isAppCheckEnforced()).toBe(true);
  });

  it("enforces by default in production when a site key is configured", () => {
    env.production = true;
    env.siteKey = "site-key";

    expect(appCheck.isAppCheckEnforced()).toBe(true);
  });

  it("stays off in production without a site key", () => {
    env.production = true;
    env.siteKey = "";

    expect(appCheck.isAppCheckEnforced()).toBe(false);
  });

  it("lets a deployment disable it explicitly", () => {
    env.production = true;
    env.siteKey = "site-key";
    env.enforcement = "false";

    expect(appCheck.isAppCheckEnforced()).toBe(false);
  });

  it("ignores unrecognised flag values and falls back to the default", () => {
    env.enforcement = "1";
    expect(appCheck.isAppCheckEnforced()).toBe(false);

    env.production = true;
    env.siteKey = "site-key";
    expect(appCheck.isAppCheckEnforced()).toBe(true);
  });
});

describe("verifyAppCheckRequest", () => {
  it("keeps the App Check SDK out of the module's static import graph", () => {
    // Regression guard, and it has to read the source: the failure lived in
    // the module graph, not in behaviour. `instrumentation.ts` imports this
    // module at boot, so a top-level `firebase-admin/app-check` import loaded
    // jwks-rsa -> jose there, the deployed runtime could not require() that
    // ESM entry (ERR_REQUIRE_ESM), and Next answered every route, static pages
    // included, with 500. The signed-in E2E smoke test then timed out on a
    // login page that never rendered.
    //
    // The status helpers need no SDK, so it may only be imported on demand.
    const source = readFileSync(
      new URL("./appCheck.ts", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain('from "firebase-admin/app-check"');
    expect(source).toContain('import("firebase-admin/app-check")');
  });

  it("reports not-enforced without looking at the request", async () => {
    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders())
    ).resolves.toBe("not-enforced");
    expect(admin.verifyToken).not.toHaveBeenCalled();
  });

  it("reports a missing token when enforced", async () => {
    env.enforcement = "true";

    await expect(
      appCheck.verifyAppCheckRequest(requestWithHeaders())
    ).resolves.toBe("missing");
    expect(admin.verifyToken).not.toHaveBeenCalled();
  });

  it("accepts a token the verifier accepts", async () => {
    env.enforcement = "true";
    admin.verifyToken.mockResolvedValue({ appId: "app-1" });

    await expect(
      appCheck.verifyAppCheckRequest(
        requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: "good-token" })
      )
    ).resolves.toBe("ok");
    expect(admin.verifyToken).toHaveBeenCalledWith("good-token");
  });

  it("reads the header case-insensitively", async () => {
    env.enforcement = "true";
    admin.verifyToken.mockResolvedValue({ appId: "app-1" });

    await expect(
      appCheck.verifyAppCheckRequest(
        requestWithHeaders({ "X-Firebase-AppCheck": "good-token" })
      )
    ).resolves.toBe("ok");
  });

  it("reports an invalid token instead of throwing", async () => {
    env.enforcement = "true";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    admin.verifyToken.mockRejectedValue(new Error("token expired"));

    await expect(
      appCheck.verifyAppCheckRequest(
        requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: "stale-token" })
      )
    ).resolves.toBe("invalid");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("handles a non-Error rejection without leaking it", async () => {
    env.enforcement = "true";
    vi.spyOn(console, "error").mockImplementation(() => {});
    admin.verifyToken.mockRejectedValue("string failure");

    await expect(
      appCheck.verifyAppCheckRequest(
        requestWithHeaders({ [appCheck.APP_CHECK_HEADER]: "bad" })
      )
    ).resolves.toBe("invalid");
  });
});

describe("getAppCheckStatus", () => {
  it("is disabled when neither switch is set", () => {
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: false,
      enforced: false,
      status: "disabled",
    });
  });

  it("is configured when only the site key is set", () => {
    env.siteKey = "site-key";
    expect(appCheck.getAppCheckStatus().status).toBe("configured");
  });

  it("is enforced when both switches are set", () => {
    env.siteKey = "site-key";
    env.enforcement = "true";
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: true,
      enforced: true,
      status: "enforced",
    });
  });

  it("is misconfigured when enforced without a site key", () => {
    env.enforcement = "true";
    expect(appCheck.getAppCheckStatus()).toEqual({
      configured: false,
      enforced: true,
      status: "misconfigured",
    });
  });
});

describe("reportAppCheckStatus", () => {
  it("warns once at startup when enforcement has no site key", () => {
    env.enforcement = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const status = appCheck.reportAppCheckStatus();

    expect(status.status).toBe("misconfigured");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[AppCheck]"));
    // The warning must name both ways out, or it is just noise in the logs.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY")
    );
  });

  it("never throws and stays silent for the other three states", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // disabled
    expect(appCheck.reportAppCheckStatus().status).toBe("disabled");
    // configured
    env.siteKey = "site-key";
    expect(appCheck.reportAppCheckStatus().status).toBe("configured");
    // enforced
    env.enforcement = "true";
    expect(appCheck.reportAppCheckStatus().status).toBe("enforced");

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
