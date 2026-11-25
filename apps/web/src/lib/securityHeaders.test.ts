/**
 * Unit tests for security headers configuration.
 */

import { describe, it, expect, vi } from "vitest";

import {
  getAuthHelperCSP,
  getDevCSP,
  getProductionCSP,
  SECURITY_HEADERS,
  createSecureCookieHeader,
} from "./securityHeaders";

/**
 * `isDevelopment` / `isProduction` are captured when the module is first
 * evaluated, so each branch needs a freshly imported module with a stubbed
 * `@/config/env`.
 */
async function importWithEnv(env: {
  isDevelopment: boolean;
  isProduction: boolean;
}) {
  vi.resetModules();
  vi.doMock("@/config/env", () => env);
  try {
    return await import("./securityHeaders");
  } finally {
    vi.doUnmock("@/config/env");
  }
}

/** Returns a single directive (e.g. `script-src`) from a CSP header value. */
function cspDirective(csp: string, name: string): string {
  const match = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  return match ?? "";
}

/** Returns the sources of a directive — everything after the directive name. */
function cspSources(csp: string, name: string): string[] {
  return cspDirective(csp, name).split(/\s+/).slice(1);
}

describe("SECURITY_HEADERS", () => {
  it("pins the hardening defaults", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("0");
    expect(SECURITY_HEADERS["Cross-Origin-Resource-Policy"]).toBe(
      "same-origin"
    );
    expect(SECURITY_HEADERS["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("locks down powerful browser features", () => {
    const policy = SECURITY_HEADERS["Permissions-Policy"];

    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("payment=(self)");
    // Passkey sign-in runs navigator.credentials.get on this origin; denying
    // it made the security-key button fail without ever prompting.
    expect(policy).toContain("publickey-credentials-get=(self)");
  });

  it("lets the app write to the clipboard but never read it", () => {
    const policy = SECURITY_HEADERS["Permissions-Policy"];

    // The admin backup-code list copies through navigator.clipboard; denying
    // `clipboard-write` made that button silently do nothing.
    expect(policy).toContain("clipboard-write=(self)");
    expect(policy).toContain("clipboard-read=()");
  });

  it("declares the CSP reporting endpoint", () => {
    expect(SECURITY_HEADERS["Reporting-Endpoints"]).toContain(
      "/api/csp-report"
    );
    // Legacy reporting API: Safari and older Chromium ignore Reporting-Endpoints.
    expect(SECURITY_HEADERS["Report-To"]).toContain("/api/csp-report");
    expect(SECURITY_HEADERS["Report-To"]).toContain('"group":"csp-endpoint"');
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "report-to 'csp-endpoint'"
    );
  });
});

describe("getDevCSP", () => {
  it("allows inline/eval for the dev server bundle", () => {
    const csp = getDevCSP();

    expect(csp).toContain("script-src");
    expect(csp).toContain("unsafe-inline");
    expect(csp).toContain("unsafe-eval");
  });

  it("still forbids framing and plugins", () => {
    const csp = getDevCSP();

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("names image hosts instead of allowing every https origin", () => {
    const sources = cspSources(getDevCSP(), "img-src");

    // A bare `https:` let any host on the internet serve an image, and an image
    // request sends the page URL along in `Referer`.
    expect(sources).not.toContain("https:");
    expect(sources).toEqual(
      expect.arrayContaining([
        "'self'",
        "blob:",
        "data:",
        "https://*.r2.cloudflarestorage.com", // presigned packing photos
        "https://lh3.googleusercontent.com", // Google avatars
        "https://www.paypalobjects.com", // the PayPal SDK's logo on /wallet/topup
      ])
    );
  });

  it("names connect hosts instead of allowing every https/wss origin", () => {
    const sources = cspSources(getDevCSP(), "connect-src");

    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("wss:");
    expect(sources).toEqual(
      expect.arrayContaining([
        "wss://*.firebasedatabase.app", // Firebase sockets
      ])
    );
  });

  it("emits well-formed source tokens", () => {
    // The header is hand-concatenated, so a missing space silently glues two
    // sources into one meaningless token that the browser then drops.
    const source =
      /^('self'|'none'|'unsafe-inline'|'unsafe-eval'|'wasm-unsafe-eval'|blob:|data:|https:\/\/\S+|wss?:\/\/\S+|http:\/\/\S+)$/;

    for (const directive of ["img-src", "connect-src"]) {
      const sources = cspSources(getDevCSP(), directive);

      expect(sources.length).toBeGreaterThan(0);
      for (const candidate of sources) {
        expect(candidate, `${directive} source: ${candidate}`).toMatch(source);
      }
    }
  });

  it("keeps the local HMR socket reachable", () => {
    const sources = cspSources(getDevCSP(), "connect-src");

    // Turbopack's fast-refresh channel is a loopback WebSocket; `'self'` only
    // covers http(s), and the dev port is chosen at runtime.
    expect(sources).toContain("ws://localhost:*");
    expect(sources).toContain("ws://127.0.0.1:*");
  });
});

describe("getProductionCSP", () => {
  it("allows the inline hydration scripts that prerendered pages ship", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const scriptSrc = cspDirective(prodCsp(), "script-src");

    // Next writes its bootstrap inline at build time, before any request
    // exists, so a nonce can never match it.
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain("nonce-");
    expect(scriptSrc).not.toContain("strict-dynamic");
  });

  it("names image hosts in production instead of allowing every https origin", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const sources = cspSources(prodCsp(), "img-src");

    expect(sources).not.toContain("https:");
    expect(sources).toEqual(
      expect.arrayContaining([
        "https://*.r2.cloudflarestorage.com",
        "https://lh3.googleusercontent.com",
        "https://www.paypalobjects.com",
      ])
    );
  });

  it("blocks inline event-handler attributes in both policies", async () => {
    // 'unsafe-inline' cannot be dropped for <script> blocks while routes are
    // prerendered, but the attribute form is a separate directive and stays
    // closed: an injected onclick="…" must not run. React never emits one.
    const prod = await importWithEnv({ isDevelopment: false, isProduction: true });
    const dev = await importWithEnv({ isDevelopment: true, isProduction: false });

    expect(cspDirective(prod.getProductionCSP(), "script-src-attr")).toBe(
      "script-src-attr 'none'"
    );
    expect(cspDirective(dev.getDevCSP(), "script-src-attr")).toBe(
      "script-src-attr 'none'"
    );
    // The auth-helper policy is the production one with framing relaxed.
    expect(cspDirective(prod.getAuthHelperCSP(), "script-src-attr")).toBe(
      "script-src-attr 'none'"
    );
  });

  it("keeps unsafe-eval out of the production script-src", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(cspDirective(prodCsp(), "script-src")).not.toContain("unsafe-eval");
  });

  it("keeps the non-nonce lockdown directives", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const csp = prodCsp();

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("report-to 'csp-endpoint'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("still allows inline styles in production for styled components", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(cspDirective(prodCsp(), "style-src")).toContain("unsafe-inline");
  });

  it("allows the reCAPTCHA assets the SMS second factor needs", () => {
    const csp = getProductionCSP();

    // Identity Platform web MFA renders an invisible reCAPTCHA, which loads
    // from google.com/recaptcha and frames recaptcha.google.com. Without these
    // the verifier never resolves, so enrollment and sign-in both hang.
    expect(cspSources(csp, "script-src")).toContain(
      "https://www.google.com/recaptcha/"
    );
    expect(cspSources(csp, "connect-src")).toContain(
      "https://www.google.com/recaptcha/"
    );
    expect(cspSources(csp, "frame-src")).toContain(
      "https://recaptcha.google.com"
    );
  });
  it("allowlists the third-party script hosts the app loads", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    const scriptSrc = cspDirective(prodCsp(), "script-src");

    expect(scriptSrc).toContain("https://js.paypal.com");
    expect(scriptSrc).toContain("https://apis.google.com");
  });

  it("allowlists the PayPal SDK origins in connect-src", async () => {
    const { getProductionCSP: prodCsp } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    // The SDK posts telemetry to its own origin (`/xoplatform/logger/...`), so
    // the `api-m` hosts alone left it reporting CSP refusals on every render.
    const connectSrc = cspSources(prodCsp(), "connect-src");

    expect(connectSrc).toContain("https://www.paypal.com");
    expect(connectSrc).toContain("https://www.sandbox.paypal.com");
  });
});

