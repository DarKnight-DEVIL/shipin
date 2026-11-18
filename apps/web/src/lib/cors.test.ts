import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAllowedOrigin, getCorsHeaders } from "./cors";

const originalEnv = process.env.APP_ALLOWED_ORIGINS;
const originalAppUrl = process.env.APP_URL;
const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalFirebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const originalVercelEnv = {
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
};

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// The deployment origin is configuration, not code. These tests set APP_URL the
// way a deployment does, which is also the regression test for the old
// hard-coded `shipin-psi.vercel.app` entry.
beforeEach(() => {
  process.env.APP_URL = "https://shipin-psi.vercel.app";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "shipin-9576a";
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  restoreEnv("APP_ALLOWED_ORIGINS", originalEnv);
  restoreEnv("APP_URL", originalAppUrl);
  restoreEnv("NEXT_PUBLIC_APP_URL", originalPublicAppUrl);
  restoreEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", originalFirebaseProjectId);
  for (const [key, value] of Object.entries(originalVercelEnv)) {
    restoreEnv(key, value);
  }
});

describe("isAllowedOrigin", () => {
  it("allows the origin configured in APP_URL", () => {
    expect(isAllowedOrigin("https://shipin-psi.vercel.app")).toBe(true);
  });

  it("follows a domain move without a code change", () => {
    process.env.APP_URL = "https://shipin.example.com";

    expect(isAllowedOrigin("https://shipin.example.com")).toBe(true);
    expect(isAllowedOrigin("https://shipin-psi.vercel.app")).toBe(false);
  });

  it("also honours NEXT_PUBLIC_APP_URL", () => {
    delete process.env.APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.com/app";

    expect(isAllowedOrigin("https://preview.example.com")).toBe(true);
  });

  it("allows both Firebase Hosting domains", () => {
    expect(isAllowedOrigin("https://shipin-9576a.web.app")).toBe(true);
    expect(isAllowedOrigin("https://shipin-9576a.firebaseapp.com")).toBe(true);
  });

  it("allows local development on both loopback hosts", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("allows loopback on any port outside production", () => {
    // `next dev` reuses another port when 3000 is busy; the page then talks to
    // an API on that port and must not be rejected as cross-origin.
    expect(isAllowedOrigin("http://localhost:58231")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedOrigin("http://[::1]:3000")).toBe(true);
  });

  it("rejects a non-loopback host that merely contains localhost", () => {
    expect(isAllowedOrigin("http://localhost.evil.com:3000")).toBe(false);
    expect(isAllowedOrigin("http://notlocalhost:3000")).toBe(false);
  });

  it("does not allow loopback ports in production", () => {
    const previous = process.env.NODE_ENV;
    // @ts-expect-error NODE_ENV is readonly in the Node types but writable at runtime
    process.env.NODE_ENV = "production";

    try {
      expect(isAllowedOrigin("http://localhost:58231")).toBe(false);
      expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    } finally {
      // @ts-expect-error see above
      process.env.NODE_ENV = previous;
    }
  });

  it("normalizes case and a trailing slash", () => {
    expect(isAllowedOrigin("HTTPS://Shipin-9576a.web.app/")).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("rejects a lookalike host that only ends with an allowed name", () => {
    expect(isAllowedOrigin("https://shipin-9576a.web.app.evil.com")).toBe(
      false
    );
    expect(isAllowedOrigin("https://evil-shipin-9576a.web.app")).toBe(false);
  });

  it("rejects a missing origin", () => {
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it("accepts origins added through APP_ALLOWED_ORIGINS", () => {
    process.env.APP_ALLOWED_ORIGINS =
      "https://shipin.example.com, https://staging.example.com/";

    expect(isAllowedOrigin("https://shipin.example.com")).toBe(true);
    expect(isAllowedOrigin("https://staging.example.com")).toBe(true);
    expect(isAllowedOrigin("https://other.example.com")).toBe(false);
  });
});

describe("explicit subdomain wildcard", () => {
  it("allows a subdomain of a wildcard entry", () => {
    // The only sanctioned wildcard form: `https://*.<domain>`, opted into
    // through APP_ALLOWED_ORIGINS. Everything else stays an exact match.
    process.env.APP_ALLOWED_ORIGINS = "https://*.shop.example.com";

    expect(isAllowedOrigin("https://app.shop.example.com")).toBe(true);
  });

  it("does not allow the bare domain the wildcard is anchored on", () => {
    process.env.APP_ALLOWED_ORIGINS = "https://*.shop.example.com";

    expect(isAllowedOrigin("https://shop.example.com")).toBe(false);
  });

  it("does not match a lookalike host", () => {
    process.env.APP_ALLOWED_ORIGINS = "https://*.example.com";

    // The match is on the `.<domain>` suffix, so a host that only ends with
    // the domain's letters is not a subdomain of it.
    expect(isAllowedOrigin("https://example.com.evil.test")).toBe(false);
    expect(isAllowedOrigin("https://notexample.com")).toBe(false);
  });

  it("applies only to https", () => {
    process.env.APP_ALLOWED_ORIGINS = "https://*.example.com";

    expect(isAllowedOrigin("http://app.example.com")).toBe(false);
  });
});

describe("Vercel preview deployments", () => {
  beforeEach(() => {
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it("allows the origin of the deployment the process runs on", () => {
    // Generated per preview build; the browser sends it as Origin on
    // same-origin POSTs, so without this every preview sign-in is 403.
    process.env.VERCEL_URL = "shipin-psi-k3j9x2-darkn.vercel.app";

    expect(isAllowedOrigin("https://shipin-psi-k3j9x2-darkn.vercel.app")).toBe(
      true
    );
  });

  it("allows the branch alias of the deployment", () => {
    process.env.VERCEL_BRANCH_URL =
      "shipin-psi-git-feat-login-darkn.vercel.app";

    expect(
      isAllowedOrigin("https://shipin-psi-git-feat-login-darkn.vercel.app")
    ).toBe(true);
  });

  it("allows the production domain Vercel reports", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "shipin-preview.example.com";

    expect(isAllowedOrigin("https://shipin-preview.example.com")).toBe(true);
  });

  it("normalises a host that arrives with a protocol or trailing slash", () => {
    process.env.VERCEL_URL = "https://Shipin-Psi-AbC12-darkn.vercel.app/";

    expect(isAllowedOrigin("https://shipin-psi-abc12-darkn.vercel.app")).toBe(
      true
    );
  });

  it("still rejects other Vercel projects when nothing is configured", () => {
    // Deliberately not a `*.vercel.app` wildcard: any project deployed there
    // would otherwise be trusted by the API.
    expect(isAllowedOrigin("https://some-other-app-abc123.vercel.app")).toBe(
      false
    );
  });

  it("does not accept a lookalike suffix for the deployment host", () => {
    process.env.VERCEL_URL = "shipin-psi-k3j9x2-darkn.vercel.app";

    expect(
      isAllowedOrigin("https://shipin-psi-k3j9x2-darkn.vercel.app.evil.com")
    ).toBe(false);
  });

  it("echoes the deployment origin in CORS headers", () => {
    process.env.VERCEL_URL = "shipin-psi-k3j9x2-darkn.vercel.app";
    const headers = getCorsHeaders(
      "https://shipin-psi-k3j9x2-darkn.vercel.app"
    );

    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://shipin-psi-k3j9x2-darkn.vercel.app"
    );
  });
});

describe("getCorsHeaders", () => {
  it("echoes an allowed origin and permits credentials", () => {
    const headers = getCorsHeaders("https://shipin-9576a.web.app");

    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://shipin-9576a.web.app"
    );
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("omits the allow-origin header for an unknown origin", () => {
    const headers = getCorsHeaders("https://evil.example.com");

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("returns standard headers even for disallowed origin", () => {
    const headers = getCorsHeaders("https://evil.example.com");
    expect(headers["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers["Access-Control-Max-Age"]).toBe("86400");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("handles null origin gracefully", () => {
    const headers = getCorsHeaders(null);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});
