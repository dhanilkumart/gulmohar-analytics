# Gulmohar Analytics — VPS Infrastructure & Deployment Runbook

**Purpose:** Self-contained reference for future Gulmohar Analytics VPS deployments.  
**Audit date:** 23 November 2026.  
**Scope:** Gulmohar Analytics only. Do not mix other applications' infrastructure or backups into this document.

> Values below are based on terminal output reviewed during the audit. Anything marked VERIFY must be checked again because server state can change. Never expose secrets from `.env`.

## 1. Production environment

| Item | Verified value |
|---|---|
| VPS user / host | `dhanil@srv2135500` |
| Project path | `/opt/apps/gulmohar-analytics` |
| Domain | `https://gulmohar.macific.com` |
| Git branch | `main` |
| Git remote | `git@github-gulmohar:dhanilkumart/gulmohar-analytics.git` |
| App container | `gulmohar-analytics` |
| App port | `127.0.0.1:8100` on host → `8100` in container |
| Reverse proxy | Nginx 1.24.0 (Ubuntu) |
| Database container | `shared-postgres` |
| Database | `gulmohar_analytics` |
| Database role | `gulmohar_app` |
| DB Docker network | `shared-db-net` |

Request path:

```text
Browser --HTTPS--> Nginx --HTTP localhost:8100--> gulmohar-analytics
                                                |
                                                +-- shared-db-net --> shared-postgres
                                                                        |
                                                                        +-- gulmohar_analytics
```

Nginx returned a response for the public domain. The exact Nginx upstream configuration and TLS renewal mechanism were not captured; VERIFY before changing proxy/TLS settings.

## 2. Audit snapshot

- The app container was `Up 6 days` when checked.
- Runtime logs showed Next.js `16.3.4`, ready on port `8100`.
- `curl -I http://127.0.0.1:8100` returned `307` with `Location: /login`.
- `curl -I https://gulmohar.macific.com` returned `307` with `Location: /login`, through Nginx.
- These checks confirm the unauthenticated route responds; they are not a full authenticated smoke test.
- Git was `main...origin/main [behind 5]` at audit time.
- Incoming commits identified at that time:
  - `b1f658c` Added tooltip in charts inside KPI cards
  - `defa8d6` Chart in KPI card implemented
  - `dc7a4e5` changed KPI cards color and added backup colors codes also
  - `a2a6be0` Complete Petpooja integration and sales analytics
  - `2e863b8` Add preparation tracking and improve wastage, breakage and manager access
- Re-fetch and inspect current remote state before every deployment; these commit IDs are historical.

## 3. VPS-specific files — preserve

At audit time Git status showed:

```text
## main...origin/main [behind 5]
 M next.config.ts
?? .dockerignore
?? Dockerfile
?? compose.prod.yaml
```

The three untracked deployment files are VPS-specific and must be preserved:
- `.dockerignore`
- `Dockerfile`
- `compose.prod.yaml`

`next.config.ts` has a local production modification. Required setting:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

The Dockerfile copies `.next/standalone` and runs `node server.js`. Do not lose `output: "standalone"`.

Never use `git reset --hard` or `git clean -fd` as routine deployment commands.

## 4. Docker configuration

### `compose.prod.yaml`

Path: `/opt/apps/gulmohar-analytics/compose.prod.yaml`

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

The app uses `.env` at runtime. Never print or commit its contents. The app is bound to localhost; Nginx provides public ingress. `shared-db-net` is an external network and must exist.

### `Dockerfile`

```dockerfile
FROM node:22-alpine AS base

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

EXPOSE 8100

CMD ["node", "server.js"]
```

Build uses Node 22 Alpine inside Docker; Node need not be installed on the host for this build.

### `.dockerignore`

```text
node_modules
.next
.git
.env
.env.*
!.env.example
npm-debug.log*
Dockerfile*
docker-compose*
compose*.yaml
compose*.yml
README.md
```

### Validate Compose

```bash
cd /opt/apps/gulmohar-analytics
sudo docker compose -f compose.prod.yaml config --services
```

Be careful sharing full `docker compose config` output because environment interpolation may expose secrets.

## 5. Database and Prisma migrations

Runtime database configuration is supplied through `.env`; its URL/password are intentionally not documented. Verified DB identifiers:
- PostgreSQL container: `shared-postgres`
- Database: `gulmohar_analytics`
- Role: `gulmohar_app`
- Network: `shared-db-net`

Readiness check:

```bash
sudo docker exec shared-postgres pg_isready -U gulmohar_app -d gulmohar_analytics
```

### Migration policy

Use committed Prisma migrations in production:

```bash
npx prisma migrate deploy
```

Important distinction:
- `git pull` updates code and migration files.
- `prisma migrate deploy` applies pending committed SQL migrations to the production database.
- Prisma migrations do not sync local database records to production.
- Local inserted/deleted test records are not replayed automatically.
- SQL migrations can drop production columns/tables and their data.

