import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STANDALONE_ARTEFACTS,
  STANDALONE_ENV_FILES,
  STANDALONE_OUTPUT_EXCLUDES,
  STANDALONE_SERVER_ENTRY,
} from "../../standalone-output-excludes.mjs";

const appDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const { scripts } = JSON.parse(
  readFileSync(path.join(appDir, "package.json"), "utf8")
) as {
  scripts: Record<string, string>;
};

describe("standalone start contract", () => {
  it("serves the traced standalone build, as the Docker image does", () => {
    // The env files are excluded from the traced tree, so the start command has
    // to read them from the app directory instead.
    expect(scripts.start).toBe(
      `node --env-file-if-exists=.env --env-file-if-exists=.env.local ${STANDALONE_SERVER_ENTRY}`
    );
    // `next start` reads `.next/` and warns that it does not support standalone
    // output, so it exercises a different server than the one that ships.
    expect(scripts.start).not.toContain("next start");
  });

  it("copies the assets and prunes the artefacts the trace leaves behind", () => {
    expect(scripts.prestart).toBe("node scripts/prepare-standalone.mjs");
  });

  it("keeps local test artefacts out of the traced tree", () => {
    for (const artefact of [
      "coverage",
      "playwright-report",
      "playwright-test",
      "firestore-debug.log",
    ]) {
      expect(
        STANDALONE_ARTEFACTS,
        `${artefact} is not pruned from the standalone tree`
      ).toContain(artefact);
    }

    // Directories are excluded recursively, files by their own path.
    expect(STANDALONE_OUTPUT_EXCLUDES).toContain("./coverage/**/*");
    expect(STANDALONE_OUTPUT_EXCLUDES).toContain("./playwright-test/**/*");
    expect(STANDALONE_OUTPUT_EXCLUDES).toContain("./firestore-debug.log");
  });

  it("keeps environment files out of the traced tree", () => {
    expect(STANDALONE_ENV_FILES).toContain(".env");
    expect(STANDALONE_OUTPUT_EXCLUDES).toContain("./.env*");
  });

  it("resolves every exclude glob from the app root, as next.config requires", () => {
    expect(STANDALONE_OUTPUT_EXCLUDES.length).toBeGreaterThanOrEqual(
      STANDALONE_ARTEFACTS.length
    );
    for (const glob of STANDALONE_OUTPUT_EXCLUDES) {
      expect(glob.startsWith("./")).toBe(true);
      expect(path.isAbsolute(glob)).toBe(false);
    }
  });
});