describe("getSecureCookieOptions", () => {
  it("hardens the cookie in production", async () => {
    const { getSecureCookieOptions: prodOptions } = await importWithEnv({
      isDevelopment: false,
      isProduction: true,
    });

    expect(prodOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 3600,
    });
  });

  it("drops Secure in development so http://localhost works", async () => {
    const { getSecureCookieOptions: devOptions } = await importWithEnv({
      isDevelopment: true,
      isProduction: false,
    });

    expect(devOptions().secure).toBe(false);
    expect(devOptions().httpOnly).toBe(true);
  });
});

describe("createSecureCookieHeader", () => {
  it("serialises a hardened cookie", () => {
    const header = createSecureCookieHeader("test", "value", {
      secure: true,
      maxAge: 100,
    });

    expect(header).toContain("test=value");
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=strict");
    expect(header).toContain("Max-Age=100");
    expect(header).toContain("Secure");
  });

  it("omits Secure when explicitly disabled", () => {
    const header = createSecureCookieHeader("test", "value", { secure: false });

    expect(header).not.toContain("Secure");
  });

  it("omits every optional attribute when they are disabled", () => {
    const header = createSecureCookieHeader("test", "value", {
      path: "",
      secure: false,
      httpOnly: false,
      sameSite: undefined,
      maxAge: 0,
    });

    expect(header).toBe("test=value");
  });
});

describe("CSP source lists", () => {
  it("never repeats a source inside one directive", () => {
    // getDevCSP listed https://www.gstatic.com twice in script-src. Nothing
    // breaks, but it hides a real duplicate when one is added later.
    for (const csp of [getDevCSP(), getProductionCSP()]) {
      for (const directive of csp
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        const [name, ...sources] = directive.split(/\s+/);

        expect(new Set(sources).size, `${name}: ${directive}`).toBe(
          sources.length
        );
      }
    }
  });
});

describe("getAuthHelperCSP", () => {
  it("lets the app frame the Firebase auth helper", () => {
    const csp = getAuthHelperCSP();

    // The SDK embeds /__/auth/* in a hidden iframe on the app's own pages; the
    // app-wide `frame-ancestors 'none'` blocks that and silently hangs every
    // popup and redirect sign-in.
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("is otherwise the production policy", () => {
    const csp = getAuthHelperCSP();

    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("object-src 'none'");
    expect(cspDirective(csp, "script-src")).toContain("'self'");
  });
});

describe("emulator connect sources", () => {
  it("adds the local emulator origins to the dev policy", () => {
    vi.stubEnv("NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", " 127.0.0.1:9099 ");

    try {
      const sources = cspSources(getDevCSP(), "connect-src");

      expect(sources).toContain("http://127.0.0.1:8080");
      expect(sources).toContain("http://127.0.0.1:9099");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("adds nothing when no emulator is configured", () => {
    const sources = cspSources(getDevCSP(), "connect-src");

    expect(
      sources.filter((source) => source.startsWith("http://127.0.0.1")),
    ).toEqual([]);
  });
});
