# Gulmohar Analytics — Local Development Setup

**Prepared:** 27 November 2026  
**Source basis:** Local configuration audit dated 21 November 2026 and later project reports.

> The supplied local configuration is a dated snapshot, not a live inspection. Recheck the current repository, lockfile, `.env.example` and database before using these notes.

## 1. Stack recorded in the audits

- Windows local development environment.
- Node.js (the 21 November snapshot recorded Node 20; later worker instructions require Node 22).
- Next.js / TypeScript.
- PostgreSQL 16.
- Prisma ORM.
- Docker for local PostgreSQL and worker execution.

Use the Node version required by the current project `package.json`, lockfile and Dockerfile. Do not assume the older Node 20 snapshot remains correct.

## 2. Before starting work

From the project root:

```bash
git status
git branch --show-current
git log -1 --oneline
```

Confirm the working tree, intended branch and current commit. Do not overwrite local changes or switch branches without understanding their state.

## 3. Environment configuration

Keep local secrets in an ignored `.env` file. Use `.env.example` only for variable names and safe placeholders.

Variables identified by the Petpooja and local-configuration reports include:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `PETPOOJA_GET_ORDERS_ENDPOINT` | Optional Get Orders endpoint override |
| `PETPOOJA_REST_ID` | Petpooja restaurant/outlet identifier |
| `PETPOOJA_APP_KEY` | Petpooja application key |
| `PETPOOJA_APP_SECRET` | Petpooja application secret |
| `PETPOOJA_ACCESS_TOKEN` | Petpooja access token |
| `PETPOOJA_API_COOKIE` | Cookie required by the audited client configuration |
| `DEV_ADMIN_PASSWORD` | Local development seed credential |
| `DEV_MANAGER_PASSWORD` | Local development seed credential |
| `DEV_OPERATOR_PASSWORD` | Local development seed credential |

The earlier local configuration document also lists webhook/Supabase variables as legacy/not configured. Do not add those back unless the architecture is deliberately changed.

## 4. PostgreSQL and Prisma

The 21 November local snapshot recorded:
- PostgreSQL 16.
- Host `localhost`, port `5432`.
- Database `gulmohar_dev`.
- Prisma ORM.
- Seven migrations applied through `20261121024835_add_master_data_breakage_and_reasons`.

These values may have changed. Verify the actual Docker Compose file, `.env`, `prisma/schema.prisma` and migration directory.

Useful Prisma operations (confirm project scripts first):

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Use the project's documented local migration script for development. Production must use committed migrations through `prisma migrate deploy`; never run development migration commands against production.

## 5. Petpooja worker local preflight

The worker operations document specifies a read-only preflight:

```bash
node --import tsx scripts/petpooja-daily-sync.ts --check
```

This checks configuration and outlet/database mapping; it does not call Petpooja, initialize history or ingest orders.

Worker tests:

```bash
node --import tsx --test tests/petpooja-daily-sync.test.ts
```

See [Petpooja worker operations](operations/petpooja-worker-operations.md) before running any command that writes orders/items.

## 6. Safety rules

- Never commit `.env`, `.env.sync`, tokens, passwords or cookie values.
- Never copy local test records into production.
- Never run seed scripts against production unless the dedicated production procedure is approved.
- Before migrations, confirm the database host/name and migration status.
- Treat all ingestion commands as data-writing operations.
- Do not use `--daily`, `--date` or `--from/--to` ingestion commands until the target database and requested dates have been reviewed.
- Keep raw POS payloads and customer data out of docs, logs and container images.

## 7. What this document does not prove

This guide does not prove that:
- The current local branch or commit matches the 21 November snapshot.
- Local Petpooja mapping is currently correct.
- Production credentials are valid.
- The production worker timer is installed or enabled.
- A successful local sync implies production ingestion is complete.

Verify each environment independently.
