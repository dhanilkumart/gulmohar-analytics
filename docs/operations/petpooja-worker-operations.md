# Petpooja Daily Worker — Operations

**Prepared:** 27 November 2026  
**Source basis:** `petpooja-worker.md` and `petpooja-synchronization.md` supplied by the user.

> Production installation and timer activation require explicit approval. This is an operational runbook, not authorization to execute it.

## 1. Purpose and schedule

The standalone worker retrieves Petpooja orders and writes normalized orders/items to PostgreSQL.

The supplied worker report describes a host systemd timer scheduled for **23:00 Asia/Kolkata**. Each finite Docker worker processes:
1. Yesterday.
2. Today.
3. A bounded number of older unfinished/missed request dates.

**Important status distinction:** The source says worker code and systemd templates are implemented, but production installation and timer activation require separate approval and verification. Do not assume the timer is active.

## 2. Safety and locking

- `scripts/petpooja-daily-sync.ts` and compatible `npm run petpooja:sync` entry points acquire the same database-wide PostgreSQL advisory transaction lock.
- A dedicated DB connection holds the lock for the execution.
- Competing runs exit `75`.
- Use these entry points for ingestion; direct library calls or external writers do not participate in the same lock.
- Preflight requires an active configured outlet, exact `PETPOOJA_REST_ID` mapping and expected DB host/name.
- Each fetched record must belong to the configured restaurant ID.
- Use the existing application DB role, not a PostgreSQL superuser.

## 3. Completeness and retries

- HTTP 429/5xx, network/timeout and selected transient Prisma transaction errors receive capped exponential retries.
- Authentication, validation, pagination and API business errors are not blindly retried.
- A date is complete only when status is `success`, failed-record/error counts are zero, and counts account for every fetched order.
- Partial dates remain pending and return nonzero.
- Valid empty responses are recorded as `success_empty`; this confirms transport/processing, not independent POS completeness.
- Unmapped product lines are allowed and counted.
- Orders absent from a later API response are not deleted.
- Existing order uniqueness and atomic item replacement remain in place.

## 4. Persistent state and logs

- `state.json` is atomically replaced and flushed.
- `history.jsonl` is appended and flushed before progressing.
- State is bound to DB host/name and outlet UUID.
- State directory must be persistent, private, writable by worker UID 1000 and shared by all worker runs for that target.
- Corrupt or mismatched state fails closed.
- Keep and back up both state and history. Archive history only while no worker is running; retain `state.json`.
- Logs contain dates, run IDs, stage names and counters, not vendor payloads, credentials, customer data, raw exception messages or order IDs.
- External alert delivery and automatic log archival are not included.

## 5. Environment configuration

Required keys identified by the worker report:

```text
DATABASE_URL
PETPOOJA_GET_ORDERS_ENDPOINT
PETPOOJA_REST_ID
PETPOOJA_APP_KEY
PETPOOJA_APP_SECRET
PETPOOJA_ACCESS_TOKEN
PETPOOJA_API_COOKIE
```

Never put their values in this document, source control or container image.

| Setting | Reported default | Purpose |
|---|---:|---|
| `SYNC_EXPECTED_DB_HOST` | `localhost` | Expected host in DB URL |
| `SYNC_EXPECTED_DATABASE` | `gulmohar_dev` | Expected database |
| `SYNC_HISTORY_DIR` | User home + target hash | Durable local state |
| `SYNC_MAX_RUN_SECONDS` | `1800` | Whole-run deadline; allowed 60–7200 |
| `SYNC_MAX_BACKFILL_DAYS` | `7` | Maximum date age and manual range length; allowed 1–3650 |
| `SYNC_RECOVERY_DATES_PER_RUN` | `3` | Older dates recovered per run; allowed 1–31 |
| `SYNC_START_DATE` | unset | Initial recovery start for a new state directory |
| `SYNC_RETRY_ATTEMPTS` | `3` | Attempts per API page / order transaction; allowed 1–5 |
| `SYNC_RETRY_BASE_MS` | `1000` | Exponential backoff base |
| `SYNC_RETRY_MAX_MS` | `30000` | Backoff cap |
| `SYNC_PAGE_TIMEOUT_MS` | `30000` | Whole-page deadline |
| `SYNC_IMAGE` | `gulmohar-petpooja-sync:local` | Worker image tag |
| `SYNC_DB_NETWORK` | `shared-db-net` | External Docker DB network |
| `SYNC_STATE_DIR` | `./tmp/petpooja-sync-state` | Host state bind mount |
| `SYNC_ENV_FILE` | `.env.sync` | Runtime environment file |

The actual CLI and environment validation are authoritative if these defaults change.