Do not use `prisma db push`, copy the local development DB over production, or manually edit production schema as a routine deployment.

### Reviewed incoming migrations

Two pending migration directories were identified in the incoming code:

```text
20261121021129_add_preparation_items_and_logs
20261121024835_add_master_data_breakage_and_reasons
```

The first migration drops old product-based wastage fields (`product_id`, `prepared_quantity`, `unit_food_cost`), adds `department_id`, required `preparation_item_id`, and `unit_cost`, and creates preparation item/log tables. No data backfill script was found during the review.

The second migration creates master-data tables including `breakage_items`, `wastage_reasons`, and `breakage_reasons`.

**User-approved decision:** VPS is not yet in operational use; wastage module is not confirmed; latest local/GitHub schema is intended. User confirmed existing VPS wastage data may be discarded.

**Verified row count at audit time:** `wastage_records` contained `0` rows:

```bash
sudo docker exec shared-postgres psql -U gulmohar_app -d gulmohar_analytics \
  -c 'SELECT COUNT(*) AS wastage_records FROM wastage_records;'
```

Recheck before migration if deployment is delayed or records may have been added.

After building the new image, inspect and apply migrations using a one-off Compose container:

```bash
sudo docker compose -f compose.prod.yaml run --rm --no-deps \
  --entrypoint npx gulmohar-analytics prisma migrate status

sudo docker compose -f compose.prod.yaml run --rm --no-deps \
  --entrypoint npx gulmohar-analytics prisma migrate deploy
```

Confirm the pending migrations match the reviewed list before applying. If Compose/entrypoint behavior differs, stop and inspect rather than improvising.

## 6. Backups

### Existing locations

- `/opt/backups/gulmohar-analytics/` existed and was empty at audit time.
- `/home/dhanil/backups/gulmohar/` contained:
  `gulmohar_analytics_20261123_182931.dump`
- File size: about 50 KB.
- Archive date: 23 November 2026, 18:29:31 UTC.
- Format: PostgreSQL custom archive; PostgreSQL 18.6; 122 TOC entries.
- It includes data and the old product-based wastage schema.

The archive was successfully parsed by `pg_restore --list`. This is not a full restore test. Keep it as a pre-migration recovery point; do not delete the only known backup.

Working archive inspection command:

```bash
cat /home/dhanil/backups/gulmohar/gulmohar_analytics_20261123_182931.dump \
  | sudo docker exec -i shared-postgres pg_restore --list
```

Do not append `-` as an input filename to `pg_restore` in this pipeline; it failed in the audited environment.

### Fresh pre-deployment backup

Use the existing folder; do not create duplicate folders:

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
cat "$BACKUP_FILE" | sudo docker exec -i shared-postgres pg_restore --list \
  > "${BACKUP_FILE}.toc.txt"
