import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "path";

/* __dirname for this test: C:\Users\darkn\shipin\apps\web\src\config\env
   Repo root: C:\Users\darkn\shipin
   Need 5 '..' to go from env/ to repo root:
   env/ → config/ → src/ → web/ → apps/ → repo root
*/
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");

const deploymentSource = readFileSync(path.join(repoRoot, "DEPLOYMENT.md"), "utf8").replace(/\r\n/g, "\n");

/* Extract the "Required Vercel Environment Variables" table rows.
   Each row: | Variable | Required | Description | */
function rowsIn(table: string): Array<{ variable: string; required: string; description: string }> {
  const result: Array<{ variable: string; required: string; description: string }> = [];
  const lines = table.split("\n");
  let inTable = false;

  for (const line of lines) {
    if (/^\s*###\s+Required\s+Vercel\s+Environment\s+Variables/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|")) {
      // Skip the header divider row
      if (/^\s*\|\s*--/.test(line)) continue;

      // Split on | and strip
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      // Expected: [empty, variable, required, description] or with backticks
      if (parts.length >= 3) {
        // Variable is in backticks: `VARIABLE`
        let variable = parts[1];
        // Remove surrounding backticks if present
        if (variable.startsWith("`") && variable.endsWith("`")) {
          variable = variable.slice(1, -1);
        }
        const required = parts[2];
        const description = parts.slice(3).join(" ").trim();
        result.push({ variable, required, description });
      }
    }
    // Stop at the next top-level heading
    if (inTable && /^###/.test(line) && !/^\s*###\s+Required\s+Vercel\s+Environment/.test(line)) {
      break;
    }
  }
  return result;
}

/* Parse production.ts - get REQUIRED_SERVER_ENV and PRODUCTION_REQUIRED_SERVER_ENV */
const productionSource = readFileSync(path.join(repoRoot, "apps", "web", "src", "config", "env", "production.ts"), "utf8").replace(/\r\n/g, "\n");

/* Quoted variable names from one declaration, up to its closing bracket. */
function namesIn(marker: string): string[] {
  const declaration = productionSource.match(
    new RegExp(`${marker}\[\s\S]*?\]\s*(?:as const\s*)?;`)
  )?.[0];

  if (!declaration) return [];

  return [...declaration.matchAll(/\"([A-Z][A-Z0-9_]+\")/g)].map(
    (match) => match[1].replace(/"/g, "")
  );
}

/* Variable names from both declarations */
const requiredFromProduction = [
  ...namesIn("const REQUIRED_SERVER_ENV"),
  ...namesIn("const PRODUCTION_REQUIRED_SERVER_ENV"),
];

/* Build a set of all production-required variable names */
const deploymentMap = new Map(
  rowsIn(deploymentSource).map((r) => [r.variable, { required: r.required, description: r.description }])
);

/* ---- Test: every production-required variable must be marked Required in DEPLOYMENT.md ---*/

describe("DEPLOYMENT.md env table", () => {
  it("is read by this test at all", () => {
    // Guards the guard: if the parsing above ever breaks, every assertion below
    // would pass while checking nothing.
    expect(rowsIn(deploymentSource).length).toBeGreaterThanOrEqual(1);
  });

  it("documents every variable production requires", () => {
    const missing = [...new Set(requiredFromProduction)].filter(
      (name) => !deploymentMap.has(name)
    );

    expect(
      missing,
      `required in production but absent from DEPLOYMENT.md table: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("says every required variable is required (not Optional)", () => {
    const missingClaim: string[] = [];
    const contradicts: string[] = [];

    for (const name of new Set(requiredFromProduction)) {
      // Find the line in DEPLOYMENT.md that starts with the variable name followed by =
      // (this handles both `VARIABLE=` and `` `VARIABLE` `` formats from the table parsing)
      const index = deploymentSource.split("\n").findIndex((line) =>
        line.startsWith(`${name}=`) || line.includes(`\`${name}\``)
      );
      // Absence is the test above's job; skip so the failure names one cause.
      if (index === -1) continue;

      // The contiguous comment block immediately above the line in the table.
      // Walk backwards from the found line to collect comment lines starting with #.
      const allLines = deploymentSource.split("\n");
      const block: string[] = [];
      // Look backwards from this line
      for (let i = index - 1; i >= 0 && allLines[i].startsWith("#"); i -= 1) {
        block.unshift(allLines[i]);
      }

      // The most recent `# --- … ---` header above it, if any.
      let section = "";
      for (let i = index - 1; i >= 0; i -= 1) {
        if (/^#\s*---/.test(allLines[i])) {
          section = allLines[i];
          break;
        }
      }

      const blockText = block.join("\n");
      const text = `${blockText}\n${section}`;

      // Case-insensitive check for "required" word
      const hasRequired = /required/i.test(text);
      if (!hasRequired) {
        missingClaim.push(name);
      }

      // Every line that calls the variable optional has to say required too,
      // which is what makes "required in production, optional in development"
      // acceptable and a bare "(optional)" header — or an "Optional:" line
      // under a required section — a failure.
      if (
        block.some(
          (line) => /optional/i.test(line) && !/required/i.test(line)
        )
      ) {
        contradicts.push(name);
      }
    }

    expect(
      missingClaim,
      `required in production but never described as required: ${missingClaim.join(", ")}`
    ).toEqual([]);

    expect(
      contradicts,
      `required in production but marked optional without saying required: ${contradicts.join(", ")}`
    ).toEqual([]);
  });

  it("ships placeholders, never a working credential", () => {
    // Two unmistakable shapes only: a pasted PEM block, or a long opaque base64
    // token. Kebab-case placeholders such as
    // `change-me-to-a-32-plus-character-secret` are deliberately not flagged —
    // this check must never fail on the placeholder it is meant to encourage.
    const suspicious = deploymentSource
      .split("\n")
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .filter((line) => {
        const value = line.slice(line.indexOf("=") + 1).trim();
        return /-----BEGIN/.test(value) || /^[A-Za-z0-9+/=]{40,}$/.test(value);
      });

    expect(suspicious).toEqual([]);
  });
});
