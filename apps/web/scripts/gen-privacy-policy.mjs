#!/usr/bin/env node
/**
 * Keeps the Data Retention table in `public/privacy-policy.md` in sync with
 * the table rendered by `src/app/privacy-policy/page.tsx` (Section 8).
 *
 * Only the markdown table is replaced. The surrounding policy prose is
 * reviewed by humans, and an earlier version of this script wrote a
 * Section-8-only document over the whole policy.
 *
 * Usage:
 *   node scripts/gen-privacy-policy.mjs            # rewrite the table
 *   node scripts/gen-privacy-policy.mjs --check    # exit 1 if it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));

const pageSourcePath = join(
  scriptDir,
  "..",
  "src",
  "app",
  "privacy-policy",
  "page.tsx"
);
const markdownPath = join(scriptDir, "..", "public", "privacy-policy.md");

/** Extract the Data Retention section from the TSX page source. */
export function extractDataRetentionSection(source) {
  // `[\s\S]` rather than `(?:.|\n)`: the page is checked out with CRLF on
  // Windows, and `.` does not match `\r`, so the old pattern never matched
  // the closing tag there and the check failed on an otherwise valid page.
  const sectionRegex =
    /<section[^>]*id="data-retention"[^>]*>([\s\S]*?)<\/section>/;
  const sectionMatch = source.match(sectionRegex);
  if (!sectionMatch) {
    throw new Error(
      "gen-privacy-policy: could not find section id='data-retention' in page.tsx"
    );
  }
  return sectionMatch[1];
}

/** Extract the table rows from the Data Retention section. */
export function extractTableFromSection(sectionHtml) {
  const tableRegex = /<tbody[^>]*>([\s\S]*?)<\/tbody>/;
  const tableMatch = sectionHtml.match(tableRegex);
  if (!tableMatch) {
    throw new Error(
      "gen-privacy-policy: could not find <tbody> in data-retention section"
    );
  }
  return tableMatch[1];
}

/** Build the markdown table, padded the way Prettier formats tables. */
export function buildMarkdownTable(tableHtml) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const clean = (html) =>
    html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const rows = [];
  let match;

  while ((match = rowRegex.exec(tableHtml)) !== null) {
    const cells = [...match[1].matchAll(cellRegex)];
    if (cells.length < 2) continue;

    const record = clean(cells[0][1]);
    const kept = clean(cells[1][1]);
    if (record && kept) rows.push([record, kept]);
  }

  if (rows.length === 0) {
    throw new Error("gen-privacy-policy: no table rows extracted");
  }

  const header = ["Record", "Kept for"];
  const width = (index) =>
    Math.max(header[index].length, ...rows.map((row) => row[index].length));
  const recordWidth = width(0);
  const keptWidth = width(1);
  const line = (record, kept) =>
    `| ${record.padEnd(recordWidth)} | ${kept.padEnd(keptWidth)} |`;

  return [
    line(...header),
    `| ${"-".repeat(recordWidth)} | ${"-".repeat(keptWidth)} |`,
    ...rows.map((row) => line(...row)),
  ].join("\n");
}

/**
 * Render the policy with the table from the page.
 *
 * Kept pure so the line-ending and stale-table behaviour can be unit-tested
 * without reading or writing the checked-in policy. The EOL of the existing
 * markdown is preserved: a Windows checkout must not turn a no-op check into a
 * whole-file diff.
 */
export function renderPrivacyPolicy(pageSource, markdownExisting) {
  const sectionHtml = extractDataRetentionSection(pageSource);
  const table = buildMarkdownTable(extractTableFromSection(sectionHtml));

  const eol = markdownExisting.includes("\r\n") ? "\r\n" : "\n";
  const tableRegex =
    /^\| Record[^\r\n]*\r?\n\|[^\r\n]*\r?\n(?:\|[^\r\n]*(?:\r?\n|$))+/m;

  if (!tableRegex.test(markdownExisting)) {
    throw new Error(
      "gen-privacy-policy: public/privacy-policy.md has no retention table."
    );
  }

  return markdownExisting.replace(
    tableRegex,
    table.replaceAll("\n", eol) + eol
  );
}

/** True when the checked-in policy already carries the page's table. */
export function isPrivacyPolicyCurrent(pageSource, markdownExisting) {
  return renderPrivacyPolicy(pageSource, markdownExisting) === markdownExisting;
}

function main() {
  try {
    const pageSource = readFileSync(pageSourcePath, "utf8");
    const markdownExisting = readFileSync(markdownPath, "utf8");
    const updated = renderPrivacyPolicy(pageSource, markdownExisting);

    if (process.argv.includes("--check")) {
      if (updated !== markdownExisting) {
        console.error(
          "gen-privacy-policy: public/privacy-policy.md is stale. Run `npm run gen:privacy-policy` and commit the result."
        );
        return 1;
      }
      console.log("public/privacy-policy.md is current.");
      return 0;
    }

    writeFileSync(markdownPath, updated);
    console.log("Updated the Data Retention table in public/privacy-policy.md.");
    return 0;
  } catch (error) {
    console.error(`gen-privacy-policy: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
