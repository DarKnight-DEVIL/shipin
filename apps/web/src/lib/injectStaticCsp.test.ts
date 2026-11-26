// @vitest-environment node

/**
 * The static CSP injector.
 *
 * Three things are load-bearing here and none is obvious from the code:
 *
 *   1. The host allowlist in `inject-static-csp.mjs` is a copy of the one in
 *      `securityHeaders.ts`, because the injector runs in plain Node after the build
 *      while the real policy is TypeScript. A copy that drifts means every
 *      prerendered page silently narrows away a host the app needs - PayPal or
 *      reCAPTCHA stops loading, and nothing fails until a browser tries.
 *
 *   2. The PayPal exemptions are a second copy of the same kind, and the dangerous
 *      direction is a page that loads the PayPal SDK but is NOT exempt: its inline
 *      bootstrap is then refused at runtime. That is not hypothetical - it was
 *      measured on /wallet/topup before this list existed.
 *
 *   3. The hashes must describe the scripts on that page and nothing else. Too few
 *      and the page is bricked; too many and the policy claims to allow content that
 *      is not there.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PAYPAL_SCRIPT_ROUTES } from "@/config/paypalScriptRoutes";

import { getProductionCSP } from "./securityHeaders";

import { strictScriptSrc } from "../../scripts/inject-static-csp.mjs";

const injectorSource = readFileSync(
  path.resolve(__dirname, "../../scripts/inject-static-csp.mjs"),
  "utf8"
);

/** Reads the array the injector keeps its own copy of. */
function injectorList(name: string): string[] {
  const match = injectorSource.match(
    new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`)
  );
  if (!match) throw new Error(`${name} not found in the injector`);

  return JSON.parse(
    match[1].replace(/'/g, '"').replace(/,\s*\]/g, "]")
  );
}

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

describe("PayPal script-src exemptions", () => {
  it("matches the injector's copy", () => {
    expect(injectorList("PAYPAL_ROUTES")).toEqual([...PAYPAL_SCRIPT_ROUTES]);
  });

  it("covers every page that loads the PayPal SDK", () => {
    // A page importing the provider (or the checkout that wraps it) lets the SDK
    // inject an inline script, so it cannot be on the strict policy.
    const appDir = path.resolve(__dirname, "..", "app");
    const pages: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "page.tsx") pages.push(full);
      }
    };
    walk(appDir);

    const withPayPal = pages
      .filter((file) =>
        /from "@\/components\/(PayPalProvider|payment\/PayPalCheckout)"/.test(
          readFileSync(file, "utf8")
        )
      )
      .map((file) =>
        `/${path
          .relative(appDir, file)
          .replace(/\\/g, "/")
          .replace(/^\([^)]+\)\//, "")
          .replace(/\/page\.tsx$/, "")}`
      )
      .sort();

    const exempt = new Set(PAYPAL_SCRIPT_ROUTES);

    expect(
      withPayPal.filter((route) => !exempt.has(route)),
      "these pages load the PayPal SDK but are on the strict policy, whose meta blocks the SDK's inline bootstrap"
    ).toEqual([]);
  });
});
