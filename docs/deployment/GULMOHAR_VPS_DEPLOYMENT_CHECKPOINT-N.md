# Gulmohar Analytics — VPS Deployment & Infrastructure Checkpoint

**Checkpoint date:** 27 November 2026  
**Purpose:** This is the handover document for future AI-assisted Gulmohar releases. Upload this file at the start of a deployment conversation. It records the known VPS architecture, services, versions, database baseline, deployment history, safety rules, and repeatable release procedure.

**Primary rule:** Treat this document as the established infrastructure baseline. Do not make the user repeat details already recorded here or perform a broad VPS rediscovery audit for an ordinary application release. Only perform the small live checks needed to protect the current release (Git target/commit, running app and DB readiness, fresh backup, and whether migrations are pending). If a recorded fact may have changed, verify only that fact.

**Scope:** Gulmohar Analytics application and its database. EduToofan and shared infrastructure are mentioned only to prevent accidental changes. Do not deploy or modify them during a normal Gulmohar application release.

---

## 1. AI handover instructions — read this first

When this document is uploaded:

1. Read the complete document before asking infrastructure questions.
2. Assume the recorded architecture and configuration are the known baseline. Do not ask the user to rediscover paths, container names, database name, network, ports, or versions already documented.
3. Work one checkpoint at a time. Give the user one command, wait for its output, then continue.
4. Do not run broad audits unless a specific deployment failure or changed requirement makes one necessary.
5. For a normal release, the task is to deploy the approved current Git version to the existing Gulmohar application service. Do not redesign infrastructure or upgrade services.
6. Review incoming code and migration files. Apply only committed migrations that are actually pending. If no migration is pending, do not run a schema-changing command.
7. Never use `prisma db push`, database reset, schema sync from local to production, or ad-hoc SQL as a deployment shortcut.
8. Never upgrade Docker, Docker Compose, Ubuntu, PostgreSQL, Node, Nginx, Next.js, Prisma, or any other service/package merely because a newer version exists. A version upgrade requires a separate explicit request and compatibility plan.
9. Never print, request, paste, or commit secret values. Do not expose `.env`, database passwords, Petpooja credentials, tokens, cookies, SSH private keys, or passphrases.
10. Obtain explicit approval before every production-changing stage: pulling source onto the VPS, applying migrations, recreating the app container, restoring a database, deleting files/backups, changing services, or enabling a timer.
11. Do not use `git reset --hard`, `git clean -fd`, `docker compose down`, `docker compose down -v`, or `--remove-orphans` as routine deployment commands.
12. If a command behaves differently from this runbook, stop and explain. Do not improvise a destructive alternative.
13. After deployment, record the actual commit, image ID, backup file, migration result, versions used, and smoke-test result in the release history section at the end of this document.

### What “no need to check everything” means

The infrastructure inventory below is the baseline; it does not need to be rediscovered for each release. However, no document can guarantee that a live server has not changed since the last checkpoint. The minimum release gates remain necessary:

- Confirm the target repository/branch and exact incoming commit.
- Confirm the existing app and database are healthy enough to deploy.
- Create and verify a fresh database backup before any production migration/release.
- Determine whether the incoming release contains pending migrations.
- Verify the deployed app after rollout.

Do not repeat the full OS/Docker/Nginx/storage/systemd audit unless one of these facts becomes relevant or an observed failure requires it.

---

## 2. Production identity and topology

| Item | Recorded value |
|---|---|
| VPS hostname | `srv2135500` |
| SSH user | `dhanil` |
| Public IPv4 | `189.72.146.40` |
| OS | Ubuntu 24.04.5 LTS (`noble`) |
| Kernel at audit | `6.8.0-149-generic` |
| Host timezone | `Etc/UTC` |
| NTP | Active and synchronized at audit |
| Application repository | `/opt/apps/gulmohar-analytics` |
| Production Git branch | `main` |
| Git remote | `git@github-gulmohar:dhanilkumart/gulmohar-analytics.git` |
| Public URL | `https://gulmohar.macific.com` |
| Reverse proxy | Nginx 1.24.0 (Ubuntu) |
| App container | `gulmohar-analytics` |
| App host binding | `127.0.0.1:8100` → container port `8100` |
| PostgreSQL container | `shared-postgres` |
| Production database | `gulmohar_analytics` |
| Application DB role | `gulmohar_app` |
| DB Docker network | `shared-db-net` |
| PostgreSQL host port | No public/host port mapping observed; internal container port 5432 |
| PostgreSQL persistent volume | `postgres_data` |
| PostgreSQL container data path | `/var/lib/postgresql` |
| App Compose file | `/opt/apps/gulmohar-analytics/compose.prod.yaml` |
| PostgreSQL Compose file | `/opt/infrastructure/postgres/compose.yaml` |
| Backup directory | `/home/dhanil/backups/gulmohar/` |

