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
it costs a `typeof` check. It is retired last, after 004, because removing it
while any decimal-only document exists turns that document into zero.

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
| Wallet ledger invariants (`wallet-invariants-cron.yml` → `POST /api/admin/wallet/invariants`) | daily, GitHub Actions | 409 on any balance/ledger/hold mismatch or a truncated scan; posts to `ALERT_WEBHOOK_URL` and writes the drift report to the job summary |

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
→ Vercel status page. Record every production incident in the incident log
with the timeline, the rollback decision, and the follow-up test that prevents
recurrence.

## 4. Personal data breach response

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

## 7. Retention purge (Privacy Policy §8)

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
