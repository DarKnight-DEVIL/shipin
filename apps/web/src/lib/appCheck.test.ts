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

const admin = vi.hoisted(() => ({ verifyToken: vi.fn(), apps: [] as unknown[] }));
// `vitest.setup.ts` mocks '@/config/env' for the whole suite with a static
// object, so this file supplies its own mutable version instead of relying on
// `process.env` (which that global mock never reads).
const env = vi.hoisted(() => ({
  enforcement: undefined as string | undefined,
  siteKey: "" as string,
  production: false as boolean,
}));

const metrics = vi.hoisted(() => ({ recordAppCheckFailureReason: vi.fn() }));

const adminApp = vi.hoisted(() => ({ name: "[DEFAULT]" }));

vi.mock("@/lib/firebaseAdmin", () => ({
  ensureAdminApp: () => adminApp,
}));

vi.mock("@/lib/appCheckMetrics", () => ({
  recordAppCheckFailureReason: metrics.recordAppCheckFailureReason,
}));

vi.mock("firebase-admin/app-check", () => ({
  getAppCheck: (app?: unknown) => {
    admin.apps.push(app);
    return { verifyToken: admin.verifyToken };
  },
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
  admin.apps = [];
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
    // A behavioural assertion cannot cover this. The suite runs with
    // `isolate: false`, so one registry is shared by every file and whether a
    // mock factory runs at all depends on which file imported the module
    // first — a counter here passes or fails by seed rather than by code.
    const source = readFileSync(
      new URL("./appCheck.ts", import.meta.url),
      "utf8"
    );

    const SDK = "firebase-admin/app-check";

    // Every way to pull a module in without a call: `import x from "…"`,
    // `export {x} from "…"`, `import "…"` and TS `import x = require("…")`.
    // Quote style and spacing are not part of the contract, so neither is
    // asserted.
    const staticSpecifiers = [
      ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
      ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);

    expect(staticSpecifiers).not.toContain(SDK);

    // …and the on-demand load it relies on must stay inside the verifier,
    // where a failure is a rejected token instead of a dead server. A
    // top-level `await import()` would load the SDK just as early as a static
    // import, and would sit before this declaration.
    const verifier = source.indexOf(
      "export async function verifyAppCheckRequest("
    );
    expect(verifier).toBeGreaterThan(-1);

    const sdkImports = [
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].filter((match) => match[1] === SDK);

    // Type-position occurrences — `let fn: () => import("…").AppCheck` — are
    // erased by the compiler and load nothing, so the count is not the
    // contract. What matters is that none of them sits above the verifier: an
    // import evaluated at module scope would load the SDK at boot, exactly
    // like the static import this test forbids.
    expect(sdkImports.length).toBeGreaterThan(0);
    for (const match of sdkImports) {
      expect(match.index).toBeGreaterThan(verifier);
    }
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

describe("describeAppCheckTokenClaims", () => {
  it("reads the public claims and never the signature", () => {
    const payload = Buffer.from(
      JSON.stringify({
        aud: ["projects/123", "projects/shipin-9576a"],
        iss: "https://firebaseappcheck.googleapis.com/123",
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString("base64url");

    const text = appCheck.describeAppCheckTokenClaims("header." + payload + ".sig");

    // The signature and the subject are what an attacker would need; the
    // audience is what tells a wrong-project key from a broken verifier.
    expect(text).toContain("projects/shipin-9576a");
    expect(text).toContain("firebaseappcheck.googleapis.com");
    expect(text).not.toContain("sig");
  });

  it("says so when the token is not a JWT at all", () => {
    // A debug token is a bare UUID.
    expect(appCheck.describeAppCheckTokenClaims("4f1c0a1e-0000-4000-8000-000000000000")).toBe(
      "claims=not-a-jwt len=36 parts=1"
    );
  });
});

describe("app resolution", () => {
  it("verifies against the admin app instead of the default app", async () => {
    // Firebase Admin initializes lazily here, so at the moment App Check runs
    // there is no default app. getAppCheck() with no argument threw
    // "app/no-app" for every enforced request in production, which reads
    // exactly like an invalid token and cost an outage to find.
    env.enforcement = "true";
    admin.verifyToken.mockResolvedValue({});

    const request = requestWithHeaders({ "X-Firebase-AppCheck": "token" });

    await expect(appCheck.verifyAppCheckRequest(request)).resolves.toBe("ok");
    expect(admin.apps[0]).toBe(adminApp);
  });

  it("names a missing app rather than blaming the token", () => {
    const error = Object.assign(
      new Error("The default Firebase app does not exist."),
      { code: "app/no-app" }
    );

    expect(appCheck.classifyAppCheckFailure(error)).toBe("no-admin-app");
  });
});

describe("classifyAppCheckFailure", () => {
  // The verifier's message embeds the token's audience, so the message itself
  // cannot be reported. The label can, and it is what separates a key
  // registered in another project from public keys that could not be used.
  it.each([
    [Object.assign(new Error('has incorrect "aud" (audience) claim'), {}), "audience-mismatch"],
    [Object.assign(new Error("has incorrect algorithm"), {}), "algorithm-mismatch"],
    [Object.assign(new Error('has incorrect "iss" (issuer) claim'), {}), "issuer-mismatch"],
    [Object.assign(new Error('has no "sub" (subject) claim'), {}), "subject-missing"],
    [Object.assign(new Error("token expired"), {}), "time-invalid"],
    [Object.assign(new Error("boom"), { code: "app-check/invalid-credential" }), "no-project-id"],
    [new Error("fetch failed"), "jwks-unreachable"],
    [new Error("Invalid token signature."), "invalid-signature"],
    [new Error("something nobody predicted"), "unrecognized|no-code|something nobody predicted"],
  ])("labels %s as %s", (error, expected) => {
    expect(appCheck.classifyAppCheckFailure(error)).toBe(expected);
  });

  it("records the label and never the token when verification fails", async () => {
    env.enforcement = "true";
    admin.verifyToken.mockRejectedValue(Object.assign(new Error('has incorrect "aud" claim'), {}));

    const request = new Request("https://shipin.test/api/admin/x", {
      headers: { "X-Firebase-AppCheck": "secret-token-value" },
    });

    await expect(appCheck.verifyAppCheckRequest(request)).resolves.toBe("invalid");
    expect(metrics.recordAppCheckFailureReason).toHaveBeenCalledWith(
      expect.stringContaining("audience-mismatch")
    );
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
  it("reports misconfigured enforcement at startup without throwing, in test and production", () => {
    env.enforcement = "true";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // The production environment is the one that used to throw here, which
    // left the boot half-failed instead of degraded-but-observable.
    vi.stubEnv("NODE_ENV", "production");
    let status: ReturnType<typeof appCheck.reportAppCheckStatus>;
    expect(() => {
      status = appCheck.reportAppCheckStatus();
    }).not.toThrow();

    expect(status!.status).toBe("misconfigured");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[AppCheck]"));
    // The warning must name both ways out, or it is just noise in the logs.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY")
    );
  });

  it("never throws and stays silent for the other three states", () => {
    // The misconfigured case above stubs production; this one asserts the
    // quiet states, which must not warn outside production either.
    vi.stubEnv("NODE_ENV", "test");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // disabled
    expect(appCheck.reportAppCheckStatus().status).toBe("disabled");
    // configured
    env.siteKey = "site-key";
    expect(appCheck.reportAppCheckStatus().status).toBe("configured");
    // enforced
    env.enforcement = "true";
    expect(appCheck.reportAppCheckStatus().status).toBe("enforced");

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
