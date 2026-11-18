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
 *     shells.
 *   - The emulator is a Java process. When `java` is missing, the failure
 *     arrives as an opaque "Could not spawn `java -version`", so this checks
 *     first and says what to install.
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
const isWindows = process.platform === "win32";

/**
 * Run one command line through the platform shell (`/bin/sh -c` on POSIX,
 * `cmd.exe /c` on Windows).
 *
 * A single string, not an argv array: `emulators:exec` takes its script as one
 * quoted argument, and passing that through an argv array makes the CLI split
 * it back into "too many arguments". Quoting here is limited to that one
 * double-quoted script, so an argument containing `"` is rejected below rather
 * than silently mangling the command.
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

const signedIn = process.argv.includes("--signed-in");
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--signed-in");

const quotedArg = extraArgs.find(
  (arg) => arg.includes('"') || arg.includes("$")
);
if (quotedArg) {
  console.error(
    `Passing "${quotedArg}" to Playwright through this runner is not supported: ` +
      "the argument is embedded in one shell-quoted command, so double quotes, " +
      "dollar signs and backticks cannot be escaped reliably.\n" +
      "Run `npx playwright test` directly, with the server already running, if you need them."
  );
  process.exit(1);
}

// Direct spawn (no shell): `java -version` writes to stderr, and shell redirect
// syntax is not portable between /bin/sh and cmd.exe.
const java = spawnSync("java", ["-version"], { stdio: "ignore" });

if (java.error?.code === "ENOENT" || (java.status ?? 1) !== 0) {
  console.error(
    [
      java.error?.code === "ENOENT"
        ? "The Firestore emulator is a Java process and `java` is not on PATH."
        : "`java -version` failed, so the Firestore emulator cannot start (needs a working JDK 11+).",
      "",
      "Install a JDK 11 or newer, then restart the shell so PATH picks it up:",
      "",
      ...(isWindows
        ? [
            '  export JAVA_HOME="/c/Program Files/Java/jdk-27"',
            '  export PATH="$JAVA_HOME/bin:$PATH"',
          ]
        : [
            "  # Debian/Ubuntu: sudo apt-get install default-jre-headless",
            "  # macOS:         brew install openjdk",
            "  export JAVA_HOME=/usr/lib/jvm/<jdk>",
            '  export PATH="$JAVA_HOME/bin:$PATH"',
          ]),
      "",
      "CI does not need this: ubuntu-latest images ship a JDK.",
    ].join("\n")
  );
  process.exit(1);
}

const FIRESTORE_EMULATOR = "127.0.0.1:8080";
const AUTH_EMULATOR = "127.0.0.1:9099";
const SEED_EMAIL = "e2e-admin@shipin.test";
const SEED_PASSWORD = "shipin-e2e-password";

// The server Playwright starts: the production build on a fixed port.
const env = {
  NODE_ENV: "production",
  CI: "1",
  BASE_URL: "http://localhost:3000",
  // `npm start` runs the traced standalone server, the same entrypoint the
  // Docker image runs. It reads the port from the environment instead of
  // parsing `-p` the way `next start` does.
  PORT: "3000",
  PLAYWRIGHT_WEBSERVER_COMMAND: "npm start",
  FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
  // Also baked into the browser bundle, so the client SDK talks to the
  // emulators instead of the project in .env.local.
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
  // `.env.local` holds real Upstash credentials, and the whole suite arrives
  // from one IP inside a 60s window: the app's limiter answered 429 partway
  // through a run. Blanked (not deleted — Next will not override a present
  // key) and opted out of the startup check, which exists for real deploys.
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  RATE_LIMIT_STORE_OPTIONAL: "1",
};

if (signedIn) {
  Object.assign(env, {
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    // The emulators namespace users and documents by project id, and the
    // seeder writes under "shipin-e2e". Without pinning the same id here the
    // browser signs in against a namespace with no seeded account ("Unable to
    // sign in") even though both sides point at the same emulator.
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
const API_CONTRACT_SPECS = [
  // Money-path contracts. The authenticated cases skip unless the Auth
  // emulator is running, so the default suite still covers the 401/403
  // boundary on every run.
  "tests/checkout-flow.spec.ts",
  "tests/wallet-topup.spec.ts",
  "tests/admin-refund-local.spec.ts",
].join(" ");

const specs = signedIn
  ? // With the Auth emulator up, the same contracts also exercise their
    // authenticated branches (validation 400s, unknown fixture 404s, the
    // non-admin 403), which is where an authorization regression shows up.
    `tests/signed-in-smoke.spec.ts ${API_CONTRACT_SPECS}`
  : [
      "tests/smoke.spec.ts",
      "tests/hydration.spec.ts",
      "tests/sitemap-check.spec.ts",
    ].join(" ") + ` ${API_CONTRACT_SPECS}`;

const playwright = [
  "npx playwright test --config=playwright.config.ts",
  specs,
  ...extraArgs,
].join(" ");

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
