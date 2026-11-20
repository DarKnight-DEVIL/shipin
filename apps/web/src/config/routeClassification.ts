/**
 * Startup check: every `src/app/api/**\/route.ts` must be classified.
 *
 * Enforcement has two halves:
 *
 *   - `register()` (see instrumentation.ts) throws here at boot when any route
 *     in the manifest is unclassified, so a missing entry cannot reach a
 *     running server.
 *   - `scripts/lib/api-routes.test.ts` re-walks the real tree in CI and fails
 *     when the manifest no longer matches it, and `routeClassification.test.ts`
 *     pins the classification of every route it lists.
 *
 * The route list is generated (`npm run gen:api-routes`) rather than walked
 * here: a runtime walk needs `node:fs` on a path Turbopack cannot resolve, which
 * made the build trace the entire project into the standalone output — an
 * output that ships without `src/` anyway, so the walk returned "skipped" in
 * exactly the deployments it was meant to protect.
 *
 * The previous `validateRouteClassification()` was an empty function, which is
 * how `/api/auth`, `/api/csp-report`, `/api/send-email`, `/api/whatsapp` and
 * `/api/compliance` went unclassified while the startup log said routes were
 * validated: anonymous sign-in answered 401 and CSP reports were dropped in
 * production.
 */
import { API_ROUTE_PATHS } from "./apiRoutes.generated";

import { classifyRoute } from "./routeAuth";

export interface UnclassifiedRoute {
  /** Path as the classifier receives it, e.g. `/api/foo/bar`. */
  path: string;
  /** Where to add the entry. */
  hint: string;
}

/** Route paths that no prefix in ROUTE_AUTH_CLASSIFICATION matches. */
export function findUnclassifiedRoutes(
  routePaths: readonly string[]
): UnclassifiedRoute[] {
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
 * Throw when any route in `routePaths` is unclassified.
 *
 * Returns `{ checked: 0, skipped: "…" }` for an empty manifest — a generated
 * file that lost its contents, or a caller that passed a filtered list — rather
 * than reporting a clean bill of health for zero routes.
 */
export function assertAllRoutesClassified(
  routePaths: readonly string[] = API_ROUTE_PATHS
): { checked: number; skipped?: string } {
  if (routePaths.length === 0) {
    return { checked: 0, skipped: "empty route manifest" };
  }

  const unclassified = findUnclassifiedRoutes(routePaths);

  if (unclassified.length > 0) {
    throw new UnclassifiedRouteError(unclassified);
  }

  return { checked: routePaths.length };
}
