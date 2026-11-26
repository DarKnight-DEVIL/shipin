// @vitest-environment node

/**
 * Per-request CSP nonces.
 *
 * The rule under test is not "a nonce exists" but "a nonce is applied only where
 * the page is rendered per request". Applying one to a prerendered page blocks the
 * inline bootstrap baked into its HTML, which is a broken app rather than a
 * stricter policy - so the negative case matters more than the positive one.
 */

import { describe, expect, it } from "vitest";

import {
  applyNonceToCsp,
  createCspNonce,
  isDynamicallyRendered,
} from "./cspNonce";
import { getProductionCSP } from "./securityHeaders";
import { DYNAMIC_APP_ROUTES } from "@/config/dynamicRoutes.generated";

describe("createCspNonce", () => {
  it("returns a fresh, unguessable value each time", () => {
    const first = createCspNonce();
    const second = createCspNonce();

    expect(first).not.toBe(second);
    // base64 of 16 bytes: 24 characters including padding.
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("applyNonceToCsp", () => {
  const csp = getProductionCSP();

  it("trusts the nonce and drops inline-script permission", () => {
    const hardened = applyNonceToCsp(csp, "abc123", []);

    expect(hardened).toContain("'nonce-abc123'");
    // Leaving 'unsafe-inline' in would read as if inline scripts were still
    // allowed; browsers ignore it once a nonce is present, so the policy would lie.
    expect(hardened).not.toContain("'unsafe-inline' https://www.gstatic.com");
    expect(hardened.match(/script-src [^;]+/)?.[0]).not.toContain("'unsafe-inline'");
  });

  it("keeps the third-party hosts the app actually loads", () => {
    // strict-dynamic would discard the host list and take PayPal, reCAPTCHA and the
    // analytics script with it, without making inline scripts any stricter.
    const hardened = applyNonceToCsp(csp, "abc123", []);

    for (const host of [
      "https://js.paypal.com",
      "https://www.gstatic.com",
      "https://va.vercel-scripts.com",
    ]) {
      expect(hardened).toContain(host);
    }
    expect(hardened).not.toContain("strict-dynamic");
  });

  it("allows a shared inline bootstrap by hash, since Next does not stamp it", () => {
    // next-themes' pre-paint theme script is not Next's to stamp; without this
    // allowance it is blocked and dark-mode users get a light flash.
    const hardened = applyNonceToCsp(csp, "abc123", ["hashAAA=", "hashBBB="]);

    expect(hardened).toContain("'sha256-hashAAA='");
    expect(hardened).toContain("'sha256-hashBBB='");
  });

  it("keeps the directive that does not depend on a nonce", () => {
    expect(applyNonceToCsp(csp, "abc123", [])).toContain("script-src-attr 'none'");
  });

  it("leaves the rest of the policy alone", () => {
    const hardened = applyNonceToCsp(csp, "abc123", []);

    for (const directive of [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(hardened).toContain(directive);
    }
  });
});

describe("isDynamicallyRendered", () => {
  it("says no for a prerendered route", () => {
    // Measured against this app's build: /admin/dashboard is prerendered and its
    // HTML carries four inline scripts with no nonce. A nonce here would block
    // hydration, so this case is the guard against that.
    expect(isDynamicallyRendered("/admin/dashboard")).toBe(false);
    expect(isDynamicallyRendered("/")).toBe(false);
  });

  it("does not leak a pattern onto its prerendered parent", () => {
    // /requests/[id] is dynamic and /requests is prerendered. Matching by prefix
    // would hand the list page a nonce and break it, so the parent must say no
    // while the child says yes.
    expect(isDynamicallyRendered("/requests")).toBe(false);
    expect(isDynamicallyRendered("/requests/new")).toBe(false);
    expect(isDynamicallyRendered("/requests/abc123")).toBe(true);
    expect(isDynamicallyRendered("/requests/abc123/invoice")).toBe(true);
    expect(isDynamicallyRendered("/track")).toBe(false);
    expect(isDynamicallyRendered("/track/SHP-2026-000001")).toBe(true);
  });

  it("matches each generated route and everything beneath it", () => {
    // The list is empty in a fully prerendered build - that is the correct state,
    // not a missing mechanism. Whatever it holds must match itself and its
    // children, because that is how the proxy decides per request.
    for (const route of DYNAMIC_APP_ROUTES) {
      // The pattern itself is not a URL; a value substituted into each bracket
      // is, and the matcher must claim it.
      expect(isDynamicallyRendered(route.replace(/\[[^\]]+\]/g, "abc123"))).toBe(
        true
      );
    }

    if (DYNAMIC_APP_ROUTES.length === 0) {
      expect(isDynamicallyRendered("/admin/dashboard")).toBe(false);
    }
  });
});
