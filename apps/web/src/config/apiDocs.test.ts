import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { API_ROUTE_PATHS } from "@/config/apiRoutes.generated";
import { classifyRoute } from "@/config/routeAuth";

/**
 * `docs/API.md` is generated, and this is the check that keeps it true.
 *
 * The generator parses `routeAuth.ts` as text, so it re-implements the matching
 * rule; the value of this test is that it compares the *document's* rows against
 * `classifyRoute()` from the real module, for every route in the generated
 * manifest. A route added without regenerating, a row edited by hand, or a parse
 * that silently drifts all fail here rather than in someone's integration.
 */
const doc = readFileSync(
  // src/config → src → apps/web → apps → repo root, where docs/ lives.
  new URL("../../../../docs/API.md", import.meta.url),
  "utf8"
).replace(/\r\n/g, "\n");

/** `| \`/api/x\` | customer |` rows of the generated table. */
const documented = new Map<string, string>(
  [...doc.matchAll(/^\| `(\/api[^`]*)` \| (\w+) \|$/gm)].map(([, route, auth]) => [
    route,
    auth,
  ])
);

describe("docs/API.md", () => {
  it("documents every route handler", () => {
    const missing = API_ROUTE_PATHS.filter((route) => !documented.has(route));

    expect(
      missing,
      `routes with no row in docs/API.md: ${missing.join(", ")}`
    ).toEqual([]);

    const extra = [...documented.keys()].filter(
      (route) => !API_ROUTE_PATHS.includes(route)
    );

    expect(extra, `rows for routes that no longer exist: ${extra.join(", ")}`).toEqual(
      []
    );
  });

  it("gives every route the class classifyRoute() gives it", () => {
    const wrong = API_ROUTE_PATHS.filter(
      (route) => documented.get(route) !== classifyRoute(route)
    ).map((route) => `${route}: doc=${documented.get(route)} code=${classifyRoute(route)}`);

    expect(wrong, `documented class disagrees with routeAuth.ts: ${wrong.join("; ")}`).toEqual(
      []
    );
  });

  it("records the contract rules a caller depends on", () => {
    // These are the four things a client has to know and cannot get from a
    // single route: the envelope discriminator, the edge auth code, the rate
    // limit code, and the App Check header.
    for (const anchor of [
      '"success": false',
      "AUTHENTICATION_REQUIRED",
      "RATE_LIMIT_ERROR",
      "X-Firebase-AppCheck",
    ]) {
      expect(doc, `docs/API.md no longer mentions ${anchor}`).toContain(anchor);
    }
  });
});
