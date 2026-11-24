/**
 * Page-level accessibility checks.
 *
 * The component suites cannot see contrast, landmarks, heading order or form
 * labels as rendered; axe can. These are the public pages, so the check runs
 * without an Auth emulator and without a seeded account. Only `serious` and
 * `critical` findings fail: `minor`/`moderate` are reported by axe as advisory
 * and would make the gate noisy enough to be ignored.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core"), "utf8");

const PUBLIC_PAGES = ["/", "/login", "/track"];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  targets: unknown[];
}

for (const route of PUBLIC_PAGES) {
  test(`has no serious accessibility violations on ${route}`, async ({
    page,
  }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: axeSource });

    const violations = await page.evaluate(async (): Promise<AxeViolation[]> => {
      const axe = (
        window as unknown as {
          axe: {
            run: (context: Document) => Promise<{
              violations: Array<{
                id: string;
                impact: string | null;
                help: string;
                nodes: Array<{ target: unknown }>;
              }>;
            }>;
          };
        }
      ).axe;

      const results = await axe.run(document);

      return results.violations
        .filter(
          (violation) =>
            violation.impact === "serious" || violation.impact === "critical"
        )
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.map((node) => node.target),
        }));
    });

    expect(violations).toEqual([]);
  });
}
