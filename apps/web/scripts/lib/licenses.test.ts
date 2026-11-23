// @ts-nocheck
/**
 * Licence-gate logic.
 *
 * Two failure modes make a licence gate worthless, and both are about SPDX
 * strings rather than about licences: mis-reading "A AND B" as "A or B" lets a
 * copyleft dependency through, and refusing "(MPL-2.0 OR Apache-2.0)" makes
 * every run red until someone deletes the gate. The expression cases below pin
 * both directions, and the allowlist cases pin that an exception cannot outlive
 * its expiry — including when the package it covered has already gone.
 */

import { describe, expect, it } from "vitest";

import {
  MISSING,
  checkLicenses,
  isPermitted,
  licenseIds,
  matchesPackage,
  packageNameFromPath,
  productionPackages,
} from "./licenses.mjs";

describe("isPermitted", () => {
  it("accepts the permissive licences the app already ships on", () => {
    for (const license of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "MPL-2.0"]) {
      expect(isPermitted(license), license).toBe(true);
    }
  });

  it("is case-insensitive, as SPDX identifiers are", () => {
    expect(isPermitted("mit")).toBe(true);
    expect(isPermitted("Apache-2.0")).toBe(true);
  });

  it("requires every branch of an AND", () => {
    expect(isPermitted("MIT AND ISC")).toBe(true);
    expect(isPermitted("MIT AND GPL-3.0")).toBe(false);
    expect(isPermitted("(MIT AND Zlib)")).toBe(true);
  });

  it("accepts an OR when either branch is allowed", () => {
    expect(isPermitted("(MPL-2.0 OR Apache-2.0)")).toBe(true);
    expect(isPermitted("GPL-3.0 OR MIT")).toBe(true);
    expect(isPermitted("GPL-3.0 OR AGPL-3.0")).toBe(false);
  });

  it("does not treat a file reference as a licence name", () => {
    // `rgbcolor` publishes "MIT OR SEE LICENSE IN FEEL-FREE.md".
    expect(isPermitted("MIT OR SEE LICENSE IN FEEL-FREE.md")).toBe(true);
    expect(isPermitted("SEE LICENSE IN LICENCE.txt")).toBe(false);
  });

  it("fails closed on an empty or unreadable expression", () => {
    expect(isPermitted("")).toBe(false);
    expect(isPermitted(undefined)).toBe(false);
  });

  it("gives AND precedence over OR, as SPDX specifies", () => {
    // GPL AND MIT is false; treating it as (GPL) AND (MIT OR AGPL) would also
    // be false, but MIT OR GPL AND AGPL must be MIT OR (GPL AND AGPL) = true.
    expect(isPermitted("MIT OR GPL-3.0 AND AGPL-3.0")).toBe(true);
    expect(isPermitted("Apache-2.0 AND (GPL-3.0 OR AGPL-3.0)")).toBe(false);
  });
});

describe("licenseIds", () => {
  it("lists the identifiers without the operators or parentheses", () => {
    expect(licenseIds("(MIT AND Zlib)")).toEqual(["MIT", "Zlib"]);
    expect(licenseIds("MIT OR SEE LICENSE IN FEEL-FREE.md")).toEqual([
      "MIT",
      "SEE-LICENSE",
    ]);
  });
});

describe("matchesPackage", () => {
  it("matches an exact name or a scope prefix", () => {
    expect(matchesPackage("@splinetool/react-spline", "@splinetool/*")).toBe(true);
    expect(matchesPackage("@splinetool/runtime", "@splinetool/*")).toBe(true);
    expect(matchesPackage("country-state-city", "country-state-city")).toBe(true);
    expect(matchesPackage("country-state-city-extra", "country-state-city")).toBe(
      false
    );
    expect(matchesPackage("anything", "*")).toBe(true);
  });
});

describe("packageNameFromPath", () => {
  it("reads the name after the last node_modules segment", () => {
    expect(
      packageNameFromPath("node_modules/a/node_modules/@scope/pkg", {})
    ).toBe("@scope/pkg");
    expect(packageNameFromPath("node_modules/limiter", {})).toBe("limiter");
  });
});

describe("productionPackages", () => {
  it("skips dev-only, linked workspace and non-dependency entries", () => {
    const lockfile = {
      packages: {
        "": { name: "root" },
        "apps/web": { name: "@shipin/web" },
        "node_modules/@shipin/web": { link: true, resolved: "apps/web" },
        "node_modules/dev-tool": { version: "1.0.0", dev: true, license: "GPL-3.0" },
        "node_modules/mit-pkg": { version: "1.0.0", license: "MIT" },
        "node_modules/shared-pkg": { version: "1.0.0" },
      },
    };

    const packages = productionPackages(lockfile);

    expect(packages.map((pkg) => pkg.name)).toEqual(["mit-pkg", "shared-pkg"]);
  });

  it("accepts the legacy `{ type }` licence shape", () => {
    const packages = productionPackages({
      packages: { "node_modules/limiter": { license: { type: "MIT" } } },
    });

    expect(packages[0].license).toBe("MIT");
  });
});

describe("checkLicenses", () => {
  const packages = [
    { name: "mit-pkg", license: "MIT", optional: false },
    { name: "gpl-pkg", license: "GPL-3.0", optional: false },
    { name: "unknown-pkg", license: "", optional: false },
  ];

  it("reports only the packages that need a decision", () => {
    const { violations } = checkLicenses(packages, { allowlist: [] });

    expect(violations.map((pkg) => pkg.name)).toEqual([
      "gpl-pkg",
      "unknown-pkg",
    ]);
  });

  it("accepts a dated allowlist entry for the exact licence", () => {
    const { violations, allowed }: { violations: unknown; allowed: Array<{ name: string; license: string; expires: string }> } = checkLicenses(packages, {
            allowlist: [
        { package: "gpl-pkg", license: "GPL-3.0", expires: "2999-01-01" },
        { package: "unknown-pkg", license: MISSING, expires: "2999-01-01" },
      ],
    });
    expect(violations).toEqual([]);
    expect(allowed.map((pkg) => pkg.name).sort()).toEqual([
      "gpl-pkg",
      "unknown-pkg",
    ]);
  });

  it("does not let an entry for another licence cover the package", () => {
    // @ts-nocheck
    const { violations} = checkLicenses([packages[1]], {
      allowlist: [{ package: "gpl-pkg", license: "MIT", expires: "2999-01-01" }],
    });

    expect(violations.map((pkg) => pkg.name)).toEqual(["gpl-pkg"]);
  });

  it("fails on an expired entry even when nothing needs it", () => {
        const { expired, violations } = checkLicenses([packages[0]], {
      allowlist: [
        { package: "gone-pkg", license: "GPL-3.0", expires: "2020-01-01" },
      ],
      today: new Date("2026-11-21T00:00:00Z"),
    });

    expect(violations).toEqual([]);
    expect(expired.map((entry) => entry.package)).toEqual(["gone-pkg"]);
  });
});
