# Petpooja daily worker operations

The host systemd timer runs at **23:00 Asia/Kolkata**. Each isolated, finite Docker worker requests yesterday first, then today, then a bounded number of unfinished/missed request dates. It uses the existing `PetpoojaGetOrdersClient`, `syncDate()`, resolver and transactional ingestion. No database migration, browser session or queue is required. Production installation/activation must be approved separately.

## Execution and safety

- Both `scripts/petpooja-daily-sync.ts` and the compatible `npm run petpooja:sync` command acquire the same database-wide PostgreSQL advisory transaction lock. A dedicated connection holds it for the whole execution. Competing runs exit 75. Always use these entry points for ingestion; direct library calls and other external writers do not participate in this lock.
- Preflight requires the configured active outlet (`src/config/restaurant.ts`), an exact `PETPOOJA_REST_ID` database mapping, and the expected database host/name. Each fetched record must have that restaurant ID. Existing resolver logic scopes product matching to its organization. This is a machine credential workflow; restrict host/Docker access and use the existing application database role, never a PostgreSQL superuser.
- HTTP 429/5xx, network/timeout errors and selected transient Prisma transaction errors receive capped exponential retries. Authentication, validation, pagination and API business errors are not blindly retried. Database retry repeats the entire existing per-order transaction; committed orders can safely be replayed through existing uniqueness constraints. A connection failure during commit can make created/updated counters approximate; it does not bypass uniqueness.
- A complete date requires `success`, zero failed records/errors, and counts accounting for every fetched order. Partial dates remain pending and return nonzero, even if the underlying orchestrator reports success. Unmapped product lines remain supported and their count is logged. Empty valid responses are logged as `success_empty`, which confirms transport/processing, not independent POS completeness.
- `state.json` is atomically replaced and flushed; `history.jsonl` is appended and flushed before progressing. State is bound to database host/name and outlet UUID. The state directory must be persistent, private, writable by worker UID 1000 and shared by all worker runs for that target. Corrupt/mismatched state fails closed. Errors before history initialization appear in stderr/journal only.
- Logs contain dates, run IDs, stage names and counters, never vendor payloads, credentials, customer data, raw exception messages or order IDs. Keep both state and history; back them up and monitor disk space. Archive history only while no worker runs; retain `state.json`. External alerts and automatic log archival are not included.
- SIGTERM/SIGINT cancel requests and retain unfinished dates; shutdown is forced after 25 seconds. A hard runtime deadline exits 124. Abrupt termination leaves the running marker/pending queue for replay; PostgreSQL rolls back an open order transaction and releases the lock on disconnect. Earlier committed orders remain. Container init forwards signals; the systemd unit also stops/removes its reserved container on failure or timeout.
- No database orders are deleted because they disappear from an API response. Item replacement inside the existing order transaction is preserved. Sales analytics and Orders preview are unchanged.

## Configuration

Keep secrets in an ignored private environment file, never in the image or unit. Existing required keys are `DATABASE_URL`, `PETPOOJA_GET_ORDERS_ENDPOINT`, `PETPOOJA_REST_ID`, `PETPOOJA_APP_KEY`, `PETPOOJA_APP_SECRET`, `PETPOOJA_ACCESS_TOKEN`, `PETPOOJA_API_COOKIE`. Shell/container variables override `.env` for the local CLI.

| Setting | Default | Meaning |
|---|---|---|
| `SYNC_EXPECTED_DB_HOST` | `localhost` | Exact host in `DATABASE_URL`; must be deliberately changed for Docker/VPS |
| `SYNC_EXPECTED_DATABASE` | `gulmohar_dev` | Exact URL and actual connected database name |
| `SYNC_HISTORY_DIR` | User home + target hash | Local durable state directory; Compose forces `/state` |
| `SYNC_MAX_RUN_SECONDS` | 1800 | Whole execution deadline, allowed 60–7200 |
| `SYNC_MAX_BACKFILL_DAYS` | 7 | Maximum age of a requested date and maximum manual range length, allowed 1–3650 |
| `SYNC_RECOVERY_DATES_PER_RUN` | 3 | Additional older dates after the daily pair, allowed 1–31 |
| `SYNC_START_DATE` | unset | First daily cycle to recover on a new state directory; cycle includes its preceding date |
| `SYNC_RETRY_ATTEMPTS` | 3 | Total attempts per API page/per order transaction, allowed 1–5 |
| `SYNC_RETRY_BASE_MS` / `SYNC_RETRY_MAX_MS` | 1000 / 30000 | Exponential backoff starting delay/cap |
| `SYNC_PAGE_TIMEOUT_MS` | 30000 | Whole-page deadline including response body; existing client header timeout also applies |
| `SYNC_IMAGE` | `gulmohar-petpooja-sync:local` | Compose image tag; use an approved versioned tag on VPS |
| `SYNC_DB_NETWORK` | `shared-db-net` | Existing external Docker database network |
| `SYNC_STATE_DIR` | `./tmp/petpooja-sync-state` | Host bind mount; production must use a persistent absolute path |
| `SYNC_ENV_FILE` | `.env.sync` | Compose runtime environment file; use an absolute path on VPS |

