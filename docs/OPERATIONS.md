# Operations Runbook — ShipIN

How to change the data model, recover data, roll back a deploy, and know when
the platform is unhealthy. Pair this with `DEPLOYMENT.md` (setup) and
`SECURITY_AUDIT.md` (threat model).

**Current stack:** Next.js 16 on Vercel, Firebase Auth + Firestore
(`firebase-admin`), Upstash Redis (rate limiting), Cloudflare R2 (files),
PayPal (payments), Resend/Nodemailer + WhatsApp (notifications), Discord
webhooks (alerting), Vercel Analytics/Speed Insights.

---

## 1. Data model versioning (Firestore)

Firestore is schema-less, so the schema is whatever the code and
`firestore.rules` agree on. The TypeScript types in `src/types` and the
`ADMIN`/customer API validators are the contract.

### Collections

| Collection | Owner | Notes |
|---|---|---|
| `users` | Firebase Auth + admin | profile, role, `walletBalance` mirror |
| `wallets` / `walletTransactions` | admin API | balance is authoritative here, not on `users` |
| `requests` | admin + customer | order lifecycle, quote, payment, shipment refs |
| `quotes` | admin | expiring price quotes |
| `paypalPaymentOrders` | server only | order → capture bookkeeping |
| `notifications` | server + client read | per-user fan-out |
| `users/{uid}/addresses` | customer | saved shipping addresses — a subcollection, not top-level |
| `shipments` | admin | carrier/tracking data |
| `supportTickets` / `supportMessages` | customer + admin | support thread |

There is no `refundRequests` collection. Refund state lives on `requests`
(`refund*` fields and `statusHistory`) and on `walletTransactions`; the rule
for the old collection was removed.

### Rules for every schema change

1. **Additive first.** Add fields; never rename or change the type of a field
   in one step. A rename is add-new → dual-read → backfill → drop-old.
2. **Readers tolerate the previous shape** for at least one deploy. Use
   defaults (`doc.shipmentId ?? null`) so old documents stay readable while a
   backfill runs — a rolling deploy always has both versions live.
3. **Version documents that change shape.** When a document's meaning changes,
   stamp `schemaVersion` on write and branch reads on it.
4. **Security rules ship with the code.** Update `firestore.rules` in the same
   PR as the code that needs the new field, and add a case to
   `src/lib/firestoreRules.test.ts`.
5. **Migrations are idempotent, resumable and dry-runnable.** Running one twice
   must not double-apply (e.g. `increment` guarded by a `migratedAt` marker).

### Status: runner exists, documents are not yet versioned

The runner is `apps/web/scripts/migrations/migration-runner.ts`, wrapped by
`npm run migrate`. It loads `NNN-<name>.ts` from that directory, records each
applied migration in the `migrations` collection, and supports `--dry-run`.
Today **no document carries `schemaVersion`**; a breaking shape change still
needs the four-step procedure below.

```bash
npm run migrate -- 002-normalize-quote-expiry --dry-run   # report only
npm run migrate -- 002-normalize-quote-expiry             # apply
```

**Required once for quote expiry.** `/api/admin/requests/quotes/expire` can
only match rows that have `quote.expired == false` and a Timestamp
`quote.expiresAt`, and Firestore cannot filter on a missing field. Quotes
written before that invariant existed are invisible to the sweep, so they never
expire and the hourly cron keeps reporting `expired: 0`. Run migration 002 once
against the production project (dry run first); after that every writer
produces the shape the sweep needs.

```bash
npm run migrate -- 003-money-minor-units --dry-run   # report only
npm run migrate -- 003-money-minor-units             # apply
```

**Required before ADR-0008 phase 4.** Adds `balanceMinor` to every wallet and
`amountMinor` / `balanceAfterMinor` to every ledger row, converting from the
decimal fields. It is safe to run while the writers still write decimals: the
readers take whichever field is present. Three things the report counts, and
what to do about each:

