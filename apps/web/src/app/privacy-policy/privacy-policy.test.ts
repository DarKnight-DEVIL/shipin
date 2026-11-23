import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Read the markdown file and extract section headings
// From src/app/privacy-policy go up 3 levels to repo root, then into public/
const markdownPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "public",
  "privacy-policy.md"
);

const markdownSource = fs.readFileSync(markdownPath, "utf8");

// Read the page.tsx and extract section headings with ids
const pagePath = path.join(__dirname, "page.tsx");

const pageSource = fs.readFileSync(pagePath, "utf8");

// Extract markdown section headings (## N. Title)
const markdownHeadings = markdownSource
  .split("\n")
  .filter((line) => /^## \d+\./.test(line))
  .map((line) => {
    const match = line.match(/^## (\d+)\. (.*)/);
    return { number: parseInt(match![1], 10), title: match![2].trim() };
  });

// Extract page.tsx section headings (id="..." with <h2>N. Title</h2>)
const pageHeadingRegex =
  /id="([^"]+)"[^>]*>\s*<h2[^>]*>\s*(\d+)\. (.+?)<\/h2>/gs;
const pageHeadings: Array<{ id: string; number: number; title: string }> = [];
let match: RegExpExecArray | null;

while ((match = pageHeadingRegex.exec(pageSource)) !== null) {
  pageHeadings.push({
    id: match![1],
    number: parseInt(match![2], 10),
    title: match![3].trim(),
  });
}

// Build a map of markdown headings by number
const markdownMap = new Map(markdownHeadings.map((h) => [h.number, h.title]));

// Build a map of page headings by number
const pageMap = new Map(
  pageHeadings.map((h) => [h.number, { id: h.id, title: h.title }])
);

describe("privacy-policy section consistency", () => {
  it("markdown headings match page.tsx headings by number", () => {
    // Get all section numbers from both sources
    const markdownNumbers = Array.from(markdownMap.keys());
    const pageNumbers = Array.from(pageMap.keys());

    // Each source should have the same set of section numbers
    expect(markdownNumbers).toEqual(pageNumbers);

    // For each section number, the titles should match
    for (const number of markdownNumbers) {
      const mdTitle = markdownMap.get(number)!.trim();
      const pageEntry = pageMap.get(number);
      const pageTitle = pageEntry ? pageEntry.title.trim() : "";

      // Normalize both titles: lowercase, trim, collapse whitespace
      const normalize = (s: string) =>
        s.toLowerCase().replace(/\s+/g, " ").trim();

      expect(normalize(mdTitle)).toBe(normalize(pageTitle));
    }
  });

  it("all markdown sections have corresponding page.tsx ids", () => {
    const markdownNumbers = Array.from(markdownMap.keys());
    for (const number of markdownNumbers) {
      const pageEntry = pageMap.get(number);
      expect(pageEntry).toBeDefined();
      expect(pageEntry?.id).toBeTruthy();
    }
  });

  it("all page.tsx sections have corresponding markdown headings", () => {
    const pageNumbers = Array.from(pageMap.keys());
    for (const number of pageNumbers) {
      const mdEntry = markdownMap.get(number);
      expect(mdEntry).toBeDefined();
    }
  });
});