Exit statuses: **0** complete; **2** partial/failure or recovery still pending/outside bounds; **75** lock busy; **124** deadline; **130** interruption; **1** configuration, database, history or unexpected runtime failure. Treat every nonzero status as requiring review.

## Local execution

Use Node 22 and existing `npm ci` dependencies. Confirm `.env` points to local `gulmohar_dev` and mapping KOZ-001. `--check` only reads database configuration/mapping and validates credential presence; it does **not** call Petpooja, initialize history or ingest anything.

```sh
node --import tsx scripts/petpooja-daily-sync.ts --check
node --import tsx --test tests/petpooja-daily-sync.test.ts
```

The following commands **write orders/items** through the existing service; run intentionally against the verified target:

```sh
node --import tsx scripts/petpooja-daily-sync.ts --daily
npm run petpooja:sync -- --date=2026-11-25
npm run petpooja:sync -- --from=2026-11-24 --to=2026-11-25
```

The manual command without arguments still requests yesterday in IST. Daily execution without explicit dates uses the daily pair. Range/date validation never permits future or unbounded requests. Choose dates within the configured age limit.

## Docker execution

Create private `.env.sync` from the required keys above. For a local container use `DATABASE_URL` host `gulmohar-postgres`, database `gulmohar_dev`, `SYNC_EXPECTED_DB_HOST=gulmohar-postgres`, `SYNC_EXPECTED_DATABASE=gulmohar_dev`. Find its network with `docker inspect gulmohar-postgres --format '{{json .NetworkSettings.Networks}}'` and set `SYNC_DB_NETWORK` accordingly. Set `SYNC_ENV_FILE` to the absolute path of `.env.sync` when executing from another directory. The worker is non-root; on Linux prepare the bind directory with owner UID/GID 1000 and mode 0700.

```sh
docker compose --env-file .env.sync -f compose.sync.yaml build petpooja-sync
docker compose --env-file .env.sync -f compose.sync.yaml run --rm --no-deps petpooja-sync --check
# Writes orders/items; run only after reviewing the preflight:
docker compose --env-file .env.sync -f compose.sync.yaml run --rm --no-deps petpooja-sync --daily
```

Do not run `compose up` for this finite worker. Reuse the same env file, image and state mount for manual Docker runs. Never use the reserved name `gulmohar-petpooja-sync-scheduled` for a manual container. Container images exclude environment files, raw samples, node_modules, application builds and unrelated repository contents through `Dockerfile.sync.dockerignore`.

## VPS deployment — approval required before performing these steps

1. Verify existing deployment paths, Docker Compose, `shared-db-net`, `shared-postgres`, database `gulmohar_analytics`, role permissions and systemd timezone support on the actual host. The templates assume `/opt/apps/gulmohar-analytics` and `/usr/bin/docker`; adapt paths if the host differs. No VPS changes were performed during implementation.
2. Deploy the approved worker files alongside the existing app without replacing its Dockerfile/Compose deployment. Create root-owned mode-0600 `/opt/apps/gulmohar-analytics/.env.sync` with only worker configuration/credentials. Set `SYNC_EXPECTED_DB_HOST=shared-postgres`, `SYNC_EXPECTED_DATABASE=gulmohar_analytics`, matching `DATABASE_URL`, `SYNC_DB_NETWORK=shared-db-net`, `SYNC_STATE_DIR=/var/lib/gulmohar-petpooja-sync`, `SYNC_ENV_FILE=/opt/apps/gulmohar-analytics/.env.sync` and a versioned `SYNC_IMAGE`. Leave `SYNC_MAX_RUN_SECONDS=1800`; if increasing it, increase the service's 35-minute timeout correspondingly.
3. Create the persistent state directory, build the worker image and run the read-only preflight:

   ```sh
   sudo install -d -o 1000 -g 1000 -m 0700 /var/lib/gulmohar-petpooja-sync
   cd /opt/apps/gulmohar-analytics
   sudo docker compose --env-file .env.sync -f compose.sync.yaml build petpooja-sync
   sudo docker compose --env-file .env.sync -f compose.sync.yaml run --rm --no-deps petpooja-sync --check
   ```

