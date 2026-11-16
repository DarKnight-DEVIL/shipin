#!/usr/bin/env node
/**
 * One command for the local E2E suite.
 *
 *   npm run test:e2e:local                 # build, serve it, run the public specs
 *   npm run test:e2e:local -- --signed-in  # + Auth emulator, seeded admin, sign-in spec
 *   npm run test:e2e:local -- -g PayPal    # extra args go to `playwright test`
 *
 * Why a script instead of a longer npm one-liner:
 *
 *   - The specs need a datastore. CI has no Firebase service account and must
 *     not have one, so the server is pointed at the Firestore emulator via
 *     FIRESTORE_EMULATOR_HOST, and `emulators:exec` owns the emulator for
 *     exactly as long as the tests run (a background `&` process dies with its
 *     terminal or CI step).
 *   - Playwright must serve the PRODUCTION build, so the web-server command has
 *     to be overridden per run; setting that inline is not portable across
 *     shells (Windows `cmd` vs bash).
 *   - The emulator is a Java process. When `java` is missing, the failure
 *     arrives as an opaque "Could not spawn `java -version`", so this checks
 *     first and prints the fix.
 *
 * `--signed-in` also starts the Auth emulator, seeds an admin account
 * (`scripts/e2e/seed-auth-user.mjs`) and runs signed-in-smoke.spec.ts, so the
 * sign-in path is covered without a staging account.
 *
 * App configuration still comes from the environment like every other run:
 * `apps/web/.env.local` (Next loads it) or exported variables. A production
 * server validates its startup variables, so the build and the server must see
 * the same ones — see playwright-test/README.md.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Commands run as single shell strings, not argv arrays: `emulators:exec` takes
 * its script as one quoted argument, and a Windows argv array is re-quoted in a
 * way the CLI splits back into "too many arguments".
 */
function run(command, env) {
  const result = spawnSync(command, {
    cwd: appDir,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });

  return result.status ?? 1;
}

// No shell for the probe: redirect syntax is not portable (`/dev/null` is not
// a cmd.exe path), and an `.exe` on PATH spawns directly.
const javaPresent = spawnSync("java", ["-version"], { stdio: "ignore" }).status === 0;

if (!javaPresent) {
  console.error(
    [
      "The Firestore emulator is a Java process and `java` is not on PATH.",
      "",
      "Install a JDK (11 or newer), then either restart the shell so PATH picks",
      "it up or point JAVA_HOME at it for this run:",
      "",
      '  export JAVA_HOME="/c/Program Files/Java/jdk-27.0.1.0.3"',
      '  export PATH="$JAVA_HOME/bin:$PATH"',
      "",
    ].join("\n")
  );
  process.exit(1);
}

const signedIn = process.argv.includes("--signed-in");
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--signed-in");

const FIRESTORE_EMULATOR = "127.0.0.1:8080";
const AUTH_EMULATOR = "127.0.0.1:9099";
const SEED_EMAIL = "e2e-admin@shipin.test";
const SEED_PASSWORD = "shipin-e2e-password";

// The server Playwright starts: the production build on a fixed port.
const env = {
  NODE_ENV: "production",
  CI: "1",
  BASE_URL: "http://localhost:3000",
  PLAYWRIGHT_WEBSERVER_COMMAND: "npm run start -- -p 3000",
  FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
  // Also baked into the browser bundle, so the client SDK talks to the
  // emulators instead of the project in .env.local.
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
};

if (signedIn) {
  Object.assign(env, {
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    // The emulators namespace users and documents by project id, and the
    // seeder writes under "shipin-e2e". Without pinning the same id here the
    // browser signs in against a namespace that has no seeded account ("Unable
    // to sign in") even though both sides point at the same emulator.
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "shipin-e2e",
    FIREBASE_ADMIN_PROJECT_ID: "shipin-e2e",
    // The spec and the seeder share these; the seeder would create the account
    // from its own defaults, but the spec has to be told the same values.
    E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || SEED_EMAIL,
    E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || SEED_PASSWORD,
  });
}

// Paths include `tests/`: Playwright treats each positional argument as a
// regex over the file path, and a bare `smoke.spec.ts` also matches
// `signed-in-smoke.spec.ts` — which then skips itself for the wrong reason.
const specs = signedIn
  ? "tests/signed-in-smoke.spec.ts"
  : "tests/smoke.spec.ts tests/hydration.spec.ts tests/sitemap-check.spec.ts";

const playwright = `npx playwright test --config=playwright.config.ts ${specs}${
  extraArgs.length > 0 ? ` ${extraArgs.join(" ")}` : ""
}`;

// The seeder runs in the same `emulators:exec` script so the Auth emulator is
// already listening, and its users survive only for this run.
const script = signedIn
  ? `node scripts/e2e/seed-auth-user.mjs && ${playwright}`
  : playwright;

console.log("\n› Building the production bundle…");
if (run("npm run build", env) !== 0) {
  console.error("Build failed; not starting the E2E run.");
  process.exit(1);
}

console.log(
  signedIn
    ? "\n› Seeding the Auth emulator and running the signed-in spec…"
    : "\n› Running Playwright against the build, with the Firestore emulator…"
);

process.exit(
  run(
    "npx --yes firebase-tools@15.36.0 --config ../../firebase.json " +
      `emulators:exec --only ${signedIn ? "firestore,auth" : "firestore"} ` +
      `--project shipin-e2e "${script}"`,
    env
  )
);