| Counter | Meaning | Action |
| --- | --- | --- |
| `wrote N` | Converted | None |
| `already migrated` | Already carried a valid integer | None; reruns are inert |
| `mismatch(es)` | The stored integer disagrees with the stored decimal | Investigate before phase 4 — the integer is what readers will use, so a disagreement means either a partial earlier write or a manual edit |
| `unreadable` | The decimal is NaN or a malformed string | Left alone deliberately (writing 0 would erase money). Reconcile against the ledger by hand |

The run is idempotent; a partial failure is recovered by running it again. It
was verified against the emulator with seeded legacy, already-converted,
mismatched and unreadable documents, including a page size of 2 to exercise the
`__name__` cursor.

**While the writers are dual-writing, the dry run doubles as the divergence
check.** `--dry-run` reports as a mismatch every document whose `…Minor` field
disagrees with its decimal — which is exactly the corruption dual-writing can
introduce. Run it after each deploy that touches a money writer; a nonzero
mismatch count means stop and reconcile.

**Stop using it the moment `MONEY_MINOR_ONLY=1` is set.** The decimal fields are
then frozen at their last-written values by design, so every wallet that moves
money afterwards reports a mismatch. That is expected, not drift — reading those
counters as an alarm is the fastest way to waste a night. After the flip the
check is `POST /api/admin/wallet/invariants` (the daily cron), which compares
balances against the ledger in minor units on both sides.

`reserved` on a wallet is still decimal-only. It is an operational hold with a
30-minute TTL rather than a ledger amount, so it converts with phase 4 (or gets
dropped in favour of `walletHolds`) rather than in this backfill. `reservedMinor`
is written alongside it, and the sweep compares the integer side.

### `MONEY_MINOR_ONLY` — the phase 4 switch

Every wallet writer produces both representations. `MONEY_MINOR_ONLY=1` stops
them writing the decimals, leaving only `balanceMinor`, `amountMinor`,
`balanceAfterMinor`, `reservedMinor`. The decision lives in
`apps/web/src/lib/moneyMode.ts` and nowhere else.

**Do not set it until all four of these are true**, because each one is a way for
the switch to turn money into zero rather than into a smaller number:

1. `npm run migrate -- 003-money-minor-units --dry-run` against production
   reports `0 mismatch(es)` and `0 unreadable`.
2. The backfill has been *applied*, not just dry-run — a wallet created after a
dry run but before the apply has no minor field, and once the switch is on it
reads as empty.
3. Every reader is on `storedMinor`. The admin wallet invariant sweep was the
   last hold-out; it reads and compares integer minor units on both sides now.
4. Mobile or long-lived clients that query Firestore for `balance` directly are
   gone. The web app reads through `storedMinor`, but a client holding a Firestore
   listener is not something a deploy can fix.

Readers keep accepting both shapes in either mode. That is a deliberate
departure from ADR-0008, which called for dropping the fallback: the fallback is
what makes a document the backfill missed read as money instead of as zero, and
it costs a `typeof` check.

It is not retired after 004, which was the plan while writing this: `walletHolds.amount`
stays decimal (a hold lives 30 minutes and is deleted when consumed), and that is read
through the same helper. The fallback therefore keeps a real job, and the honest
statement is that it stays until holds are converted too.

### 004-strip-money-decimals — then the decimals are gone

```bash
npm run migrate -- 004-strip-money-decimals --dry-run   # report only
npm run migrate -- 004-strip-money-decimals             # apply
```

Deletes `balance` / `reserved` from wallets and `amount` / `balanceAfter` from
ledger rows. Run it only **after** `MONEY_MINOR_ONLY=1` has been live long enough
that no decimal-writing instance can still be running: the writers read a
schedule, not a document, so a deploy overlap is the only thing this migration
can break.

It deletes nothing it cannot replace. A field whose `…Minor` counterpart is
missing or is not an integer is kept and counted as `incomplete`; a field whose
integer disagrees with it is kept and counted as a `mismatch`. Run the dry run and
expect both counters to be **0** before applying. Anything else is a document to
look at, not a warning to ignore — after this migration the decimal is the only
evidence of what the value used to be.