### Request path

```text
Browser
  |
  | HTTPS
  v
Nginx (host, public ingress)
  |
  | HTTP to 127.0.0.1:8100
  v
gulmohar-analytics container
  |
  | Docker network: shared-db-net
  v
shared-postgres:5432
  |
  v
Database: gulmohar_analytics
```

The exact Nginx upstream configuration and TLS renewal mechanism were not captured. Do not change Nginx/TLS as part of an ordinary application release.

### SSH

The user connects from Windows using their existing passphrase-protected ED25519 key. Do not ask them to share the key or passphrase. Example PowerShell command (key remains on the user's machine):

```powershell
ssh -o IdentitiesOnly=yes -i "$env:USERPROFILE\.ssh\hostinger_vps_ed25519" dhanil@189.72.146.40
```

---

## 3. VPS capacity and operating environment

Last audited snapshot:

| Resource | Recorded value |
|---|---:|
| CPU | 2 cores |
| RAM | 7.8 GiB total |
| RAM available at inspection | 6.4 GiB |
| Swap | 2 GiB total; 512 MiB used |
| Root filesystem | 96 GiB total; 77 GiB available (20% used) |
| `/boot` | 881 MiB; 15% used |
| `/boot/efi` | 105 MiB; 6% used |
| Uptime at audit | About 16 days 12 hours |
| Load average at audit | `0.00, 0.00, 0.00` |

These are historical measurements, not live guarantees. Do not run a resource audit on every release unless a build/runtime issue suggests capacity pressure.

---

## 4. Installed services, containers and versions

### Host services / runtime

| Component | Last verified value | Notes |
|---|---|---|
| Ubuntu | `24.04.5 LTS` | Do not upgrade during app release |
| Kernel | `6.8.0-149-generic` | Historical audit value |
| Docker Engine | `29.9.3`, build `5457199` | Docker service enabled and active |
| Docker Compose | `v5.7.0` | Compose plugin |
| Nginx | `1.24.0` (Ubuntu) | Reverse proxy; exact config not captured |
| Host Node/npm | Node/npm not installed / `npx` unavailable on host at audit | Do not install Node on host just to deploy |
| Host timezone | UTC | Do not change to India time for app deployment |

### Running Docker containers at last infrastructure audit

| Container | Image | Role | Binding / network |
|---|---|---|---|
| `gulmohar-analytics` | `gulmohar-analytics-gulmohar-analytics` | Gulmohar Next.js application | `127.0.0.1:8100:8100`; connected to `shared-db-net` |
| `shared-postgres` | `postgres:18` | Shared PostgreSQL server | Internal port 5432; connected to `shared-db-net` |
| `edutoofan` | `edutoofan-edutoofan` | Separate Django application | `127.0.0.1:8000:8000`; out of scope |

A stopped `hello-world` test container was also observed. Do not clean up unrelated containers during a Gulmohar release.

### Application and database versions

| Component | Last known value | Deployment rule |
|---|---|---|
| Node.js in running Gulmohar container | `v22.23.5` | Keep runtime on the reviewed Node 22 line |
| Docker build base | `node:22-alpine` | Moving tag; record actual image ID/digest on each release; do not change base casually |
| Next.js | `16.3.4` observed in earlier running build | Do not upgrade unless code/lockfile intentionally changes |
| Prisma CLI | `6.19.3` pinned/resolved in `package-lock.json` | Use locked version only |
| `@prisma/client` | `6.19.3` pinned in repository | Keep CLI/client aligned |
| PostgreSQL image | `postgres:18` | Do not upgrade/recreate for an app-only release |
| PostgreSQL server | `18.6` reported by backup metadata; verify only if needed | Do not upgrade during app release |

**Prisma warning:** A prior `npx prisma --version` attempt inside the running app container tried to fetch `prisma@8.0.0-rc.36` because the CLI was not available there. Do not accept that download. The host has no `npx`. The repository lockfile pins Prisma `6.19.3`. Before running a migration, confirm that the chosen one-off migration execution environment actually has the lockfile-matched Prisma CLI. If not, stop and prepare a controlled migration execution method; never let `npx` silently fetch an unpinned version.

---

## 5. Docker and application configuration

### Production application Compose

File: `/opt/apps/gulmohar-analytics/compose.prod.yaml`

```yaml
services:
  gulmohar-analytics:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gulmohar-analytics
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:8100:8100"
    networks:
      - default
      - shared-db-net

networks:
  shared-db-net:
    external: true
    name: shared-db-net
```

The app `.env` file exists at `/opt/apps/gulmohar-analytics/.env`. Its values must never be displayed or included in this document. Compose validation previously succeeded:

```bash
sudo docker compose -f compose.prod.yaml config --quiet
```

### Production Dockerfile

File: `/opt/apps/gulmohar-analytics/Dockerfile`

The recorded build uses:

- `node:22-alpine`
- `npm ci` using `package-lock.json`
- `npx prisma generate`
- `npm run build`
- Next.js standalone output
- Runtime command `node server.js`
- App port 8100

The committed `next.config.ts` must retain:

```ts
output: "standalone"
```

### VPS-only files — preserve

These files were untracked by Git and are part of the VPS deployment configuration:

- `.dockerignore`
- `Dockerfile`
- `compose.prod.yaml`

`next.config.ts` is tracked in Git and the current committed version contains `output: "standalone"`.

Never overwrite or delete the three untracked files. Back them up before pulling. Never run `git clean -fd`.

### Docker permissions

- Docker socket: `/var/run/docker.sock`, owner `root:docker`, mode `660`.
- User `dhanil` is not in the `docker` group.
- Use `sudo docker` on the VPS.
- Do not add `dhanil` to the Docker group or weaken socket permissions as a deployment convenience; Docker access is effectively root-level access.

---

## 6. PostgreSQL architecture and protection

| Item | Recorded value |
|---|---|
| Container | `shared-postgres` |
| Image | `postgres:18` |
| Database | `gulmohar_analytics` |
| App role | `gulmohar_app` |
| Internal port | `5432` |
| Network | `shared-db-net` |
| Persistent volume | `postgres_data` |
| Container data directory | `/var/lib/postgresql` |
| Host volume path observed | `/var/lib/docker/volumes/postgres_data/_data` |
| Admin secret mount | `/opt/infrastructure/postgres/.secrets/postgres_admin_password` → `/run/secrets/postgres_admin_password` (read-only) |

The PostgreSQL admin password is mounted as a Docker secret. Never read or expose its contents. The app should use its configured app role, not the PostgreSQL superuser.

### Critical database rules

- Never run `prisma db push` against production.
- Never copy the local database over production.
- Never run `prisma migrate reset`.
- Never drop/recreate the production database or schema.
- Never restart/recreate `shared-postgres` for a normal app-only release.
- Never run `docker compose down -v`.
- Use committed Prisma migration SQL with the repository-pinned Prisma version.
- Review every pending migration before applying it.
- Take and verify a fresh backup before migrations or any release with data/schema risk.
- A migration that drops columns/tables may permanently remove production data. Explain the exact impact and obtain approval.

---

## 7. Database synchronization checkpoint — verified 27 November 2026

A read-only comparison was completed between the local PostgreSQL database and VPS PostgreSQL database. No database writes, migrations, restores, or schema changes were performed during this verification.

### 7.1 Local Prisma schema vs local database

- `npx prisma db pull --print` produced a separate file `local-db-schema-introspected.prisma`; the committed schema was not overwritten by this command.
- The introspection emitted warnings that mapping information (`@map`, `@@map`) and enum mapping information were enriched from the previous Prisma schema. These warnings were not evidence of schema drift.
- Comparison against `git show HEAD:prisma/schema.prisma` found the same 22 application models and 2 enums, with matching fields, types, defaults, nullability, mappings, indexes/unique constraints and relationships.
- A representational difference was observed for `LoginAttempt.identifier`: `@@unique([identifier])` versus field-level `@unique`; these are equivalent uniqueness representations.
- Prisma omitted some explicit default referential actions in the printed introspection. The actual PostgreSQL FK query was used to verify the database rules.

### 7.2 Local vs VPS structure

| Check | Local | VPS | Result |
|---|---:|---:|---|
| Application Prisma models | 22 | Structure inspected | Aligned with committed model structure |
| Enums | 2 | Structure inspected | Aligned |
| Column records from `information_schema.columns` (includes `_prisma_migrations`) | 205 | 205 | Exact match in names, types, nullability and defaults |
| Foreign-key relationships | 35 | 35 | Exact match, including delete rules |
| Migration records | 7 | 7 | Names and checksums match |

The 205-column reports included the `_prisma_migrations` metadata table. The application schema itself has 22 models; the additional table in the public column inventory is Prisma migration metadata.

### 7.3 Foreign-key rules

All 35 foreign-key relationships and `delete_rule` values matched exactly between local and VPS. Rules observed include:

- `CASCADE` for user sessions and user outlet assignments to their parents, recipe items to products, outlet product settings to products, and sales order items to sales orders.
- `SET NULL` for sales order items to products and preparation/wastage department relationships.
- `RESTRICT` for the remaining required relationships.

### 7.4 Migration history

Both local and VPS databases have the following seven completed migrations. Every checksum matches exactly; all have `applied_steps_count = 1`, `finished_at` populated, and `rolled_back_at` empty.

| Migration | Checksum |
|---|---|
| `20261111173938_init_multi_outlet_schema` | `082c2dbc4e6a3b652b1bb092830780218e4fe177d630d5a3d55f8bb4f9def50c` |
| `20261113000000_add_sessions_and_login_attempts` | `be74c2b2acb476c6f320effe69fe058e6a8688931b1e3ac24fcb3ab8a382997c` |
| `20261113132452_make_breakage_cost_nullable` | `f1cb3ad190df50f6ad041005daa195b936849df91bcb2e0c22990efa632c1ffa` |
| `20261114074821_add_is_active_to_department_and_ingredient` | `cfda291cae2207bffc2e79b75dd27092e4be98fa84817899935812fcc02a9bd6` |
| `20261115070600_add_status_and_unique_to_sales_orders` | `2c89fe8843c80897578acc180da8ce3725fc4e517899f60cd6ca7c5378996c7d` |
| `20261121021129_add_preparation_items_and_logs` | `e9dfa9117bf2b911d59767a9331561bfe43bbd07069baced0f1bb816b8d401b2` |
| `20261121024835_add_master_data_breakage_and_reasons` | `2e1428a1367289eae92b6f591411e38f28f393df1b68e5ce509c8bf6f63b9eca` |

The `finished_at` timestamps differ because migrations were applied at different times. This is expected; names and checksums match.

### 7.5 Scope and limitation of this verification

The user explicitly chose not to compare business data/row counts. Therefore:

- Database schema and migration history are verified as aligned at this checkpoint.
- Business table contents were **not** compared.
- This verification does not prove that local and VPS records are identical.
- It does not prove that no direct SQL or `db push` command was ever run historically. It establishes the current inspected structure and migration metadata only.

For normal future deployments, do not repeat the full 205-column/35-FK comparison unless there is a schema drift concern or a migration failure. Use the migration status and reviewed SQL as the release-time gate.

---

## 8. Git state and deployment configuration history

### Last synchronized source checkpoint

On 27 November 2026:

- VPS repository: `/opt/apps/gulmohar-analytics`
- Branch: `main`
- Latest synchronized commit: `b72ca8e` — `Configure Next.js standalone output for Docker`
- VPS `main` was reported up to date with `origin/main` at that checkpoint.
- Fast-forward pull from `c949b65` to `b72ca8e` completed successfully.
- Three untracked VPS-specific files remained and were preserved: `.dockerignore`, `Dockerfile`, `compose.prod.yaml`.
- `next.config.ts` was committed with `output: "standalone"`.
- `sudo docker compose -f compose.prod.yaml config --quiet` succeeded.

**Important:** This is the last recorded Git synchronization, not a guarantee that it is still the latest remote commit. Fetch before a future release.

### Known deployment/release history

The available audit notes do not establish a complete count of how many production application deployments have ever occurred. Do not invent a deployment count.

Recorded events:

| Date | Event | Verified outcome |
|---|---|---|
| Before 23 Nov 2026 | Gulmohar application already hosted and responding through Nginx | Existing app container and public domain response observed |
| 23 Nov 2026 | Database backup created | Custom-format backup files recorded; one pre-deploy archive later passed `pg_restore --list` |
| 27 Nov 2026 | Git synchronization | Fast-forward from `c949b65` to `b72ca8e` succeeded |
| 27 Nov 2026 | Compose configuration validation | `config --quiet` succeeded |
| 27 Nov 2026 | Database structure comparison | Local and VPS columns/FKs matched |
| 27 Nov 2026 | Migration history comparison | All 7 migration names/checksums matched |
| 27 Nov 2026 | App image rebuild/rollout | Not established as completed by this checkpoint |
| 27 Nov 2026 | Petpooja worker deployment | Not deployed; no timer activation |

Do not label the Git synchronization as an application deployment. A pull updates source; a Docker build and app container rollout are separate events.

---

## 9. Backup and recovery

### Backup location and historical files

Directory: `/home/dhanil/backups/gulmohar/`

Previously observed files:

- `gulmohar_analytics_20261123_182931.dump` (about 50 KB)
- `gulmohar_analytics_predeploy_20261123_191221.dump` (about 50 KB)
- `deploy-config-20261123_191424/`

The pre-deployment dump was successfully inspected using `pg_restore --list` on 27 November 2026:

```bash
sudo docker exec -i shared-postgres pg_restore --list < /home/dhanil/backups/gulmohar/gulmohar_analytics_predeploy_20261123_191221.dump
```

Archive metadata: database `gulmohar_analytics`, custom format, gzip compression, 122 TOC entries, dump version `1.16-0`, dumped from/by PostgreSQL `18.6`.

**This verifies that the archive can be read and its table of contents listed. It is not a full restore test.** Do not claim the backup has been restore-tested. The backup directory is on the host and is not mounted inside the PostgreSQL container; use stdin redirection as shown.

### Fresh pre-deployment backup procedure

Before any production migration or release that could affect data, create a fresh timestamped backup and verify it:

```bash
set -o pipefail
BACKUP_DIR="/home/dhanil/backups/gulmohar"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/gulmohar_analytics_${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
sudo docker exec shared-postgres \
  pg_dump -U gulmohar_app -d gulmohar_analytics -Fc \
  > "$BACKUP_FILE"

test -s "$BACKUP_FILE" || { echo "Backup missing/empty: STOP"; exit 1; }
file "$BACKUP_FILE"
sudo docker exec -i shared-postgres pg_restore --list < "$BACKUP_FILE" \
  > "${BACKUP_FILE}.toc.txt"
test -s "${BACKUP_FILE}.toc.txt" || { echo "Archive listing failed: STOP"; exit 1; }
echo "Verified backup: $BACKUP_FILE"
```

If backup creation or listing fails, stop. Do not deploy migrations. Do not delete older backups without an agreed retention policy. Do not restore over the live database as a test.

### Rollback rules

- App rollback and database rollback are different operations.
- A previous app image may not work with a newer database schema.
- Prisma does not automatically reverse applied migrations.
- Do not automatically restore the database when an app container fails.
- First inspect app logs and determine whether the previous image is available and compatible.
- Database restore requires a separately approved recovery plan, confirmed target, downtime plan, and verified backup.
- Never improvise a live database restore.

---

## 10. Standard application-only deployment runbook

Use this sequence for a normal release of the current approved `main` version. Do one stage at a time and wait for the output before proceeding.

### Stage 0 — Confirm release scope

Confirm:

- Target is `/opt/apps/gulmohar-analytics`.
- Target service is `gulmohar-analytics`.
- Branch is `main`.
- This is an application-only release.
- PostgreSQL and EduToofan are out of scope.
- User has approved production deployment.

If the user only asks to prepare or inspect, do not deploy.

### Stage 1 — Minimal live preflight

```bash
cd /opt/apps/gulmohar-analytics
git status --short --branch
git branch --show-current
git fetch origin
git log --oneline HEAD..origin/main
sudo docker ps --filter "name=gulmohar-analytics"
sudo docker ps --filter "name=shared-postgres"
sudo docker exec shared-postgres pg_isready -U gulmohar_app -d gulmohar_analytics
sudo docker network inspect shared-db-net --format '{{.Name}}'
curl -sS -I --max-time 10 http://127.0.0.1:8100
curl -sS -I --max-time 15 https://gulmohar.macific.com
```

Do not re-run the entire server inventory. If app/DB is already unhealthy, stop and diagnose the pre-existing issue before deploying.

### Stage 2 — Review incoming source and migrations

Review:

```bash
git diff --stat HEAD..origin/main
git diff --name-status HEAD..origin/main
git log --oneline HEAD..origin/main
```

Inspect at least:

- `package.json` and `package-lock.json`
- `prisma/schema.prisma`
- all added/changed `prisma/migrations/**/migration.sql`
- Docker and Compose files
- environment variable names/references (never values)
- any data backfill or one-off scripts
- changes to runtime/build configuration

Classify the release:

**A. No database migration changes:** proceed with application build and rollout after backup and other release gates. Do not run `db push` or create a migration.

**B. New committed migration(s):** inspect each SQL file. Identify destructive operations, dropped columns/tables, type changes, new NOT NULL columns, defaults, data backfills, index creation, and lock/downtime risk. Explain the data impact and get approval before applying.

**C. Schema changed but no committed migration exists:** stop. Do not use `db push` to compensate. Ask the developer to create/review a proper migration in development and commit it.

### Stage 3 — Fresh database backup

Follow Section 9. Record the exact backup filename and successful `pg_restore --list` result. Do not continue if backup verification fails.

### Stage 4 — Preserve VPS deployment files

Before pulling, back up VPS-only files outside the repository:

```bash
STAMP="$(date -u +%Y%m%d_%H%M%S)"
SAFE_DIR="/home/dhanil/backups/gulmohar/deploy-config-${STAMP}"
mkdir -p "$SAFE_DIR"
cp -a Dockerfile .dockerignore compose.prod.yaml next.config.ts "$SAFE_DIR"/
ls -lah "$SAFE_DIR"
grep -n 'output: "standalone"' next.config.ts
sudo docker compose -f compose.prod.yaml config --quiet
```

Expected: all four files copied, standalone output present, Compose validation exit code 0. Do not print full Compose environment interpolation or `.env`.

### Stage 5 — Pull approved source

Only after the user approves the source update:

```bash
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
git log -1 --oneline
test -f Dockerfile && test -f .dockerignore && test -f compose.prod.yaml
grep -n 'output: "standalone"' next.config.ts
```

If pull refuses, stop and reconcile. Do not reset or clean. Confirm the untracked deployment files remain present.

### Stage 6 — Build the application image

```bash
sudo docker compose -f compose.prod.yaml build gulmohar-analytics
```

If build fails, stop. Do not replace the running app. After a successful build, record the actual image ID:

```bash
sudo docker image inspect gulmohar-analytics-gulmohar-analytics:latest --format 'image_id={{.Id}} created={{.Created}}'
```

If the generated image tag differs, inspect the Compose service configuration and use the actual image tag. Do not assume a tag that has not been verified.

Do not change Node base image, install new host packages, or upgrade framework/dependency versions unless that is part of the reviewed application change.

### Stage 7 — Migration status and apply only if needed

If there are no new migration files, record “No new migrations in this release” and skip migration application.

If migration files are present, verify the migration runner uses Prisma `6.19.3` from the repository lockfile. The running app image previously did not expose Prisma CLI and bare `npx` attempted to fetch Prisma 8 RC. Therefore, do not blindly run a command that could download a new version.

The existing runbook's intended one-off status command is:

```bash
sudo docker compose -f compose.prod.yaml run --rm --no-deps --entrypoint npx gulmohar-analytics prisma migrate status
```

Use it only after confirming that the one-off image actually contains the locked Prisma CLI and that `npx` will not fetch anything. If the CLI is absent or a download is proposed, stop and prepare a controlled migration runner from the locked project dependencies; do not accept the download.

Before applying, verify:
- The pending migration names are exactly those reviewed.
- Fresh backup from Stage 3 is available.
- Destructive/data-loss impact has been explained.
- User explicitly approved the production migration.

The intended apply command in the existing Compose runbook is:

```bash
sudo docker compose -f compose.prod.yaml run --rm --no-deps --entrypoint npx gulmohar-analytics prisma migrate deploy
```

Again, only use this if the runner is confirmed to use the pinned Prisma CLI. If not, stop. After success, verify migration status again. Never use `prisma db push`.

### Stage 8 — Recreate only the application service

Only after all previous stages pass and rollout is approved:

```bash
sudo docker compose -f compose.prod.yaml up -d --no-deps gulmohar-analytics
```

Do not run `docker compose down`, `down -v`, or `--remove-orphans`. Do not restart/recreate `shared-postgres` or `edutoofan`.

### Stage 9 — Post-deployment checks

```bash
sudo docker ps --filter "name=gulmohar-analytics"
sudo docker logs --tail 100 gulmohar-analytics
sudo docker exec gulmohar-analytics node --version
sudo docker exec shared-postgres pg_isready -U gulmohar_app -d gulmohar_analytics
curl -sS -I --max-time 10 http://127.0.0.1:8100
curl -sS -I --max-time 15 https://gulmohar.macific.com
```

A `307` redirect to `/login` is an expected unauthenticated response if the app's auth behavior has not changed. Also test login and the workflows changed in the release in a browser.

If checks fail, stop and diagnose. Do not automatically restore the database or restart unrelated services.

### Stage 10 — Record release checkpoint

Record:

- UTC date/time
- Previous and new Git commit
- Previous and new app image IDs
- Backup filename and archive-listing result
- Whether migrations were present
- Migration names applied, or “none”
- Actual Node/Next/Prisma versions used
- App container rollout result
- Local/public HTTP results
- Login and changed workflow smoke-test results
- Warnings or follow-up items

Append an entry to Section 15.

---

## 11. Services and infrastructure explicitly out of scope

### EduToofan

- Separate container: `edutoofan`
- Host binding observed: `127.0.0.1:8000`
- Separate Django application.
- Do not stop, restart, rebuild, redeploy, or alter its files/DB during Gulmohar deployment.

### Shared PostgreSQL

- Container: `shared-postgres`
- Image: `postgres:18`
- Shared infrastructure for apps.
- Do not upgrade, recreate, restart, change volume, or alter PostgreSQL config during a normal Gulmohar app-only release.

### Petpooja daily sync worker

The local repository contains a prepared worker implementation, but production deployment was **not completed** at this checkpoint.

Local worker-related files include:

- `scripts/petpooja-daily-sync.ts`
- `src/lib/petpooja/daily-sync.ts`
- `src/lib/petpooja/sync-lock.ts`
- `src/lib/petpooja/sync-retry.ts`
- `Dockerfile.sync`
- `Dockerfile.sync.dockerignore`
- `compose.sync.yaml`
- `deploy/systemd/gulmohar-petpooja-sync.service`
- `deploy/systemd/gulmohar-petpooja-sync.timer`
- `docs/petpooja-worker.md`
- `docs/petpooja-synchronization.md`

The design is a finite Docker worker triggered by a systemd timer daily at 23:00 `Asia/Kolkata`; host timezone remains UTC. It is intended to reuse the existing Petpooja ingestion logic and database, without a new schema or queue.

At this checkpoint:
- No worker production deployment is confirmed.
- `.env.sync` and worker state directory are not confirmed created.
- systemd service/timer are not confirmed installed or enabled.
- No initial live Petpooja ingestion is confirmed.
- Do not deploy or enable this worker as part of an ordinary application release.
- Treat worker setup as a separate approved deployment task.

### Systemd / cron

The VPS audit observed 13 standard systemd timers (e.g. apt, certbot, logrotate, sysstat). No Petpooja timer was present at the audit. No `dhanil` or root crontab entries were found at that time. Do not alter unrelated timers or cron jobs.

---

## 12. Prohibited actions and upgrade policy

Unless separately requested, reviewed, and approved, do **not**:

- Upgrade Ubuntu, kernel, Docker Engine, Docker Compose, Nginx, PostgreSQL, Node, Next.js, Prisma, or any system service.
- Change the host timezone.
- Change firewall, reverse proxy, TLS, public ports, or DNS.
- Expose PostgreSQL publicly.
- Add the SSH user to the Docker group.
- Change Docker socket permissions.
- Recreate or restart shared PostgreSQL.
- Touch EduToofan.
- Run `prisma db push`, `migrate reset`, destructive ad-hoc SQL, or database copy/restore.
- Run `docker compose down -v`.
- Run `git reset --hard` or `git clean -fd`.
- Delete old backups or images as routine cleanup.
- Enable Petpooja timer or run live ingestion.
- Print secrets or full `.env` contents.

An application dependency upgrade is also a code change, not a server maintenance side effect. It must be present in the reviewed commit/lockfile and tested before release.

---

## 13. Known unknowns / do not invent

These items were not fully established in the audit. Do not invent answers:

- Exact Nginx upstream/TLS configuration and certificate renewal mechanism.
- Full restore test of the PostgreSQL backup.
- Backup retention policy.
- Complete count of historical production app deployments.
- Exact date/commit/image for the original first deployment.
- Whether the current app container has already been rebuilt after the 27 Nov Git synchronization.
- Whether the Petpooja worker has since been deployed (last verified status: not deployed).
- Whether business data in local and VPS is identical (user chose not to compare it).
- Current remote HEAD, current app image ID, current backup inventory, and current service health at the time of any future deployment.

If any of these facts becomes relevant, ask for the narrowest read-only check needed.

---

## 14. Quick deployment checklist

- [ ] Read this checkpoint; confirm target is Gulmohar application only.
- [ ] Confirm user approved deployment.
- [ ] Check `main`, remote, incoming commits and working-tree state.
- [ ] Review dependency/lockfile changes and all migration SQL.
- [ ] Confirm app/DB readiness and `shared-db-net`.
- [ ] Create fresh PostgreSQL custom-format backup and verify `pg_restore --list`.
- [ ] Back up `Dockerfile`, `.dockerignore`, `compose.prod.yaml`, `next.config.ts`.
- [ ] Pull with `git pull --ff-only origin main`.
- [ ] Confirm `output: "standalone"` remains present.
- [ ] Build app image successfully.
- [ ] If migrations exist, verify pinned Prisma CLI, review pending migrations and obtain approval.
- [ ] Apply only approved committed migrations; otherwise skip.
- [ ] Recreate only `gulmohar-analytics`.
- [ ] Check logs, DB readiness, local endpoint and public endpoint.
- [ ] Test login and changed workflows.
- [ ] Record the release in Section 15.

---

## 15. Deployment and verification history

### 15.1 Known history

The complete count of production deployments is unknown from available records. The following are verified events, not a claim that each event was a full application deployment.

| Date | Event | Result |
|---|---|---|
| Before 23 Nov 2026 | Existing Gulmohar service observed running behind Nginx | Public domain responded; unauthenticated request redirected to `/login` |
| 23 Nov 2026 | PostgreSQL backup files created | Custom-format dumps present in backup directory |
| 27 Nov 2026 | VPS Git fast-forward | `c949b65` → `b72ca8e` completed |
| 27 Nov 2026 | Production Compose config validation | `config --quiet` succeeded |
| 27 Nov 2026 | Backup archive inspection | `gulmohar_analytics_predeploy_20261123_191221.dump` TOC successfully listed; full restore not tested |
| 27 Nov 2026 | Local DB vs committed Prisma schema | 22 models and 2 enums aligned |
| 27 Nov 2026 | Local vs VPS DB columns | 205 column records matched |
| 27 Nov 2026 | Local vs VPS foreign keys | 35 relationships and delete rules matched |
| 27 Nov 2026 | Local vs VPS migration history | 7 migration names and checksums matched |
| 27 Nov 2026 | Business data comparison | Not performed by user choice |
| 27 Nov 2026 | Application rebuild/rollout after Git sync | Not confirmed by available evidence |
| 27 Nov 2026 | Petpooja worker deployment | Not deployed/activated at last verification |

### 15.2 Append future release entries here

For each actual production release, append one row and a short detail block:

| Date/time UTC | Previous commit | New commit | Image ID | Backup file | Migrations | Result |
|---|---|---|---|---|---|---|
| _Future entry_ | | | | | | |

Release details:
- Scope:
- Approval:
- Build result:
- Migration status/result:
- Container rollout:
- Local HTTP:
- Public HTTPS:
- Login/business smoke tests:
- Warnings/follow-up:
- Rollback needed?:

---

## 16. Checkpoint update log

| Date | Update |
|---|---|
| 27 Nov 2026 | Consolidated VPS identity, topology, resource snapshot, services, versions, Docker/Compose configuration, PostgreSQL architecture, backup method, Git state, deployment procedure and AI handover rules. |
| 27 Nov 2026 | Added read-only local/VPS database comparison: 205 column records match; 35 foreign keys and delete rules match; seven migration names/checksums match. Business data intentionally not compared. |
| 27 Nov 2026 | Clarified that Git fast-forward is not the same as an app deployment; complete historical deployment count is not known. |






## Latest Petpooja Worker VPS Verification — 27 November 2026

### Read-only checks performed

The following checks were performed from `/opt/apps/gulmohar-analytics`.

| Item | Observed result |
|---|---|
| Current Git branch | `main` |
| Current Git commit | `b72ca8e` |
| Remote tracking status | `HEAD` matches `origin/main` |
| Worker Docker image | `gulmohar-petpooja-sync:latest` exists |
| Worker image ID | `sha256:43a246bfce2cf5f76e1c071758b53edf72a1781911a71cfa9b3931326f81fab7` |
| Worker image creation time | `2026-11-23 19:20:50 UTC` |
| Worker image size | Approximately 2.45 GB |
| Worker Docker Compose services | No service names returned by `docker compose ... config --services`; configuration requires further inspection |
| Worker files | `Dockerfile.sync` and `compose.sync.yaml` exist; both showed modification date 27 November 2026 |
| Worker environment file | `.env.sync` missing |
| Petpooja systemd timer/service | Not installed |

### Git working tree observation

The following untracked files were present:

- `.dockerignore`
- `Dockerfile`
- `compose.prod.yaml`

These files were not modified or deleted during the checks. Their purpose and deployment relationship must be preserved and verified before any cleanup.

### Findings and limitations

- The existing Petpooja worker Docker image predates the observed worker configuration file modification dates.
- Image creation time alone does not establish whether the image contains the latest worker implementation.
- The empty Compose service listing does not establish that the worker Compose configuration is valid.
- Worker image, Compose configuration and deployed source compatibility remain unverified.

### Pending verification

- Inspect `compose.sync.yaml` and identify why no service names were returned.
- Compare the worker Compose configuration and Dockerfile against the current deployed repository code.
- Confirm whether the existing worker image needs rebuilding.
- Do not run ingestion or activate the systemd timer until configuration and preflight checks pass.
