# PITR and Export Bucket Verification Checklist

**Status: UNVERIFIED** — The repository only documents how to enable these mechanisms; no production verification has been performed. Notably, the Auth export is **not automated yet** and runs separately from the Firestore export (documented in Operations Runbook §2 but with no scheduled job). Nobody should assume user accounts are covered by the Firestore export.

---

## 1. PITR (Point-in-Time Recovery) Verification

### Command to Enable PITR
```bash
gcloud firestore databases update --database="(default)" --enable-pitr
```

### Command to Verify PITR State and Earliest Recoverable Version
```bash
gcloud firestore databases describe --database="(default)" \
  --format='value(pointInTimeRecoveryEnablement, earliestVersionTime)'
```

### Expected Output (when PITR is enabled)
```
pointInTimeRecoveryEnablement: ENABLED
earliestVersionTime: "2026-11-23T14:20:00Z"
```

### Expected Output (when PITR is NOT enabled)
```
pointInTimeRecoveryEnablement: DISABLED
earliestVersionTime: null
```

### Verification Checklist for PITR
- [ ] Run `gcloud firestore databases update --database="(default)" --enable-pitr` and confirm no errors
- [ ] Run the describe command and confirm `pointInTimeRecoveryEnablement: ENABLED`
- [ ] Record the `earliestVersionTime` — all PITR clones must use a timestamp >= this value
- [ ] **NOTE**: Without PITR enabled, the earliestVersionTime will be null and PITR clones will fail

---

## 2. Daily Export Bucket Verification

### Command to Run Daily Export
```bash
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
gcloud firestore export "gs://shipin-backups/$STAMP" --database="(default)"
```

### Expected Output (successful export)
```
Exporting...
```

### Verification Checklist for Export Bucket
- [ ] Run the export command and confirm "Exporting..." output (no errors)
- [ ] Verify the export file exists in the bucket: `gsutil ls gs://shipin-backups/`
- [ ] Confirm the export contains all expected collections (not just a subset)
- [ ] **NOTE**: The export is additive — it does not clear existing data in the target database

---

## 3. PITR Clone (Bad Write Recovery) Verification

### Command to Clone via PITR
```bash
gcloud firestore databases clone \
  --source-database="projects/shipin-9576a/databases/(default)" \
  --snapshot-time="2026-11-23T10:20:00Z" \
  --destination-database="restore-tmp" \
  --project=shipin-9576a --async
```

### Command to Check PITR Operations Status
```bash
gcloud firestore operations list --project=shipin-9576a
```

### Expected Output (operation in progress)
```
- name: operations/... 
  metadata:
    @type: type.googleapis.com/google.cloud.firestore.v1.OperationMetadata
    state: PENDING
```

### Expected Output (operation complete)
```
- name: operations/...
  metadata:
    @type: type.googleapis.com/google.cloud.firestore.v1.OperationMetadata
    state: DONE
```

### Verification Checklist for PITR Clone
- [ ] Run the clone command with a valid timestamp (>= earliestVersionTime, <= now, whole minute)
- [ ] Run `gcloud firestore operations list` and confirm state changes from PENDING to DONE
- [ ] **IMPORTANT**: Do not import the clone over `(default)` — export documents from the clone and write them back individually

---

## 4. Export Import Verification (Region/Data Loss Recovery)

### Command to Create Empty Destination Database
```bash
gcloud firestore databases create --database=restore-tmp \
  --location=nam5 --type=firestore-native --project=shipin-drill
```

### Command to Import the Latest Export
```bash
gcloud firestore import "gs://shipin-backups/<STAMP>" \
  --database=restore-tmp --project=shipin-drill
```

### Expected Output (import in progress)
```
Importing...
```

### Expected Output (import complete)
```
Done
```

### Verification Checklist for Export Import
- [ ] Create an empty destination database in the same location
- [ ] Run the import command and confirm "Done" output
- [ ] **CRITICAL**: Do not import over `(default)` — always use a separate database
- [ ] Deploy Firestore rules and indexes to the destination: `firebase deploy --only firestore:indexes,rules --project shipin-drill`
- [ ] Auth users must be imported separately via `firebase auth:import` with hash parameters from the console

---

## 5. Current Production Status

| Feature | Production Status | Verification |
|---|---|---|
| **PITR enabled** | **UNVERIFIED** | Repository documents the command but has not run it against production |
| **Daily export bucket** | **UNVERIFIED** | Repository documents the command but has not confirmed exports exist or are current |
| **PITR clone tested** | **NOT MEASURED** | Drill log shows "not measured" — no restore drill has been completed (per 2026-11-23 status) |
| **Export import tested** | **NOT MEASURED** | Same as above — no end-to-end drill recorded |
| **Auth export with hash params** | **NOT AUTOMATED** | No scheduled job runs `firebase auth:export`. Auth export must be triggered manually or via operator script. Prerequisites missing: no scratch project, no verified export bucket, no Auth export stored with hash parameters from console. |

### Drill Prerequisites Missing (per Operations Runbook §2)
- [ ] `gcloud` authenticated with Firestore admin rights
- [ ] Scratch project with billing enabled
- [ ] Export bucket populated with current backups
- [ ] **Auth export stored with its hash parameters and verified** (note: Auth export is **not automated** — no Cloud Scheduler job or cron workflow currently runs `firebase auth:export` on a schedule; it must be triggered manually or via a separate operator‑run script. Do not assume user accounts are included in the Firestore export.)
- [ ] Auth export stored with its hash parameters

### RTO/RPO Status (from Operations Runbook)
| Scenario | RPO | Target RTO | Measured |
|---|---|---|---|
| Bad deploy | 0 | < 5 min | — (rollback only) |
| Bad migration / mass bad write | ≤ 5 min (PITR) | 30–60 min | **not measured** |
| Region/data loss | ≤ 24 h (export) | 1–4 h | **not measured** |
| Single corrupted document | ≤ 24 h | 15 min | **not measured** |

---

## Next Steps to Enable Verification

1. **Install and authenticate gcloud** with Firestore admin access to the production project
2. **Enable PITR** via the `gcloud firestore databases update` command
3. **Run a single daily export** and verify the file appears in the backup bucket
4. **Schedule Cloud Scheduler** to run both PITR enablement and daily exports automatically
5. **Create a scratch project** (`shipin-drill` or similar) for restore drills
6. **Run a quarterly restore drill** against the scratch project and record measured TTR
7. **Update the Operations Runbook** with actual measured RTO/RPO values

**Until these steps are completed, all PITR and export bucket statuses remain UNVERIFIED.**