`walletHolds.amount` is intentionally left decimal. A hold is deleted when it is
consumed and never outlives its 30-minute TTL, so there is no history to retire
and removing a live one only adds a way to lose a reservation.

### Migration procedure (four steps, two deploys minimum)

```
Deploy 1  — writer writes both shapes + `schemaVersion`; readers use defaults
Backfill  — run the script against production (dry-run first)
Deploy 2  — readers switch to the new field; old field still written
Deploy 3  — stop writing the old field (after observing 2 is clean)
Cleanup   — optional script to delete the old field
```

Backfill template (idempotent, batched, safe to re-run):

```ts
// scripts/migrations/NNN-<name>.ts
// Usage: npm run migrate -- NNN-<name> [--dry-run]
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");
const db = getFirestore(initializeApp({ credential: cert(/* service account */) }));

async function run() {
  let cursor: string | undefined;
  do {
    const page = await db
      .collection("requests")
      .where("schemaVersion", "==", 1)
      .orderBy("__name__")
      .limit(400)
      .startAfter(cursor ? db.doc(`requests/${cursor}`) : undefined)
      .get();

    const batch = db.batch();
    for (const doc of page.docs) {
      if (doc.get("migratedAt")) continue;          // idempotent
      batch.update(doc.ref, { schemaVersion: 2, migratedAt: new Date() });
    }
    if (!DRY_RUN && !page.empty) await batch.commit();
    cursor = page.docs.at(-1)?.id;
    console.log(`${DRY_RUN ? "[dry-run] " : ""}migrated ${page.size} docs up to ${cursor}`);
  } while (cursor);
}
```

Operational rules: take a backup immediately before any backfill
(see §2), run in off-peak hours, watch `/api/health` and the Discord alerts during it, and
record the run in the incident log with the exact script version and commit.

---

## 2. Backups and disaster recovery

### What must be backed up

| Asset | Backup mechanism | Owner |
|---|---|---|
| Firestore (all business data) | PITR + scheduled export (below) | infra |
| Firebase Auth users | included in Firestore exports of the Auth tenant; configure Auth export in console | infra |
| Cloudflare R2 objects | R2 versioning / lifecycle replication | infra |
| Code | GitHub (`main` is always deployable) | dev |
| Secrets | Vercel environment variables + password manager | infra |
| Upstash Redis | **not backed up by design** — ephemeral counters only | — |

PayPal remains the source of truth for captured payments; Firestore only
mirrors it. R2 object loss is recoverable from the source uploader, not from
Firestore.

### Enable both mechanisms

Firestore backups require the **Blaze** plan.

```bash
# 1. Point-in-time recovery (7-day window) — protects against corruption/bad writes
gcloud firestore databases update --database="(default)" --enable-pitr

# 2. Daily scheduled export to a GCS bucket, lifecycle-retained 90 days
gcloud firestore export gs://shipin-backups/$(date +%F) \
  --database="(default)" --collection-ids='*'

# schedule it (Cloud Scheduler -> gcloud firestore export), not from a laptop
```

### Targets

| Scenario | RPO | RTO | Procedure |
|---|---|---|---|
| Bad deploy | 0 | < 5 min | Roll back the deployment (§3) |
| Bad migration / mass bad write | ≤ 5 min (PITR) | 30–60 min | PITR restore to a timestamp just before the write |
| Region/data loss | ≤ 24 h (export) | 1–4 h | Import the latest export into a new database, repoint the app |
| Single corrupted document | ≤ 24 h | 15 min | Read the doc from the export, rewrite it |

### Corruption playbook

1. **Stop the bleeding first.** Roll back the deploy that wrote the bad data,
   or disable the offending API route. A restore that runs while writes
   continue is wasted work.
2. **Bound the damage.** Identify affected collections and the timestamp
   window from the logs.
3. **Restore into a new database**, not over the live one:
   `gcloud firestore import gs://shipin-backups/<date> --database="restore-tmp"`,
   inspect it, then copy the affected documents back.
4. **Reconcile with PayPal** for anything payment-related — Firestore is not
   authoritative for money.
