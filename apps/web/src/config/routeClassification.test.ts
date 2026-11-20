/**
 * The enforcement point for route classification.
 *
 * The proxy rejects an unclassified `/api/*` request with a 500 in production,
 * and the startup validator throws for it over the generated manifest. This
 * test checks that no route the tree actually contains is unclassified, and
 * pins the four families that were misclassified (anonymous sign-in, CSP
 * reports, and the admin-only operator routes) rather than trusting the prefix
 * table by eye.
 */

import { describe, expect, it } from "vitest";

import {
  API_ROUTE_DIR,
  collectApiRoutePaths,
} from "../../scripts/lib/api-routes.mjs";
import {
  assertAllRoutesClassified,
  findUnclassifiedRoutes,
  UnclassifiedRouteError,
} from "./routeClassification";
import { API_ROUTE_PATHS } from "./apiRoutes.generated";
import { classifyRoute } from "./routeAuth";

describe("the real route tree", () => {
  it("has every route under src/app/api classified", () => {
    const routes = collectApiRoutePaths(API_ROUTE_DIR);

    // A walk that silently found nothing would make this suite pass forever.
    expect(routes.length).toBeGreaterThan(50);
    expect(findUnclassifiedRoutes(routes)).toEqual([]);
    expect(assertAllRoutesClassified(routes).checked).toBe(routes.length);
    // The manifest the boot check reads covers the same routes.
    expect([...API_ROUTE_PATHS]).toEqual(routes);
  });

  it("classifies the anonymous and admin-only families that used to be wrong", () => {
    // Anonymous sign-in was 401 at the proxy before it reached the handler.
    expect(classifyRoute("/api/auth/login-intent")).toBe("public");
    expect(classifyRoute("/api/auth/password-leak-check")).toBe("public");
    // Browsers send no Authorization header on report-uri posts.
    expect(classifyRoute("/api/csp-report")).toBe("public");
    // Each of these handlers already calls requireAdmin; the proxy used to
    // treat them as unclassified and answer 500.
    expect(classifyRoute("/api/send-email")).toBe("admin");
    expect(classifyRoute("/api/whatsapp/test")).toBe("admin");
    expect(classifyRoute("/api/compliance/breach")).toBe("admin");
    expect(classifyRoute("/api/compliance/dashboard")).toBe("admin");
  });

  it("keeps the rest of the surface where it was", () => {
    expect(classifyRoute("/api/health")).toBe("public");
    expect(classifyRoute("/api/webhook")).toBe("public");
    expect(classifyRoute("/api/tracking/SHIP123")).toBe("public");
    expect(classifyRoute("/api/r2/view")).toBe("customer");
    expect(classifyRoute("/api/auth/mfa/totp/verify")).toBe("customer");
    expect(classifyRoute("/api/user/erase")).toBe("customer");
    expect(classifyRoute("/api/admin/requests/x/refund")).toBe("admin");
  });
});

describe("assertAllRoutesClassified", () => {
  it("throws, naming the offending routes, when one is unclassified", () => {
    const routes = ["/api/health", "/api/brand-new"];

    expect(() => assertAllRoutesClassified(routes)).toThrow(
      UnclassifiedRouteError
    );
    expect(() => assertAllRoutesClassified(routes)).toThrow("/api/brand-new");
    // The classified one must not be reported alongside it.
    expect(() => assertAllRoutesClassified(routes)).not.toThrow("/api/health");
  });

  it("skips instead of passing when there is nothing to check", () => {
    // An empty manifest is a broken generated file, not a clean bill of health.
    expect(assertAllRoutesClassified([])).toEqual({
      checked: 0,
      skipped: "empty route manifest",
    });
  });
});