## 6. Exit codes

| Code | Meaning |
|---:|---|
| `0` | Complete |
| `1` | Configuration, database, history or unexpected runtime failure |
| `2` | Partial/failure or recovery still pending/outside bounds |
| `75` | Lock busy |
| `124` | Runtime deadline |
| `130` | Interrupted |

Treat every nonzero exit as requiring review.

## 7. Local preflight and tests

Use Node 22 and the existing installed dependencies, as specified by the worker report.

```bash
node --import tsx scripts/petpooja-daily-sync.ts --check
node --import tsx --test tests/petpooja-daily-sync.test.ts
```

`--check` is read-only: it checks database configuration/mapping and credential presence. It does not call Petpooja, initialize history or ingest data.

## 8. Commands that write orders/items

These commands write to the configured database. Verify target host, database, outlet mapping and date scope before execution.

```bash
node --import tsx scripts/petpooja-daily-sync.ts --daily
npm run petpooja:sync -- --date=YYYY-MM-DD
npm run petpooja:sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD
```

Manual command without date arguments defaults to yesterday in IST. Daily execution processes yesterday and today, then bounded recovery work. Date/range limits are controlled by worker configuration.

## 9. Docker execution

The supplied worker report describes `compose.sync.yaml`. Create a private `.env.sync` with the required variables and verify the actual Docker network name.

Local container example from the source runbook:

```bash
docker compose --env-file .env.sync -f compose.sync.yaml build petpooja-sync
docker compose --env-file .env.sync -f compose.sync.yaml run --rm --no-deps petpooja-sync --check
```

Only after reviewing the read-only preflight, a daily run can be started:

```bash
docker compose --env-file .env.sync -f compose.sync.yaml run --rm --no-deps petpooja-sync --daily
```

Do not use `compose up` for this finite worker. Use the same env file, image and persistent state mount for manual Docker runs. Never reuse the reserved scheduled container name for manual runs.

## 10. VPS installation — approval required

The source runbook proposes:
- Application path: `/opt/apps/gulmohar-analytics`.
- DB container/network: `shared-postgres` / `shared-db-net`.
- Production database: `gulmohar_analytics`.
- State directory: `/var/lib/gulmohar-petpooja-sync`.
- Private environment file: `/opt/apps/gulmohar-analytics/.env.sync`.
- Expected DB host/name: `shared-postgres` / `gulmohar_analytics`.
- Worker image should use an approved versioned tag.

Before any action, verify actual host paths, Docker network, DB name/role, systemd timezone support and current deployment. Do not replace the application's existing Dockerfile/Compose deployment.

The source procedure separates installing systemd unit files from enabling the timer. Review the unit, environment, image and recovery baseline first. Enable only the timer after approval; do not independently enable the service.

## 11. Recovery

- Subsequent daily runs process the daily pair and retry pending older dates.
- Recovery is bounded by `SYNC_RECOVERY_DATES_PER_RUN`.
- A gap older than `SYNC_MAX_BACKFILL_DAYS` produces `recovery_window_exceeded`; preserve the cursor and deliberately adjust the age bound only after review.
- Do not delete/reset state to hide a gap.
- `SYNC_START_DATE` affects only a new state directory; changing it does not discard existing pending work.
- Explicit repair can use `--date` or `--from/--to` through the same worker entry point and lock.
- Back up corrupt state and investigate permissions, disk and configuration; do not silently replace it.

## 12. Reliability limitations

- Pagination follows the vendor's 1,000-record/full-page contract, repeated-cursor detection and 50-page cap.
- Vendor responses may include adjacent business dates; the worker preserves actual `order_date`.
- The inspected payload exposed `created_on` and `order_date`, but no verified source modification/version timestamp. An older vendor snapshot could therefore overwrite a newer stored order through upsert behavior.
- A 23:00 run may precede business closing. The next run's yesterday overlap is intended to reconcile later changes.
- Older changes require explicit bounded repair.
- Advisory locking protects the worker entry points, not unrelated direct library calls or external writers.
- External notification delivery is not configured.

## 13. Monitoring commands

The supplied VPS runbook recommends checking:

```bash
systemctl list-timers --all gulmohar-petpooja-sync.timer
systemctl status gulmohar-petpooja-sync.timer gulmohar-petpooja-sync.service
systemctl show gulmohar-petpooja-sync.service -p Result -p ExecMainStatus
journalctl -u gulmohar-petpooja-sync.service --since today --no-pager
docker ps -a --filter name=gulmohar-petpooja-sync-scheduled
```

Also inspect the worker state/history files using the approved host procedure. Never paste secrets, raw customer data or full POS payloads into logs or chat.
