# gcloud Firestore Drill — Setup Requirements

## Installation

**gcloud SDK is not currently available in this environment.** To run the Firestore drill, you will need to install gcloud on a machine with:

- **OS**: Linux (recommended), macOS, or Windows with WSL2
- **Python**: 3.9+ (the gcloud installer bundles Python, but a system Python 3.9+ also works)
- **Disk**: ~2 GB free space
- **Network**: Outbound internet access to download the ~500 MB installer

### Install Options

**Option 1: PyPI (recommended if Python is available)**
```bash
pip install google-cloud-sdk
# Then initialize:
gcloud init
```

**Option 2: Standalone binary installer**
Download from: https://cloud.google.com/sdk/docs/install
- Run the `.exe` on Windows or `.sh` on Linux/macOS
- Follow the interactive setup wizard

**Option 3: apt (Linux only)**
```bash
apt-get update && apt-get install -y google-cloud-sdk
# Then initialize:
gcloud init
```

---

## Authentication — Minimum Required

After installation, you must authenticate. The minimum required scope for the Firestore drill is:

```bash
# 1. Log in interactively (opens browser)
gcloud auth login

# 2. OR set service account key (for automated/drill scenarios)
gcloud auth activate-service-account --key-file=/path/to/service-account.json

# 3. Set the project
gcloud config set project shipin-9576a

# 4. Verify project access
gcloud config set project shipin-9576a
gcloud projects describe shipin-9576a
```

### Required IAM Permissions

The drill runner needs these **minimum** IAM roles on the production project `shipin-9576a`:

| Permission Set | Purpose |
|---|---|
| `roles/datastore.user` | Read Firestore documents, list collections |
| `roles/datastore.viewer` | View Firestore state (read-only) |
| `roles/cloudfirestore.viewer` | Alternative to datastore.user for Firestore |
| `roles/storage.objectCreator` | Create objects in the backup bucket |
| `roles/logging.logWriter` | Optional: write drill logs Cloud Logging |

### For PITR Operations

| Operation | Required Permission |
|---|---|
| `gcloud firestore databases update --enable-pitr` | `resourcemanager.projects.enablePittr` |
| `gcloud firestore databases describe` | `resourcemanager.projects.get` |
| `gcloud firestore databases clone` | `resourcemanager.projects.clone` |
| `gcloud firestore operations list` | `logging.logWriter` (read-only) |

---

## Scratch Project Requirements

### Minimum Access for `shipin-drill` (or similar scratch project)

The scratch project must have:

1. **Billing enabled** — Firestore cannot be created without a billing project
2. **Same location as production** — Production is `nam5` (Nairobi), so the scratch project should also be `nam5` for consistent PITR windows
3. **Firestore Native mode** — `type=firestore-native` per the Operations Runbook
4. **Service account with**: 
   - `roles/datastore.user` or `roles/cloudfirestore.user`
   - `roles/storage.objectCreator` (for export imports)
   - `roles/firebaseauth.viewer` (if doing Auth import drills)

### Why a Separate Project?

Per the Operations Runbook §2B:
> "Always import into an empty destination database, never over `(default)`."
> 
> "Then point a **staging** deployment at `shipin-drill` (server credentials and `NEXT_PUBLIC_FIREBASE_*`), verify it, and only then decide whether production should be repointed."

The scratch project allows full restore drills without risking production data.

---

## Export Bucket Requirements

### Minimum GCS Bucket Configuration

The backup bucket (referenced as `gs://shipin-backups/` in the Runbook) must have:

1. **Lifecycle rule** — 90-day retention (per Runbook §2):
   ```bash
   # In the bucket console or via gsutil:
   gsutil lifecycle set lifecycle.json gs://shipin-backups/
   ```
   ```json
   # lifecycle.json content
   {
     "rule": [
       {
         "action": {"type": "Delete"},
         "condition": {"age": 90}
       }
     ]
   }
   ```

2. **IAM on the bucket**:
   - `roles/storage.objectCreator` — for export writes
   - `roles/storage.objectAdmin` — for drill verification reads
   - **NOT** `roles/storage.admin` globally (principle of least privilege)

3. **Service account** running the export must have:
   - `storage.legacyBucketReader` (if reading existing exports)
   - `storage.objectCreator` (for new exports)

---

## Verification Without Production Data

**Never run these against production without explicit confirmation:**

```bash
# ⛔ DO NOT RUN THESE COMMANDS AGAINST PRODUCTION WITHOUT CONFIRMATION:

# 1. Enable PITR on production
gcloud firestore databases update --database="(default)" --enable-pitr

# 2. Clone production via PITR (creates new database)
gcloud firestore databases clone \
  --source-database="projects/shipin-9576a/databases/(default)" \
  --snapshot-time="2026-11-23T10:20:00Z" \
  --destination-database="restore-tmp" \
  --project=shipin-9576a --async

# 3. Export production Firestore
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
gcloud firestore export "gs://shipin-backups/$STAMP" --database="(default)"

# 4. Import into production (NEVER do this)
gcloud firestore import "gs://shipin-backups/<STAMP>" --database=(default)
```

---

## Minimum Confirmation Checklist Before Any Production Action

Before I (or you) run any production gcloud commands, confirm:

- [ ] **gcloud is installed and authenticated** on a trusted machine
- [ ] **Current project is set**: `gcloud config get project` returns `shipin-9576a`
- [ ] **Backup exists**: Latest export in `gs://shipin-backups/` is available and readable
- [ ] **Scratch project is ready**: `shipin-drill` has billing enabled, Firestore created, same location (`nam5`)
- [ ] **Service account keys** are prepared for both production and scratch projects
- [ ] **Rollback plan** is documented — know how to reverse each operation
- [ ] **Time window** is identified — run during off-peak hours (per Runbook: "run in off-peak hours")
- [ ] **Health monitoring** is aware — monitor `/api/health` during the drill

---

## Next Steps (After Confirmation)

If you confirm the above checklist, I can:

1. **Install gcloud** if not present
2. **Authenticate** with the required scope
3. **Check PITR state** on production: `gcloud firestore databases describe`
4. **Verify export bucket**: `gsutil ls gs://shipin-backups/`
5. **Set up scratch project** `shipin-drill` with Firestore
6. **Run a single dry-run export** to verify the bucket works
7. **Document all timestamps** for the drill log

**Reply with confirmation of the checklist items above, and I'll proceed with the drill setup.** No production data will be copied or modified until you explicitly authorize each step.