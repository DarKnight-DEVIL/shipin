# Database Migration Strategy

This document describes the process for running database migrations in ShipIN.

## Overview

Migrations are TypeScript scripts located in `scripts/migrations/`. They are run against Firestore using the Admin SDK and are designed to be idempotent and safe to run multiple times.

## Migration Runner

The migration runner is invoked via:

```bash
npm run migrate
```

This runs `scripts/migrations/migration-runner.ts` which:
1. Loads all migration files from `scripts/migrations/`
2. Sorts them by filename (which should include a timestamp prefix)
3. Executes each migration in a separate Firestore transaction
4. Records the migration status in the `migrations` collection

## Migration File Format

Each migration file exports a default function:

```typescript
// scripts/migrations/20261123000000-description.ts
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export default async function migrate() {
  // Migration logic here
  // Use adminDb for Firestore operations
}
```

The migration function should:
- Be idempotent (safe to run multiple times)
- Use transactions for multi-document changes
- Log progress for auditability
- Handle errors gracefully

## Running in Production

### Prerequisites

1. Ensure `FIRESTORE_EMULATOR_HOST` is NOT set
2. Ensure all required Firebase Admin env vars are set:
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY`

### Execution

```bash
# On Vercel (or any Node.js environment)
npm run migrate
```

The migration runner will:
1. Check which migrations have already been applied (by reading `migrations/{migrationId}`)
2. Skip already-applied migrations
3. Run pending migrations in order
4. Record each migration's completion timestamp

## Rollback Procedure

Migrations should be designed to be reversible. If a rollback is needed:

1. Create a new migration file that undoes the changes
2. Run the new migration
5. Do NOT delete the original migration file

## Schema Versioning

The `migrations` collection in Firestore tracks applied migrations:

```typescript
// Migration document structure
{
  migrationId: "20261123000000-description",
  appliedAt: FieldValue.serverTimestamp(),
  status: "completed" | "failed",
  error?: string
}
```

## Zero-Downtime Migrations

For migrations that could affect live traffic:

1. **Additive changes only**: Add new fields/collections, never remove or rename
2. **Backfill in batches**: Use cursors to process large datasets in chunks
3. **Feature flags**: Gate new behavior behind a config flag
4. **Dual-write**: Write to both old and new schema during transition

Example backfill pattern:
```typescript
const BATCH_SIZE = 500;
let lastDoc = null;

while (true) {
  const query = adminDb.collection("requests")
    .orderBy("__name__")
    .limit(BATCH_SIZE);
  
  if (lastDoc) query.startAfter(lastDoc);
  
  const snapshot = await query.get();
  if (snapshot.empty) break;
  
  const batch = adminDb.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { newField: computeValue(doc.data()) });
  });
  await batch.commit();
  
  lastDoc = snapshot.docs[snapshot.docs.length - 1];
}
```

## CI/CD Integration

Migrations are run automatically in CI after successful build:

```yaml
# .github/workflows/ci.yml
- name: Run migrations
  run: npm run migrate
  env:
    FIREBASE_ADMIN_PROJECT_ID: ${{ secrets.FIREBASE_ADMIN_PROJECT_ID }}
    FIREBASE_ADMIN_CLIENT_EMAIL: ${{ secrets.FIREBASE_ADMIN_CLIENT_EMAIL }}
    FIREBASE_ADMIN_PRIVATE_KEY: ${{ secrets.FIREBASE_ADMIN_PRIVATE_KEY }}
```

## Testing Migrations

1. Run against the Firestore emulator:
   ```bash
   FIRESTORE_EMULATOR_HOST=localhost:8080 npm run migrate
   ```

2. Verify data integrity:
   ```bash
   # Query migrated data
   node -e "require('./scripts/verify-migration.js')"
   ```

## Troubleshooting

### Migration stuck / timeout
- Check Firestore quota limits
- Reduce batch size
- Ensure proper indexes exist

### Migration failed
- Check error in migration document
- Fix the issue and re-run (migrations are idempotent)
- For partial failures, the migration document will have `status: "failed"`

### Duplicate migration error
- If a migration ID already exists with `status: "completed"`, it will be skipped
- To force re-run, delete the migration document (use with caution)

## Current Migrations

| Migration ID | Description | Status |
|-------------|-------------|--------|
| 20261123000000-add-payment-paidat-index | Add payment.paidAt index for reconciliation | Completed |

## Adding New Migrations

1. Create file: `scripts/migrations/YYYYMMDDHHMMSS-description.ts`
2. Export default async function
3. Run locally against emulator
4. Commit and push
5. CI will run on next deploy