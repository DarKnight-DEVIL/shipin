# Operations Runbook — ShipIN

How to change the data model, recover data, roll back a deploy, and know when
the platform is unhealthy. Pair this with `DEPLOYMENT.md` (setup) and
`SECURITY_AUDIT.md` (threat model).

**Current stack:** Next.js 16 on Vercel, Firebase Auth + Firestore
(`firebase-admin`), Upstash Redis (rate limiting), Cloudflare R2 (files),
PayPal (payments), Resend/Nodemailer + WhatsApp (notifications), Sentry
(errors + traces), Vercel Analytics/Speed Insights.

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
| `refundRequests` | admin | refund workflow state |
| `notifications` | server + client read | per-user fan-out |
| `addresses` | customer | saved shipping addresses |
| `shipments` | admin | carrier/tracking data |
| `supportTickets` / `supportMessages` | customer + admin | support thread |

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

### Status: not yet versioned

Today **no document carries `schemaVersion`, and there is no migration
runner.** Any breaking shape change currently needs a manual backfill. The
first schema-affecting change should introduce both:

- add `schemaVersion: 1` to documents as they are rewritten (no bulk write
  needed);
- add `scripts/migrations/` with the runner below.

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
// Usage: node --env-file=.env.local scripts/migrations/NNN-<name>.ts [--dry-run]
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
(see §2), run in off-peak hours, watch `/api/health` and Sentry during it, and
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
   window from Sentry/logs.
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
| Health `unhealthy` / 503 | Check `UPSTASH_*` env vars; rollback if a deploy changed them |
| Health `degraded` | Upstash outage — requests fail closed; check status page |
| Rules reject legitimate writes | Roll back `firestore.rules` alone |

---

## 4. Monitoring and alerting

### Already wired

| Signal | Where | Coverage |
|---|---|---|
| Exceptions + 10% traces | Sentry (`sentry.{client,server,edge}.config.ts`) | crashes, slow spans |
| Page views / traffic | `@vercel/analytics` in `src/app/layout.tsx` | audience |
| Core Web Vitals (real users) | `@vercel/speed-insights` in `src/app/layout.tsx` | front-end latency |
| Rate-limiter health | `GET /api/health` | Redis reachability + error counts |

### `/api/health` semantics

Public, unauthenticated, and safe for uptime monitors.

| `status` | HTTP | Meaning | Should page? |
|---|---|---|---|
| `healthy` | 200 | Shared rate-limit store configured, no recent limiter errors | no |
| `degraded` | 200 | Limiter failing recently; requests fail closed with 429 | **yes** |
| `unhealthy` | 503 | Production without `UPSTASH_REDIS_REST_URL`/`_TOKEN` | **yes** |

`degraded` returns 200 because the site still serves traffic, but a monitor
must inspect the body — alert when `status !== "healthy"`.

### Uptime monitor to configure

One check per region, every minute, alerting after two consecutive failures:

```
GET https://shipin-psi.vercel.app/api/health
expect: status 200            AND body.status == "healthy"
```

Point it at the canonical Vercel host (§ `DEPLOYMENT.md` → Domains and
origins), not the Firebase aliases.

### Alerts still missing (backlog)

These are the gaps that Sentry alone will not catch. Add in this order:

1. **Payment degradation** — Sentry alert rule on `POST /api/paypal/capture-order`,
   `/api/paypal/capture-wallet-topup` and `/api/webhook`: alert when the 5xx
   rate exceeds 2% over 5 minutes, or when `paypal` webhook verification
   failures exceed 1.
2. **Email/WhatsApp delivery** — count `EXTERNAL_SERVICE_ERROR` from
   `src/lib/mailer.ts` and `src/lib/whatsapp.ts`; alert on any 5xx from the
   provider in production.
3. **Redis fail-closed** — alert on `status == "degraded"` from
   `/api/health` (Upstash dashboard alerts cover the provider side).
4. **Latency budget** — alert when p95 on `/api/paypal/*` exceeds 3 s in Sentry
   traces.
5. **Synthetic checkout** — a scheduled sandbox end-to-end (create order →
   capture) is the only thing that proves payments work end to end; not yet
   implemented.

---

## 5. Rate limiting is fail-closed in production

This is a deliberate contract, not a bug:

- **Startup:** `src/instrumentation.ts` → `assertRateLimitStoreAvailable()`
  throws if `UPSTASH_REDIS_REST_URL` is missing, not `https://`, or the token
  is empty. A misconfigured production deploy fails to boot rather than
  silently limiting per instance.
- **Runtime:** `createSharedRateLimiter().record()` rejects (429) when no Redis
  client can be created in production and increments the error counter that
  `/api/health` exposes. It never falls back to per-instance limits, because on
  serverless that multiplies the effective quota by the number of regions.
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