5. **Post-incident:** add the invariant that was violated to
   `firestore.rules` or to the API validator, and add a regression test.

Drill this quarterly: restore the latest export into a scratch project and
verify a known document count and a wallet balance match. An untested backup
is not a backup.

---

## 3. Rollback

**Code deploys are the cheap case.** Vercel keeps every immutable build, so a
rollback is a promotion, not a rebuild — typically under a minute and with no
DNS change.

### Application rollback (fastest)

```bash
vercel rollback                     # promote the previous production deployment
vercel ls shipin                    # or pick a specific deployment
vercel promote <deployment-url>     # promote an older one explicitly
```

Verify afterwards: `curl -s https://shipin-psi.vercel.app/api/health` returns
`status: "healthy"`, sign-in works, and a sandbox payment completes.

### Code rollback (when the bad change is also in `main`)

```bash
git revert <bad-commit> && git push   # reverts via the normal pipeline
```

Never force-push `main` to undo a deploy — the revert must be reviewable.

### Firestore rules rollback

Rules deploy separately from the app:

```bash
git checkout <last-good> -- firestore.rules storage.rules
firebase deploy --only firestore:rules,storage
```

Note the ordering: if a rollback touches both code and rules, deploy the
**code first**, because old code may rely on old rules but new code must not
run against rules that reject its writes.

### Environment variables

Changing a Vercel env var requires a redeploy to take effect. Record the
previous values before changing them (Vercel shows history per variable), and
prefer adding a new variable over mutating a live one.

### Data migrations are not rolled back

A code rollback does **not** undo a backfill. Therefore:

- keep each migration idempotent and write its inverse in the same PR;
- never delete the old field in the same deploy that stops writing it;
- if a migration was wrong, roll the code back and run the inverse script
  (or restore from PITR if the data cannot be reconstructed).

### Decision matrix

| Symptom | Action |
|---|---|
| Errors after deploy, data intact | `vercel rollback`, then fix forward |
| New code wrote bad data | Rollback + PITR restore to the pre-deploy timestamp |
| Health `degraded` | Read the response body: recent limiter errors, a store-less production boot (`RATE_LIMIT_STORE_OPTIONAL=1`), or App Check enforced without a site key. Requests are still served — the limiter fails **open** — so check the Upstash status page and the Discord alerts, and fix the configuration |
| `/api/health` does not answer 200 | The deployment itself is unavailable (boot crash or platform outage): `vercel logs shipin --since 30m`, then `vercel rollback`. There is no `unhealthy` body state to look for — see §4 |
| Rules reject legitimate writes | Roll back `firestore.rules` alone |

---

## 4. Monitoring and alerting

### Already wired

| Signal | Where | Coverage |
|---|---|---|
| App Check rejection spikes | `src/lib/appCheckMetrics.ts` → Discord webhook | reCAPTCHA quota outages |
| Page views / traffic | `@vercel/analytics` in `src/app/layout.tsx` | audience |
| Core Web Vitals (real users) | `@vercel/speed-insights` in `src/app/layout.tsx` | front-end latency |
| Rate-limiter health | `GET /api/health` | Redis reachability + error counts |

### `/api/health` semantics

Public, unauthenticated, and safe for uptime monitors.

| `status` | HTTP | Meaning | Should page? |
|---|---|---|---|
| `healthy` | 200 | Shared store configured, no recent limiter errors, App Check as configured | no |
| `degraded` | 200 | No shared store in production, recent limiter errors, or App Check enforced without a site key | **yes** |

There is no `503` response. The route always answers 200 with the status in the
body: a 503 made load balancers pull a still-serving deployment out of rotation.
A production build without a store refuses to start (`validateProductionRequiredEnv`,
see §5), so a missing store cannot reach this endpoint in a healthy deployment.

`degraded` returns 200 because the site still serves traffic, but a monitor
must inspect the body — alert when `status !== "healthy"`.

### Scheduled jobs

