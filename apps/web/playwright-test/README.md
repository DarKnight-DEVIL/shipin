# End-to-end tests

Playwright specs that run against a **production build** (`next build` + `next start`). They are the only checks that prove the JavaScript bundle actually executes — a page can return perfect HTML and never hydrate.

## One command

```bash
npm run test:e2e:local
```

From the repo root (or `apps/web`). It builds, starts the Firestore emulator, serves the build on port 3000, and runs `smoke.spec.ts`, `hydration.spec.ts` and `sitemap-check.spec.ts`. Extra arguments go to `playwright test`:

```bash
npm run test:e2e:local -- tests/smoke.spec.ts
npm run test:e2e:local -- -g PayPal
```

Extra arguments are pasted into one shell-quoted command, so ones containing double quotes, `$` or backticks are rejected with an explanation instead of being mangled. `playwright test` treats each positional argument as a **path regex** — spell out `tests/<file>.spec.ts`, because a bare `smoke.spec.ts` also matches `signed-in-smoke.spec.ts`.

No Upstash database, no staging credentials and no Firebase service account are involved.

## Signed-in spec, same one command

```bash
npm run test:e2e:signed-in
```

Same build and emulator plumbing, plus the **Auth emulator**: it seeds an admin account into Auth and `users/{uid}` via `scripts/e2e/seed-auth-user.mjs`, then runs `signed-in-smoke.spec.ts`, which types those credentials into `/login`, waits for the admin area, and asserts `/dashboard` makes a Firestore request and no error boundary fired.

The seeded account (emulator fixtures only, not secrets):

| | |
| --- | --- |
| email | `e2e-admin@shipin.test` |
| password | `shipin-e2e-password` |
| role | `admin` |

The runner pins `NEXT_PUBLIC_FIREBASE_PROJECT_ID=shipin-e2e` for this mode. The emulators namespace users by project id, and the seeder writes under that id — without the pin the browser signs in against a namespace with no account and reports the generic "Unable to sign in".

`admin-refund.spec.ts` is **not** covered: it moves real money and stays staging-only by design.

## Prerequisites

1. **A JDK, 11 or newer.** The Firestore emulator is a Java process. If `java -version` works you are done; if it does not, install one and make sure `bin` is on PATH:

   ```bash
   # Debian/Ubuntu        macOS
   sudo apt-get install default-jre-headless   # brew install openjdk

   export JAVA_HOME=/usr/lib/jvm/<jdk>          # or the Windows path below
   export PATH="$JAVA_HOME/bin:$PATH"
   ```

   Windows Git Bash: `export JAVA_HOME="/c/Program Files/Java/jdk-27"`. The runner checks this first and prints the platform-appropriate hint, because the raw emulator failure (`Could not spawn 'java -version'`) does not say what to fix. CI needs nothing here — `ubuntu-latest` ships a JDK.

2. **Playwright's Chromium.** `npx playwright install chromium` once per machine (`--with-deps` too on Linux).

3. **App configuration.** The production server validates its startup variables, so the build and the server must see the same values. `apps/web/.env.local` is loaded by Next and is the normal way to provide them; exported variables work too. Without them the server refuses to start and Playwright times out waiting for `http://localhost:3000`.

## How the pieces fit

- `scripts/e2e-local.mjs` — the runner behind `test:e2e:local`.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` makes `lib/firebaseAdmin` skip the service account and read the emulator, so `/api/tracking` and the other Firestore-backed routes answer without credentials. This variable must never be set on a deployment.
- `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` / `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` do the same for the **browser** SDK (`connectFirestoreEmulator` / `connectAuthEmulator`). They are read from `clientEnv`, so they only take effect when set **at build time** — which is what `npm run test:e2e:signed-in` does. They are also added to the CSP `connect-src` for that build; without that entry the sign-in request to `127.0.0.1:9099` is blocked and Firebase reports `auth/network-request-failed`.
- The emulator runs inside `firebase emulators:exec`, which starts it, runs the specs and stops it. Do **not** launch it with a trailing `&`: a background process is killed when its shell/CI step ends, and the specs then meet a closed port.
- `PLAYWRIGHT_WEBSERVER_COMMAND` is set by the runner so Playwright serves the existing build instead of `npm run dev`. The explicit `-p 3000` matters: with `output: "standalone"` a bare `next start` binds an arbitrary port.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are **blanked** and `RATE_LIMIT_STORE_OPTIONAL=1` is set for the run. `.env.local` normally holds real credentials, and the whole suite arrives from one IP inside a single 60s limit window, so the app's own limiter returned `429 RATE_LIMIT_ERROR` partway through a run — and the next run in the same minute started with a full bucket. A production build without a store **refuses to boot** (a deployment must not serve traffic with rate limiting silently off), so the E2E runner and the `e2e` CI job set that opt-out explicitly. Do not set it anywhere else; it is the only way past the check.

CI runs one `emulators:exec` for both spec files — see the `e2e` job in `.github/workflows/ci.yml`.

## What skips, and why

Skips are visible in the output; they are not passes.

| Spec | Skips when |
| --- | --- |
| `hydration.spec.ts` → PayPal SDK | The page never requests `paypal.com/sdk/js`, i.e. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is unset or a placeholder. Any real id (sandbox included) runs it. |
| `signed-in-smoke.spec.ts` | Neither a staging `BASE_URL` nor the local Auth emulator is configured, or the admin credentials are unset. `npm run test:e2e:signed-in` satisfies all three locally. |
| `admin-refund.spec.ts` | Same, plus a seeded refund fixture: it moves real money and only runs against staging. |

## Troubleshooting

- **`Could not spawn 'java -version'`** — no JDK on PATH; see Prerequisites.
- **`Port 8080 is not open on localhost … could not start Firestore Emulator`** — an earlier emulator is still alive. Find and stop it: `netstat -ano | grep ":8080"`, then `taskkill //PID <pid> //F` (Windows) or `kill <pid>`.
- **Playwright times out waiting for `http://localhost:3000`** — the server failed its startup validation. Run `npm run build && npm run start -- -p 3000` by hand to see the error.
