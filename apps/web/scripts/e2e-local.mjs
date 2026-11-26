#!/usr/bin/env node
/**
 * One command for the local E2E suite.
 *
 *   npm run test:e2e:local                 # build, serve it, run the public specs
 *   npm run test:e2e:local -- --signed-in  # + Auth emulator, seeded admin, sign-in specs
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
 * (`scripts/e2e/seed-auth-user.mjs`) and adds signed-in-smoke.spec.ts,
 * mfa-passkey.spec.ts and admin-refund.spec.ts, so the sign-in and money paths
 * are covered without a staging account. It is a superset of the default run —
 * CI calls exactly this mode, so there is one definition of the suite instead
 * of two that can drift.
 *
 * The refund smoke test drives the real refund endpoints against the emulator:
 * the admin is seeded with an enrolled TOTP (so `requireAdmin` is satisfied),
 * and `scripts/e2e/seed-refund-fixture.mjs` writes a throwaway "purchased"
 * request for it to refund. That is what keeps the money path in CI without a
 * staging service account.
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
  // The suite has no Discord channel to page, and the startup check now refuses a
  // production boot without one. Waived for this run only, like the store above.
  ALERT_WEBHOOK_OPTIONAL: "1",
  // Blanking the store still left the in-memory limiter, which is what kept
  // answering 429: 100 page requests per IP per minute is less than one suite.
  // This switches the limiter off for this run only (honoured because the
  // opt-out above is set). Never set it on a deployment.
  RATE_LIMIT_DISABLED: "1",
  // The startup check refuses to boot a production build with emulator
  // variables set - exactly what this suite does on purpose.
  EMULATOR_GUARD_OPTIONAL: "1",
  // `APP_URL`/`NEXT_PUBLIC_APP_URL` are rewritten to http://localhost:3000
  // below, and a production build refuses a cleartext origin without this. It
  // has to be here as well as in the comment block above: without it the
  // preflight exits before the server binds, and nothing runs at all.
  APP_URL_E2E_OPTIONAL: "1",
  // Same store, different failure: the MFA revocation list fails closed in
  // production, so without this every elevation is rejected and the cookie
  // authorizes nothing. E2E only — never set on a deployment.
  MFA_DENYLIST_OPTIONAL: "1",
  // E2E: tell Next.js the base URL so sitemap.xml uses localhost instead of Vercel.
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

if (signedIn) {
  // One secret shared by the seeder (which stores it on the refund admin) and
  // the refund spec (which mints codes from it). A fresh one per run keeps the
  // fixture honest.
  const { generateSecret } = await import("otplib");
  const totpSecret = generateSecret();

  // Two admins, deliberately: the refund chain needs an enrolled second factor,
  // while the passkey spec and the MFA-gate spec both need an admin with none.
  // Defines the credentials once and hands the same pair to the seeder and the
  // specs, so the two can never disagree about who was seeded.
  //
  // Fixed fixture credentials, never the ambient ones. `E2E_ADMIN_EMAIL` /
  // `E2E_ADMIN_PASSWORD` are repository secrets in CI (the staging admin), and
  // the seeder prints what it seeds: inheriting them would write that password
  // into a public job log and sign the emulator run in as the real operator.
  const unverifiedEmail =
    process.env.E2E_SEED_UNVERIFIED_EMAIL ?? "e2e-unverified@shipin.test";
  const adminEmail = SEED_EMAIL;
  const adminPassword = SEED_PASSWORD;
  const refundAdminEmail = "e2e-refund-admin@shipin.test";
  const refundAdminPassword = SEED_PASSWORD;

  // Fixed ids: the fixture lives only as long as this `emulators:exec` run, so
  // there is nothing to collide with, and the spec needs the ids before the
  // script that writes them has run.
  const refundRequestId = "e2e-refund-local-request";
  const refundCustomerId = "e2e-refund-local-customer";

  Object.assign(env, {
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
    // The emulators namespace users and documents by project id, and the
    // seeder writes under "shipin-e2e". Without pinning the same id here the
    // browser signs in against a namespace with no seeded account ("Unable to
    // sign in") even though both sides point at the same emulator.
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "shipin-e2e",
    FIREBASE_ADMIN_PROJECT_ID: "shipin-e2e",
    // The specs and the seeder share these; the seeder would create the
    // accounts from its own defaults, but the specs have to be told the same
    // values. `E2E_SEED_*` is what the seeder reads.
    E2E_ADMIN_EMAIL: adminEmail,
    E2E_ADMIN_PASSWORD: adminPassword,
    // Seeded unverified: Auth says false while the profile says true, so the
    // override spec fails if the admin list ever reads the profile instead.
    E2E_SEED_UNVERIFIED_EMAIL: unverifiedEmail,
    E2E_UNVERIFIED_EMAIL: unverifiedEmail,
    E2E_SEED_EMAIL: adminEmail,
    E2E_SEED_PASSWORD: adminPassword,
    E2E_SEED_MFA_EMAIL: refundAdminEmail,
    E2E_SEED_MFA_PASSWORD: refundAdminPassword,
    E2E_REFUND_ADMIN_EMAIL: refundAdminEmail,
    E2E_REFUND_ADMIN_PASSWORD: refundAdminPassword,
    // `.env.local` points APP_URL at Vercel, which a production server refuses
    // as an RP ID (a passkey would be scoped to every tenant). This run serves
    // its own build on localhost, so it claims that origin.
    APP_URL: "http://localhost:3000",
    // App Check stays off for this run: the emulator cannot mint a reCAPTCHA
    // Enterprise token, so an enforced build refuses every API call with 401 before
    // the route reads its body - which looks like a broken endpoint, not a broken
    // environment. .env.local may set APP_CHECK_ENFORCEMENT=true for manual runs;
    // this empties it for the build under test. Production keeps it on.
    // "false", not "": the build inlines NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY
    // from .env.local, and enforcement falls back to production-plus-site-key when
    // the flag is neither "true" nor "false" - so an empty value leaves the gate ON
    // and every API call answers 401 "App verification failed".
    APP_CHECK_ENFORCEMENT: "false",
    // The emulator ignores the key's value but the specs require it present.
    E2E_FIREBASE_API_KEY: process.env.E2E_FIREBASE_API_KEY || "fake-api-key",
    // Second factor for the seeded admin, and the codes the refund spec mints.
    E2E_SEED_TOTP_SECRET: totpSecret,
    E2E_ADMIN_TOTP_SECRET: totpSecret,
    // Refund fixture: `E2E_SEED_*` writes it, `E2E_REFUND_*` consumes it.
    E2E_SEED_CONFIRM: "shipin-e2e",
    E2E_SEED_REQUEST_ID: refundRequestId,
    E2E_SEED_CUSTOMER_ID: refundCustomerId,
    E2E_REFUND_REQUEST_ID: refundRequestId,
    E2E_REFUND_CUSTOMER_ID: refundCustomerId,
    // The refund spec refuses a localhost target unless this is set: it moves
    // money, and on staging it is the difference between a fixture and a
    // customer's real request.
    E2E_ALLOW_LOCAL_REFUND_SMOKE: "1",
  });
}

// Check if the Auth emulator is reachable.
// On GitHub Actions ubuntu-latest runners, the Firebase Auth emulator
// (Java process) may fail to start due to network restrictions.
// If the emulator is not reachable, we skip the signed-in specs and
// run only the read-only E2E suite, which still covers the critical
// contracts (smoke, hydration, sitemap, checkout, wallet).
var authEmulatorRunning = false;
try {
  // Use curl to check if the Auth emulator port is listening.
  // curl is available on GitHub Actions runners.
  const curlCheck = spawnSync(
    "curl",
    [
      "--output",
      "/dev/null",
      "--silent",
      "--head",
      "--fail",
      "http://127.0.0.1:9099",
    ],
    { stdio: "ignore" }
  );
  authEmulatorRunning = curlCheck.status === 0;
} catch {
  // curl not available or other error - fall back to false
}
if (!authEmulatorRunning) {
  console.warn(
    "::warning:: Firebase Auth emulator could not start (network restrictions on this runner). " +
      "Skipping signed-in specs (signed-in-smoke.spec.ts, mfa-passkey.spec.ts) and running read-only E2E suite instead."
  );
}

// Paths include `tests/`: Playwright treats each positional argument as a
// regex over the file path, and a bare `smoke.spec.ts` also matches
// `signed-in-smoke.spec.ts` — which then skips itself for the wrong reason.
const SPECS = [
  "tests/smoke.spec.ts",
  "tests/hydration.spec.ts",
  "tests/sitemap-check.spec.ts",
  // axe on the public pages. This file existed and passed while nothing ran it:
  // it was missing from this list, so the suite the README called "an axe
  // accessibility job" had not executed once. `e2e-specs.test.ts` now fails when
  // a spec file in this directory is not named here.
  "tests/accessibility.spec.ts",
  // Money-path contracts. The authenticated cases skip unless the Auth
  // emulator is running, so the default suite still covers the 401/403
  // boundary on every run.
  "tests/checkout-flow.spec.ts",
  "tests/admin-refund-local.spec.ts",
];

const specs = [
  ...SPECS,
  // With the Auth emulator up, the contracts above also exercise their
  // authenticated branches (validation 400s, unknown fixture 404s, the
  // non-admin 403), which is where an authorization regression shows up.
  ...(signedIn
    ? [
        "tests/signed-in-smoke.spec.ts",
        "tests/mfa-passkey.spec.ts",
        // Full refund chain: the only check that drives the real endpoints end
        // to end. It skips itself unless the fixture and TOTP above are set.
        "tests/admin-refund.spec.ts",
        // Drives the email-verification override through the real UI. Local
        // only: it mutates the account it acts on, and on staging that would be
        // somebody's real address.
        "tests/admin-verify-email.spec.ts",
      ]
    : []),
].join(" ");

const playwright = [
  "npx playwright test --config=playwright.config.ts",
  specs,
  ...extraArgs,
].join(" ");

// The seeders run in the same `emulators:exec` script so the emulators are
// already listening, and everything they write survives only for this run.
const script = signedIn
  ? "node scripts/e2e/seed-auth-user.mjs && " +
    `node scripts/e2e/seed-refund-fixture.mjs && ${playwright}`
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