| Job | Schedule | Failure signal |
|---|---|---|
| Quote expiry (`expire-quotes-cron.yml` → `POST /api/admin/requests/quotes/expire`) | hourly, GitHub Actions | the run goes red; it posts to the optional `ALERT_WEBHOOK_URL` secret and writes a job summary |
| Wallet ledger invariants (`wallet-invariants-cron.yml` → `POST /api/admin/wallet/invariants`) | daily, GitHub Actions | 409 on any balance/ledger/hold mismatch or a truncated scan; posts to `ALERT_WEBHOOK_URL` and writes the drift report to the job summary. The sweep reads every collection to the end, so truncation means the wall-clock budget ran out: the response names the collection and the reason, and `WALLET_SWEEP_BUDGET_MS` (with the route's `maxDuration`) is the knob |

GitHub schedules are best-effort: a run can be delayed or skipped under load, so
`expired: 0` from one run is not proof the sweep is broken — check the run
history. The sweep drains itself (each expired quote leaves the query), so a
missed hour is picked up by the next run without a cursor.

### Uptime monitor to configure

One check per region, every minute, alerting after two consecutive failures:

```
GET https://shipin-psi.vercel.app/api/health
expect: status 200            AND body.status == "healthy"
```

Point it at the canonical Vercel host (§ `DEPLOYMENT.md` → Domains and
origins), not the Firebase aliases.

### Alerts still missing (backlog)

These are the gaps that the Discord alert alone will not catch. Add in this order:

1. **Payment degradation** — alert on `POST /api/paypal/capture-order`,
   `/api/paypal/capture-wallet-topup` and `/api/webhook`: alert when the 5xx
   rate exceeds 2% over 5 minutes, or when `paypal` webhook verification
   failures exceed 1.

   Each event is **claimed** before it is processed: `paypalWebhookEvents/{eventId}`
   is written inside a transaction first, so two simultaneous deliveries cannot both
   decide they are the first. The claim is released when processing fails (PayPal's
   retry then gets a clean run), and a claim older than two minutes is treated as an
   attempt that died and may be taken over. A marker with no `status` field predates
   this and counts as processed, so a deploy mid-retry does not double-process.

   The webhook also refuses — with `400 MISSING_EVENT_ID` and a `critical` alert
   (`PAYPAL_WEBHOOK_MISSING_EVENT_ID`) — any signed payload that arrives without an
   event id. Such a body cannot be deduplicated, so the retry PayPal sends would be
   processed as a new event. PayPal always sends `id`, so this firing means something
   between PayPal and the route rewrote the payload: treat it as an incident, not as
   noise.
2. **Email/WhatsApp delivery** — count `EXTERNAL_SERVICE_ERROR` from
   `src/lib/mailer.ts` and `src/lib/whatsapp.ts`; alert on any 5xx from the
   provider in production.
3. **Redis fail-closed** — alert on `status == "degraded"` from
   `/api/health` (Upstash dashboard alerts cover the provider side).
4. **Latency budget** — alert when p95 on `/api/paypal/*` exceeds 3 s in the
   platform request metrics.
5. **Synthetic checkout** — a scheduled sandbox end-to-end (create order →
   capture) is the only thing that proves payments work end to end; not yet
   implemented.

---

## 5. Rate limiting in production

Two guards, and they behave differently on purpose:

- **Boot:** `validateProductionRequiredEnv()` (called from
  `src/instrumentation.ts`) exits 1 when the shared store is missing in
  production, so a deployment that would limit per instance never starts.
  `RATE_LIMIT_STORE_OPTIONAL=1` is the only opt-out; only the local/CI E2E
  runner sets it.
- **Runtime:** if the configured store becomes unreachable, requests are still
  served — the limiter falls open and counts the error — because an Upstash
  outage must not lock every user out of signing in. `/api/health` reports
  `degraded` (HTTP 200) so the gap stays visible. It never falls back to
  per-instance limits.
- **Development/test:** without Redis the in-memory limiter is used, so local
  work needs no Upstash account.

---

## 6. On-call quick reference

```bash
curl -s https://shipin-psi.vercel.app/api/health | jq
vercel logs shipin --since 30m
vercel rollback                      # last resort, ~30s
gcloud firestore databases describe --database="(default)"   # PITR state
```

Escalation path: payment failures → PayPal status page → Upstash status page

### Upstash outage vs the admin denylist

Admin requests verify the MFA session against a Redis denylist, and that check fails
**closed**: if Upstash is unreachable, the answer to "is this session revoked?" is
unknown, so the session is refused. During a full outage that means every admin is
locked out, including one who signed in a minute ago. `/api/health` names it:

```bash
curl -s https://shipin-psi.vercel.app/api/health | jq .mfaDenylist
# { "mode": "closed", "configured": true, "degraded": false, ... }
```

Two ways through, in order of preference:

1. **Wait it out.** Upstash outages are usually minutes. Elevated sessions are valid for
   12h absolute, so nothing is lost but time.
2. **Open the breaker, deliberately.** With
   `MFA_DENYLIST_DEGRADED_MODE=open` set on the deployment, three consecutive read
   failures open a bounded window (`MFA_DENYLIST_DEGRADED_SECONDS`, default 300s, clamp
   30..3600) in which verifications are allowed without a revocation check. One
   critical alert (`MFA_DENYLIST_DEGRADED_OPEN`) fires when the window opens, a warning
   is logged at most once a minute per accepted session, and `/api/health` reports
   `degraded: true` with `degradedAccepts`. A successful read closes it immediately, and
   when the window expires without one, enforcement resumes and the failure count
   restarts - a duty cycle rather than a switch that stays open.

   **What you are accepting while it is open:** a session revoked *during* the outage
   still works. Sessions revoked before it are unaffected - their entries are in Redis
   already, not in this breaker. Review `degradedAccepts` afterwards and revoke again
   anything that was terminated in the window.
→ Vercel status page. Record every production incident in the incident log
with the timeline, the rollback decision, and the follow-up test that prevents
recurrence.

## 7. Admin lockout - break-glass MFA reset

Every admin route requires MFA. A raw `X-MFA-WebAuthn` header is deliberately
**not** accepted by `requireAdmin` (see `lib/adminAuth.ts`): a bare
assertion proves nothing without a per-request challenge and a signature check
against the stored public key. The supported path for a security key is to complete
`POST /api/auth/mfa/session` and present the short-lived signed cookie it
issues.

That leaves one gap. `POST /api/admin/users/{uid}/mfa/reset` also requires an
admin who already passed MFA, so **the last admin who loses their security key
cannot use it** - and with no backup admin there is no way back into `/admin`.

Prevent it. It takes a minute:

1. Enrol a **second** factor on every admin - TOTP or a backup code, not only the
   key. The gate accepts `X-MFA-TOTP` and `X-MFA-Backup` for exactly
   this case.
2. Keep a second admin account with its own factors, so the audited reset API
   stays available.

Recover it, when prevention came too late. This runs with the service-account key
rather than a session, so it is the same trust level as deploying: anyone who can
run it can already read and rewrite every wallet in the project.

```bash
cd apps/web
node --env-file=.env.production scripts/break-glass/mfa-reset.ts \
  --email admin@example.com --reason "security key lost"              # dry run

node --env-file=.env.production scripts/break-glass/mfa-reset.ts \
  --email admin@example.com --reason "security key lost" \
  --confirm admin@example.com                                        # apply
```

It refuses a non-admin account (customers have the audited support path), refuses a
`--confirm` that does not match the address, and requires a `--reason`. It
clears the Auth factors and the `mfa.*` fields, revokes refresh tokens, and
writes an `adminAuditLog` entry with action `mfa.break_glass_reset`.

Afterwards the admin signs in, enrols a new factor at the next prompt, and the
address keeps its role. Existing ID tokens stay valid for up to an hour; refresh
tokens are revoked, which stops silent renewal. If nobody expects the reset, treat
it as a breach and follow section 8: rotate the service-account key.

## 8. A customer cannot verify their email

`requireAuth` rejects `email_verified !== true` on every authenticated API route, so
an unverified customer can reach nothing but `/verify-email`. Two exits exist, and
they cover different failures.

### The mail never arrived, or they cannot find it

The verify screen's resend button calls `POST /api/auth/resend-verification`. It
sends through the app's own mailer rather than Firebase's, and enforces a per-account
cooldown (`RESEND_COOLDOWN_SECONDS`, 60s) stored on `users/{uid}`.

A failed send does **not** start the cooldown, so a delivery failure cannot lock the
customer out of retrying the fix for it. A `429` carries `retryAfter` in seconds and
the UI renders the wait instead of inviting another attempt. `ALREADY_VERIFIED` means
the link was clicked elsewhere: the screen reloads the user record and moves on.

### The link does not expire

The mail carries `https://<APP_URL>/verify-email?token=<uid>.<signature>`, signed with
`EMAIL_VERIFICATION_SECRET` (falling back to `MFA_SESSION_SECRET`). Firebase's own
verification link is bounded by a project setting, and an expired link costs a resend,
a mail and the same support question again; this one works whenever the customer gets
to it.

The trade is contained, and the invariants are worth knowing when reading an incident:

- the signature covers the uid, the address and a per-account version, so a link
  cannot be forged, retargeted at another account, or used against a new address;
- redeeming bumps `users/{uid}.verificationTokenVersion`, which retires that link and
  every earlier one. That is what makes it single-use: an archived or forwarded email
  stops working once it has been used;
- nothing token-like is stored, so a Firestore read cannot be turned into a working
  link, and re-sending costs one mail and no writes beyond the cooldown stamp;
- the page redeems the token with a POST after load, not on the navigation, so a mail
  scanner or link preview cannot spend a single-use link before the customer clicks.

The response names which kind of link was sent: `link: "permanent"` normally, or
`"expiable"` when no signing secret is configured and the app fell back to Firebase's.
A customer reporting a dead link on a `"permanent"` deployment means the link was
already used or the address changed - ask them to request a new one rather than
looking for an expiry setting.

### They no longer have access to that mailbox

A resend cannot help, and asking them to create a new account loses their orders,
their wallet balance and their history. An admin can verify the address directly:

```bash
curl -X POST "$PRODUCTION_URL/api/admin/users/<uid>/verify-email" \
  -H "Authorization: Bearer <admin id token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer lost mailbox access, verified by phone 2026-03-04"}'
```

This bypasses a security control, so it is guarded rather than convenient:

- the caller must be an admin **and** have passed the MFA gate (`requireAdmin`);
- `reason` is required (3-200 characters) and is written to `adminAuditLog` with the
  actor uid under the action `user.email.verify_override`;
- an account that is already verified answers `409 ALREADY_VERIFIED` - a repeat is a
  mistake worth surfacing, not a silent no-op;
- the address itself is never changed. Verification says "we accept this address", it
  does not swap it for another.

The response sets `tokenRefreshRequired: true`, because the customer's cached ID token
keeps `email_verified: false` until it refreshes (up to an hour). Tell them to sign out
and back in if they do not want to wait.

### Afterwards

Check `adminAuditLog` for the override. If the same `uid` appears twice, the mailbox
really is gone and the address on the account should be changed deliberately rather
than bypassed again.

### Deleting a throwaway account

An account created to exercise a flow (a test signup, a scratch customer) can be
removed from `/admin/users` - the row's **Delete** action opens a confirmation panel
asking for a reason and for the account's address to be typed out.

```bash
curl -X POST "$PRODUCTION_URL/api/admin/users/<uid>/delete" \
  -H "Authorization: Bearer <admin-id-token>" \
  -H "X-MFA-TOTP: <code>" \
  -H "content-type: application/json" \
  -d '{"reason":"throwaway checkout test","confirmEmail":"test-buyer@example.com"}'
```

It is refused on purpose in four cases:

- `CANNOT_DELETE_SELF` - the account making the call;
- `TARGET_IS_ADMIN` - an administrator, so the console cannot delete its own owner;
- `EMAIL_CONFIRMATION_MISMATCH` - the typed address is not the account's address (the
  server compares it, so a request that skips the form still fails);
