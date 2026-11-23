/**
 * `scripts/check-production-env.ts` and `scripts/start-preflight.ts` run under
 * plain Node (`node --experimental-strip-types`), not through Next: no bundler,
 * no `tsconfig` `paths`, no `@/` alias. They work only while every module they
 * reach is import-free — one `@/lib/...` import resolves in `tsc` and the
 * bundler, passes every typecheck, and fails at release time with
 * `ERR_MODULE_NOT_FOUND` (or, worse, when a container starts).
 *
 * Both entries exist for different moments: the first is the CI/deploy
 * preflight, the second runs before `server.js` in `npm start` and the image.
 *
 * This walks the real import graph and fails on any specifier plain Node could
 * not resolve, so the property is enforced rather than incidental.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** `apps/web`, from this file's location. */
const APP_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const ENTRIES = [
  path.join(APP_ROOT, "scripts", "check-production-env.ts"),
  path.join(APP_ROOT, "scripts", "start-preflight.ts"),
];
const VALIDATOR = path.join(APP_ROOT, "src", "config", "env", "production.ts");

/** `import x from "y"`, `export … from "y"`, `import("y")`. */
const SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*)["']([^"']+)["']/g;

function specifiersIn(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(SPECIFIER)].map(
    (match) => match[1]
  );
}

/** The file a relative specifier names, or null if it is not a relative one. */
function resolveSpecifier(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
    try {
      if (candidate.endsWith(".ts") && statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Not this candidate.
    }
  }
  return null;
}

const relativeToApp = (file: string) =>
  path.relative(APP_ROOT, file).replaceAll(path.sep, "/");

describe("the production-env entrypoints", () => {
  it("reach the validator through imports plain Node can resolve", () => {
    const unresolvable: string[] = [];
    const aliasOrPackage: string[] = [];
    const seen = new Set<string>();
    const queue = [...ENTRIES];

    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);

      for (const specifier of specifiersIn(file)) {
        const target = resolveSpecifier(file, specifier);
        if (target) {
          queue.push(target);
          continue;
        }
        const where = `${relativeToApp(file)} imports "${specifier}"`;
        if (specifier.startsWith(".")) unresolvable.push(where);
        else aliasOrPackage.push(where);
      }
    }

    expect(
      aliasOrPackage,
      "plain Node has no tsconfig paths and no bundler: an `@/` alias or a " +
        "package import reached from one of these scripts fails with " +
        "ERR_MODULE_NOT_FOUND when a release or container starts, even though " +
        "tsc resolves it. Keep the chain dependency-free."
    ).toEqual([]);

    expect(
      unresolvable,
      "a relative import in the scripts' graph does not resolve to a file"
    ).toEqual([]);

    // Without this the test would pass while walking nothing. The container
    // runs the start path, so that one is load-bearing.
    expect(seen).toContain(VALIDATOR);
    for (const entry of ENTRIES) expect(seen).toContain(entry);
  });
});