4. Install/verify units. Installing is separate from enabling; review the environment, image and recovery baseline before activation:

   ```sh
   sudo install -m 0644 deploy/systemd/gulmohar-petpooja-sync.service /etc/systemd/system/
   sudo install -m 0644 deploy/systemd/gulmohar-petpooja-sync.timer /etc/systemd/system/
   sudo systemd-analyze verify /etc/systemd/system/gulmohar-petpooja-sync.service /etc/systemd/system/gulmohar-petpooja-sync.timer
   systemd-analyze calendar '*-*-* 23:00:00 Asia/Kolkata'
   sudo systemctl daemon-reload
   # Activation requires approval; Persistent=true may immediately catch a missed tick:
   sudo systemctl enable --now gulmohar-petpooja-sync.timer
   ```

5. Verify the next execution and logs:

   ```sh
   systemctl list-timers --all gulmohar-petpooja-sync.timer
   systemctl status gulmohar-petpooja-sync.timer gulmohar-petpooja-sync.service
   systemctl show gulmohar-petpooja-sync.service -p Result -p ExecMainStatus
   journalctl -u gulmohar-petpooja-sync.service --since today --no-pager
   docker ps -a --filter name=gulmohar-petpooja-sync-scheduled
   sudo tail -n 20 /var/lib/gulmohar-petpooja-sync/history.jsonl
   ```

Do not enable the service independently; enable only its timer. `Persistent=true` triggers one catch-up execution after downtime; the durable cursor supplies the individual missed dates. Review nonzero exits through existing host monitoring; no external notification recipient is configured.

## Recovery and limitations

- After a transient outage, a subsequent daily run processes the daily pair and retries pending older dates. To retry now, `sudo systemctl start gulmohar-petpooja-sync.service` uses the exact same image/state/lock as the timer. This performs ingestion. To stop a run, stop the service; to pause future runs, stop the timer as well.
- Recovery runs at most `SYNC_RECOVERY_DATES_PER_RUN` additional dates per execution. More pending work yields exit 2 until drained. Check `state.json` and final history events. The cursor advances only after all retained work succeeds. An already committed order is upserted again after interruption; its items are replaced transactionally.
- A gap older than `SYNC_MAX_BACKFILL_DAYS` produces `recovery_window_exceeded` and preserves the cursor. Deliberately raise the age bound enough to include `lastCycleDate` and rerun bounded batches. Do not delete/reset state to hide the gap. `SYNC_START_DATE` affects only a new state directory; changing it does not discard existing pending work. First activation without it covers only yesterday/today, not all historical dates.
- For an explicit repair, use the same Docker command with `--date=YYYY-MM-DD` or `--from=... --to=...`. Other outstanding pending dates still yield exit 2 even if the manual dates succeed. Keep host aliases and the mounted state directory consistent. Backup corrupt state and investigate permissions/disk/configuration before recovery; do not silently replace it.
- Cursor pagination still follows the vendor's existing 1000-record/full-page contract, repeated-cursor detection and 50-page safety cap. A pagination failure causes no ingestion for that request date. Vendor responses can include adjacent business dates; the worker preserves each actual `order_date`, including overlaps. Limits bound requested dates; they cannot constrain adjacent dates returned by Petpooja without changing existing ingestion semantics.
- The inspected actual 564-order exported response exposes `created_on` and `order_date`, with no verified source modification/version timestamp. `created_on` cannot prove modification order. No stale-response comparison is invented; an older vendor snapshot can overwrite a newer saved order through existing upsert behavior. Request serialization prevents competing worker snapshots, but vendor version guarantees remain a dependency. No source timestamp column or schema change is introduced.
- 23:00 may precede business closing. The following run's yesterday reconciliation captures later changes while the source still returns them. Changes older than the daily overlap require explicit bounded repair; existing historical completeness/rollover discrepancies are not automatically resolved.
- The advisory lock depends on a healthy database connection; monitor connection failures. Existing direct library/webhook or external writers are outside the worker entry-point lock. This implementation does not add locking to unrelated modules.
