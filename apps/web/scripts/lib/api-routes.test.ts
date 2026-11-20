/**
 * The walker that generates `src/config/apiRoutes.generated.ts`.
 *
 * The manifest is committed so a checkout builds without a codegen step, which
 * only holds if something fails when a route is added and the file is not
 * regenerated. That is the second test here.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  API_ROUTE_DIR,
  MANIFEST_PATH,
  buildManifestSource,
  collectApiRoutePaths,
} from "./api-routes.mjs";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

/** Build a fake app tree and return its `api` directory. */
function makeTree(files: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "api-routes-"));
  created.push(root);

  for (const file of files) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, "export const GET = () => new Response(null);\n");
  }

  return path.join(root, "api");
}

describe("collectApiRoutePaths", () => {
  it("derives URL paths, keeps dynamic segments and drops route groups", () => {
    const apiDir = makeTree([
      "api/health/route.ts",
      "api/requests/[requestId]/quote/route.ts",
      "api/(internal)/support/route.ts",
      "api/health/helper.ts",
      "lib/not-an-api/route.ts",
    ]);

    expect(collectApiRoutePaths(apiDir)).toEqual([
      "/api/health",
      "/api/requests/[requestId]/quote",
      "/api/support",
    ]);
  });

  it("finds every handler in the real tree", () => {
    const routes = collectApiRoutePaths(API_ROUTE_DIR);

    // A walk that silently found nothing would make the manifest test vacuous.
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.every((route) => route.startsWith("/api"))).toBe(true);
  });
});

describe("the generated manifest", () => {
  it("matches the routes that exist", () => {
    const expected = buildManifestSource(collectApiRoutePaths(API_ROUTE_DIR));

    expect(readFileSync(MANIFEST_PATH, "utf8")).toBe(expected);
  });
});