test -s "${BACKUP_FILE}.toc.txt" || { echo "Archive listing failed: STOP"; exit 1; }
echo "Verified backup: $BACKUP_FILE"
```

If `pg_dump` or archive inspection fails, stop deployment. Do not automatically delete older backups. Do not test restore against the live database; use a separate temporary database and explicit approval.

## 7. Safe Git update

Before every deployment:

```bash
cd /opt/apps/gulmohar-analytics
git status --short --branch
git remote -v
git branch --show-current
git fetch origin
git status --short --branch
git log --oneline HEAD..origin/main
```

Review incoming commits and diffs.

Back up VPS-specific files outside the repository before pulling:

```bash
STAMP="$(date -u +%Y%m%d_%H%M%S)"
SAFE_DIR="/home/dhanil/backups/gulmohar/deploy-config-${STAMP}"
mkdir -p "$SAFE_DIR"
cp -a next.config.ts Dockerfile .dockerignore compose.prod.yaml "$SAFE_DIR"/
ls -lah "$SAFE_DIR"
```

Then, only if the branch and incoming changes are expected:

```bash
git pull --ff-only origin main
```

If pull refuses, stop. Do not reset or clean. Reconcile local changes deliberately.

After pull:

```bash
git status --short --branch
git log -1 --oneline
test -f Dockerfile && test -f .dockerignore && test -f compose.prod.yaml
grep -n 'output: "standalone"' next.config.ts
```

If standalone output was lost, restore it deliberately from the protected copy and inspect the diff before building.

## 8. Deployment procedure

Run one stage at a time and review output.

### A. Preflight

```bash
cd /opt/apps/gulmohar-analytics
git status --short --branch
git fetch origin
git log --oneline HEAD..origin/main
sudo docker ps --filter "name=gulmohar-analytics"
sudo docker ps --filter "name=shared-postgres"
sudo docker network inspect shared-db-net
sudo docker exec shared-postgres pg_isready -U gulmohar_app -d gulmohar_analytics
curl -sS -I --max-time 10 http://127.0.0.1:8100
curl -sS -I --max-time 15 https://gulmohar.macific.com
```

Stop if database/network is unhealthy or current app is already failing unexpectedly.

### B. Backup

Create and verify a fresh timestamped backup using Section 6. Do not proceed if verification fails.

### C. Protect config and pull

Follow Section 7. Preserve all four production files and standalone output.

### D. Build

```bash
sudo docker compose -f compose.prod.yaml build gulmohar-analytics
```

If build fails, stop. Do not replace the running application.

### E. Migration status and apply

Run `prisma migrate status` using the one-off command in Section 5. Confirm migration list and backup. Then run `prisma migrate deploy`.

### F. Update only the application service

```bash
sudo docker compose -f compose.prod.yaml up -d --no-deps gulmohar-analytics
```

Do not use `docker compose down -v`, do not use `--remove-orphans` routinely, and do not restart/recreate `shared-postgres` for an app-only release.

### G. Verify

```bash
sudo docker ps --filter "name=gulmohar-analytics"
sudo docker logs --tail 100 gulmohar-analytics
sudo docker exec shared-postgres pg_isready -U gulmohar_app -d gulmohar_analytics
curl -sS -I --max-time 10 http://127.0.0.1:8100
curl -sS -I --max-time 15 https://gulmohar.macific.com
```

A `307` redirect to `/login` is an expected unauthenticated response. Also test login and important business workflows in a browser.

## 9. Rollback

Before deployment, record the currently running image and Git commit:

```bash
sudo docker inspect gulmohar-analytics --format '{{.Image}}'
git rev-parse HEAD
```

The image ID observed in the earlier audit was `8e41b0f8aad3`; it is historical and may no longer be available after image cleanup.

Application rollback and database rollback are different:
- An old app image may not be compatible with a migrated database.
- Prisma does not automatically reverse migrations when application code is rolled back.
- Migrations may drop columns and their data.
- Database recovery must use the verified pre-deployment dump, an explicitly agreed maintenance window, and a confirmed target database.
- Never restore over the live database as a test.

Do not improvise a container replacement or live database restore. Explain the plan and obtain approval first.

## 10. Security and operational rules

- Never display or share `.env` values.
- `.env` was mode `600` at audit time; keep permissions restrictive.
- Never commit secrets, credentials, tokens, or private keys.
- Do not expose PostgreSQL publicly.
- Keep the app bound to `127.0.0.1:8100` unless architecture is intentionally changed.
- Use `sudo docker`; do not weaken Docker socket permissions.
- Do not restart shared PostgreSQL during an app-only release.
- Never run `docker compose down -v` as a deployment shortcut.
- Never run `git reset --hard` or `git clean -fd` as routine deployment steps.
- Use committed Prisma migrations, not `db push`.
- Do not delete backups without an agreed retention policy and verified newer backup.

## 11. Remaining items to verify only when relevant

| Item | Audit status |
|---|---|
| VPS OS version, CPU/RAM/disk | Not captured |
| Exact Nginx upstream config | Domain responds; full config not captured |
| TLS expiry and renewal | Not captured |
| Current Git remote state | Must fetch before each deployment |
| Full dependency/package diff | Review against current incoming commits |
| Full PostgreSQL restore test to separate DB | Not performed |
| Backup retention policy | Not defined |
| Authenticated login and business workflow smoke test | Must test after deployment |

Do not expand the audit into unrelated applications or infrastructure.

## 12. Quick checklist

- [ ] Read this document and confirm deployment target is Gulmohar.
- [ ] Verify branch, remote and incoming commits.
- [ ] Verify app container, PostgreSQL readiness and `shared-db-net`.
- [ ] Check current local and public HTTP responses.
- [ ] Create and verify a fresh database backup.
- [ ] Back up `next.config.ts`, `Dockerfile`, `.dockerignore`, `compose.prod.yaml`.
- [ ] Pull with `git pull --ff-only origin main`.
- [ ] Confirm `output: "standalone"` remains set.
- [ ] Build updated Docker image.
- [ ] Review Prisma migration status.
- [ ] Apply migrations using `prisma migrate deploy`.
- [ ] Update only `gulmohar-analytics`.
- [ ] Check logs, local endpoint, public endpoint and DB readiness.
- [ ] Test login and key business workflows.
- [ ] Record deployed commit, image ID, backup filename and date.

## 13. Instructions for the next ChatGPT session

When this file is uploaded in a future chat:

1. Read the complete document; do not ask the user to repeat documented infrastructure details.
2. Verify only state that may have changed: Git status/remote commits, container health, database readiness, and current backup.
3. Review incoming code changes and migration SQL.
4. Explain destructive or unusual changes and obtain explicit approval.
5. Follow the deployment process one command at a time and wait for terminal output.
6. Preserve VPS-only production configuration.
7. Never assume old backup files, image IDs, commits, migration status, or row counts are still current.
8. Do not perform deployment, deletion, restore, or other production-changing action without approval.

**User preference:** Keep the process practical and concise. Give one command at a time, explain risks before changes, and wait for output.