- `ACCOUNT_HAS_HISTORY` - any order, wallet entry, wallet hold or wallet document
  exists. Those accounts go through the customer's erasure flow, which anonymises and
  keeps the financial records required for accounting and tax.

The Auth user is deleted **last**, after Firestore is clean: a half-deleted account is
recoverable, a login with no profile and no trace is not. The action is recorded in
`adminAuditLog` as `user.account.delete` with the reason, the address, and the count of
documents removed.

## 9. Personal data breach response

The regulator clock starts when a ShipIN person becomes aware of an incident, not
when the post-mortem starts. GDPR allows 72 hours to notify the competent
supervisory authority; DPDP requires notification to the Data Protection Board
and to affected Data Principals.

1. **Contain first (0–1h).** Rotate the exposed credential, revoke the session,
   or disable the route. Never delete logs or Firestore documents while
   investigating — the register needs them.
2. **Record the incident.** `POST /api/compliance/breach` as an admin
   (`src/lib/compliance/breach.ts` keeps the register: severity, timeline, data
   categories, affected users). An incident without a register entry is an
   incident that cannot be reported accurately.
3. **Scope it (1–24h).** Which collections and fields were reachable? Use the
   `logRightsRequest` trail and Firestore audit fields to bound the affected
   user ids. Do not sample: enumerate.
