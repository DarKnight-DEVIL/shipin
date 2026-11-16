/**
 * Startup check: every `src/app/api/**\/route.ts` must be classified.
 *
 * Node-only (reads the source tree), so the proxy must never import it. The
 * previous `validateRouteClassification()` was an empty function, which is how
 * `/api/auth`, `/api/csp-report`, `/api/send-email`, `/api/whatsapp` and
 * `/api/compliance` went unclassified while the startup log said routes were
 * validated: anonymous sign-in answered 401 and CSP reports were dropped in
 * production.
 *
 * Enforcement has two halves:
 *
 *   - `register()` (see instrumentation.ts) throws here at boot when the source
 *     tree is present, so a missing entry cannot reach a running server.
 *   - `routeClassification.test.ts` runs the same walk in every CI unit run,
 *     which covers deployed bundles that ship without `src/`.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyRoute } from "./routeAuth";

/**
 * This app's API folder, resolved from the module rather than `process.cwd()`:
 * the startup hook runs inside a compiled server where the working directory is
 * not guaranteed to be the app root, and referencing `process.cwd` there makes
 * the edge build warn about a Node API it cannot use.
 */
export const API_ROUTE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "api"
);

const ROUTE_FILENAMES = new Set([
  "route.ts",
  "route.tsx",
  "route.js",
  "route.jsx",
  "route.mts",
  "route.mjs",
]);

/**
 * Collect the URL path of every App Router route handler under `apiDir`
 * (`…/src/app/api`). Entries are returned as the URL would be, e.g.
 * `/api/requests/[requestId]/quote`.
 *
 * Route groups — `(group)` segments — are not part of the URL and are dropped;
 * dynamic segments are kept literally, which is what the classifier sees when
 * it prefix-matches a real request path.
 */
export function collectApiRoutePaths(apiDir: string): string[] {
  const routes: string[] = [];

  const walk = (dir: string, segments: string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const isRouteGroup = /^\(.+\)$/.test(entry.name);
        walk(
          path.join(dir, entry.name),
          isRouteGroup ? segments : [...segments, entry.name]
        );
        continue;
      }

      if (ROUTE_FILENAMES.has(entry.name)) {
        routes.push(`/${segments.join("/")}`);
      }
    }
  };

  // Seed with the directory's own name: the caller passes the `api` folder
  // itself, and the URL starts with `/api`.
  walk(apiDir, [path.basename(apiDir)]);
  return routes.sort();
}

export interface UnclassifiedRoute {
  /** Path as the classifier receives it, e.g. `/api/foo/bar`. */
  path: string;
  /** Where to add the entry. */
  hint: string;
}

/** Route paths that no prefix in ROUTE_AUTH_CLASSIFICATION matches. */
export function findUnclassifiedRoutes(routePaths: string[]): UnclassifiedRoute[] {
  return routePaths
    .filter((routePath) => classifyRoute(routePath) === "unclassified")
    .map((routePath) => ({
      path: routePath,
      hint: `${routePath}: add to ROUTE_AUTH_CLASSIFICATION in src/config/routeAuth.ts`,
    }));
}

export class UnclassifiedRouteError extends Error {
  constructor(readonly routes: UnclassifiedRoute[]) {
    super(
      [
        `Unclassified API routes (${routes.length}). The proxy rejects these at`,
        "runtime, so add each one to ROUTE_AUTH_CLASSIFICATION in",
        "src/config/routeAuth.ts:",
        ...routes.map((route) => `  - ${route.path}`),
      ].join("\n")
    );
    this.name = "UnclassifiedRouteError";
  }
}

/**
 * Throw when any route under `apiDir` is unclassified.
 *
 * Returns `{ checked: 0, skipped: "…" }` instead of throwing when the directory
 * does not exist: a deployed build ships compiled output without `src/`, and a
 * missing source tree must not take production down. CI's unit run is the
 * enforcement point for those deployments.
 */
export function assertAllRoutesClassified(
  apiDir: string = API_ROUTE_DIR
): { checked: number; skipped?: string } {
  if (!existsSync(apiDir)) {
    return { checked: 0, skipped: `no route source at ${apiDir}` };
  }

  const routes = collectApiRoutePaths(apiDir);
  const unclassified = findUnclassifiedRoutes(routes);

  if (unclassified.length > 0) {
    throw new UnclassifiedRouteError(unclassified);
  }

  return { checked: routes.length };
}
