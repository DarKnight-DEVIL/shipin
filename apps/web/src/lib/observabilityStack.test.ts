// @vitest-environment node

/**
 * The log pipeline, checked as configuration.
 *
 * Docker is not available in every environment that runs these tests, so the stack
 * cannot be started here. What can be checked is the set of mistakes that make it
 * silently useless instead of loudly broken:
 *
 *   - the profile gate disappears and the default stack grows two containers;
 *   - the Docker socket is mounted writable, which is root on the host;
 *   - the sink stops using the env var, so a Grafana Cloud deployment ships to a
 *     container that is not there;
 *   - the buffer becomes memory-only, so the logs from an outage are lost in it;
 *   - a label takes an unbounded value (message text, ids), which is how a Loki
 *     install falls over.
 *
 * The compose file is read as text rather than through a YAML library: the only
 * parser available here is a transitive dependency, and a test that breaks when that
 * dependency moves is worse than one that asserts on the lines it cares about.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");

const composeSource = readFileSync(
  path.join(repoRoot, "docker-compose.yml"),
  "utf8"
);

const vectorToml = readFileSync(
  path.join(repoRoot, "docker", "vector", "vector.toml"),
  "utf8"
);

const envExample = readFileSync(
  path.join(repoRoot, "apps", "web", ".env.example"),
  "utf8"
);

const deploymentDoc = readFileSync(
  path.join(repoRoot, "DEPLOYMENT.md"),
  "utf8"
);

/** The lines of one `services:` entry, up to the next one. */
function serviceBlock(name: string): string {
  const lines = composeSource.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);

  if (start === -1) throw new Error(`service ${name} not found in compose`);

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[a-z][a-z0-9-]*:$/.test(line));

  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The volume names declared at the bottom of the compose file. */
function volumeNames(): string[] {
  const marker = "\nvolumes:\n";
  const index = composeSource.indexOf(marker);

  if (index === -1) return [];

  return composeSource
    .slice(index + marker.length)
    .split("\n")
    .map((line) => line.match(/^ {2}([a-z][a-z0-9-]*):/)?.[1])
    .filter((name): name is string => typeof name === "string");
}

describe("docker compose observability profile", () => {
  it("keeps the default stack unchanged", () => {
    // Someone running `docker compose up` for the test suite should not get a log
    // store and a second buffer disk.
    expect(serviceBlock("loki")).toContain('profiles: ["observability"]');
    expect(serviceBlock("vector")).toContain('profiles: ["observability"]');
    expect(serviceBlock("app")).not.toContain("profiles:");
  });

  it("mounts the Docker socket read-only", () => {
    const socketLines = serviceBlock("vector")
      .split("\n")
      .filter((line) => line.includes("docker.sock"));

    expect(socketLines).toEqual([
      "      - /var/run/docker.sock:/var/run/docker.sock:ro",
    ]);
    // A writable socket in a log shipper means root on the host if the shipper is
    // compromised; it only needs to read log files.
    expect(socketLines.every((line) => line.trim().endsWith(":ro"))).toBe(true);
  });

  it("gives Vector a disk that outlives the container", () => {
    expect(serviceBlock("vector")).toContain("/var/lib/vector");

    const volumes = volumeNames();
    expect(volumes).toContain("vector-data");
    expect(volumes).toContain("loki-data");
  });

  it("takes the destination from the environment", () => {
    const block = serviceBlock("vector");

    // Default points at the local Loki; the variable is what a Grafana Cloud
    // deployment overrides, so it must not be hard-coded.
    expect(block).toContain("LOKI_URL:");
    expect(block).toContain("http://loki:3100/loki/api/v1/push");
    expect(block).toContain("LOKI_USERNAME:");
    expect(block).toContain("LOKI_PASSWORD:");
  });
});

describe("vector pipeline", () => {
  it("reads container logs", () => {
    expect(vectorToml).toContain("[sources.app_containers]");
    expect(vectorToml).toContain('type = "docker_logs"');
  });

  it("only ships the app's own container", () => {
    // Without this the pipeline mostly stores the Firestore emulator's debug output.
    expect(vectorToml).toContain("[transforms.app_only]");
    expect(vectorToml).toContain('type = "filter"');
    expect(vectorToml).toContain("-app-");
  });

  it("parses the app's JSON line and keeps output it cannot parse", () => {
    expect(vectorToml).toContain("[transforms.parse_entry]");
    expect(vectorToml).toContain("parse_json(.message)");
    // A crash trace or a dependency's banner must still be searchable; dropping it
    // is how the interesting records disappear.
    expect(vectorToml).toContain('.level = "unknown"');
    // `service` is promoted out of context so it can be a label.
    expect(vectorToml).toContain(".service = to_string(ctx.service)");
  });

  it("labels only bounded fields", () => {
    for (const label of ["labels.service", "labels.level", "labels.container"]) {
      expect(vectorToml).toContain(label);
    }

    // Message text and ids in labels is the classic way to blow up a Loki index.
    expect(vectorToml).not.toMatch(/labels\.(message|requestId|traceId|raw_line)/);
  });

  it("uses the env var and buffers to disk", () => {
    expect(vectorToml).toContain('endpoint = "${LOKI_URL:');
    expect(vectorToml).toContain('encoding.codec = "json"');
    expect(vectorToml).toContain('buffer.type = "disk"');
    // Dropping on a full buffer loses exactly the records from the incident.
    expect(vectorToml).toContain('buffer.when_full = "block"');
  });
});

describe("documentation for the pipeline", () => {
  it("declares the variables an operator has to set", () => {
    for (const variable of ["LOKI_URL", "LOKI_USERNAME", "LOKI_PASSWORD"]) {
      expect(envExample, `${variable} missing from .env.example`).toContain(
        variable
      );
      expect(deploymentDoc, `${variable} missing from DEPLOYMENT.md`).toContain(
        variable
      );
    }
  });

  it("says that Docker logs are not Vercel logs", () => {
    // The two run in different places; a reader who assumes otherwise ships nothing.
    expect(deploymentDoc.toLowerCase()).toContain("log drain");
  });
});