4. **Decide reportability (by 24h).** Risk to rights and freedoms — credentials,
   payment identifiers, addresses, inspection photos — is reportable. A
   theoretical exposure with no evidence of access may not be, and that decision
   is written down with its reasoning.
5. **Notify (by 72h).** Supervisory authority and, where high risk, affected
   customers in plain language: what happened, when, what data, what we did,
   what they should do, who to contact (`support@shipin.co`).
6. **Rotate and fix.** The credential rotated in step 1 stays rotated. Add the
   regression test that would have caught it.
7. **Close the entry** with the notification dates and the fix reference. The
   register is the evidence of compliance; a closed entry with dates is worth
   more than a perfect narrative.

Never state in public copy that a breach did not happen, or that data "may have"
been accessed, before step 3 is complete.

## 10. Retention purge (Privacy Policy §8)

`POST /api/admin/compliance/retention/purge` enforces the retention table on the
privacy page. Before this existed the periods were published but nothing applied
them: every inspection photo and support transcript was kept forever.

- **Schedule:** `.github/workflows/retention-purge.yml`, daily at 02:40 UTC.
  Same `CRON_SECRET` timestamp + HMAC scheme as the quote sweep; the endpoint is
  `public` in `routeAuth.ts` because GitHub Actions has no Firebase session.
