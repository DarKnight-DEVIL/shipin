// @vitest-environment node

/**
 * The static CSP injector.
 *
 * Two things are load-bearing here and neither is obvious from the code:
 *
 *   1. The host allowlist in `inject-static-csp.mjs` is a copy of the one in
 *      `securityHeaders.ts`, because the injector runs in plain Node after the build
 *      while the real policy is TypeScript. A copy that drifts means every
 *      prerendered page silently narrows away a host the app needs - PayPal or
 *      reCAPTCHA stops loading, and nothing fails until a browser tries.
 *
 *   2. The hashes must describe the scripts on that page and nothing else. Too few
 *      and the page is bricked; too many and the policy claims to allow content that
 *      is not there.
 */

import { describe, expect, it } from "vitest";

import { getProductionCSP } from "./securityHeaders";

import { strictScriptSrc } from "../../scripts/inject-static-csp.mjs";

describe("strictScriptSrc", () => {
  it("carries the same hosts the app sends, so nothing is narrowed away", () => {
    const fromApp = (getProductionCSP().match(/script-src ([^;]+);/) ?? [])[1]
      .split(/\s+/)
      .filter((source) => source && source !== "'unsafe-inline'")
      .sort();

    const fromInjector = strictScriptSrc([])
      .replace("script-src ", "")
      .split(/\s+/)
      .sort();

    expect(fromInjector).toEqual(fromApp);
  });

  it("drops 'unsafe-inline' and allows exactly the given hashes", () => {
    const policy = strictScriptSrc(["AAA=", "BBB="]);

    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).toContain("'sha256-AAA='");
    expect(policy).toContain("'sha256-BBB='");
    expect(policy).not.toContain("'nonce-");
  });
});