- **Deletes:** R2 objects referenced by `warehouse.inspectionPhotos`,
  `warehouse.photos` and `warehouse.shippingLabel` for requests delivered more
  than 24 months ago (then clears those pointers and stamps
  `retention.photosPurgedAt`); `supportTickets` documents — with their
  `supportMessages` — resolved more than 24 months ago.
- **Never deletes:** orders, invoices or payment records (8-year legal period),
  a reopened ticket (`status` is not `resolved`), or anything whose timestamp
  cannot be parsed. A parse failure must not become a deletion.
- **Storage failures:** if R2 reports a per-key error, the pointers stay, so the
  next run retries instead of leaving unreferenced objects behind.
- **Paging:** each run handles 50 documents per collection and keeps its position
  in `system/retention`. When a page comes back short the cursor is removed, so
  the next run starts a fresh pass from the oldest record.

Manual check against production:

```bash
TS=$(date +%s%3N)
SIG=$(printf '%s|' "$TS" | openssl dgst -sha256 -hmac "$CRON_SECRET" | sed 's/^.* //')
curl -sS -X POST -H "x-cron-timestamp: $TS" -H "x-cron-signature: $SIG" \
  "$PRODUCTION_URL/api/admin/compliance/retention/purge"
```

The response reports `photos` and `support` counts plus `passComplete`. An empty
run with `scanned: 0` on both is the healthy steady state; a run where
`objectsFailed` keeps growing means R2 credentials or bucket policy are wrong.
