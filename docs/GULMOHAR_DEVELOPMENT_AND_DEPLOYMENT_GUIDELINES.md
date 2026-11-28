# Gulmohar Analytics --- Development & Deployment Guidelines

**Document type:** Project operating guidelines\
**Recommended filename:**
`GULMOHAR_DEVELOPMENT_AND_DEPLOYMENT_GUIDELINES.md`\
**Project:** Ashirvad Gulmohar Analytics\
**Applies to:** Local development, Git workflow, VPS deployment,
database operations, and Petpooja synchronization

------------------------------------------------------------------------

## 1. Purpose and core principle

This document defines the common rules for developing, testing,
committing, and deploying Gulmohar Analytics.

The objective is to keep local development and production consistent
while protecting the live application, database, credentials, and
synchronization history.

> **Develop and validate locally. Commit approved source changes to Git.
> Deploy those approved changes to the VPS. Do not use the VPS as a
> development workspace.**

## 2. Environment responsibilities

### 2.1 Local development

The local machine is the development workspace. Use it to:

-   Create and modify application code.
-   Update database schema and migrations.
-   Develop and test Petpooja integration and worker changes.
-   Run tests, linting, type checks, and production builds.
-   Review changes before committing.
-   Create commits on the development branch.
-   Maintain local-only notes and documentation where required.

Normal application development:

``` bash
npm run dev
```

Local PostgreSQL is managed by the existing `compose.yaml`:

``` bash
docker compose up -d postgres
```

The local Compose file is for the development database. Do not replace
it with the production Compose file.

### 2.2 Production VPS

The VPS runs the approved application version and production services.
Use it to:

-   Run the deployed application and scheduled Petpooja worker.
-   Store production-only environment configuration.
-   Store persistent worker state and execution history.
-   Manage production containers and systemd services.
-   Inspect logs, service health, and deployment status.
-   Apply approved database migrations when required by a release.

**Do not use the VPS to develop or patch application source code.**

## 3. Source of truth and Git branches

The Git repository is the source of truth for application and deployment
source files.

  Branch   Responsibility
  -------- -------------------------------------------------
  `dev`    Local development and integration of changes
  `main`   Approved production version deployed to the VPS

The VPS currently checks out `main`; local development currently uses
`dev`.

Pushing `dev` does not automatically update production. Production
changes must be reviewed and merged into `main` before deployment.

### Standard change flow

``` text
Local development on dev
        |
        v
Test and review changes
        |
        v
Commit changes
        |
        v
Push dev to remote Git
        |
        v
Review and merge approved changes into main
        |
        v
VPS pulls the approved main commit
        |
        v
Build and deploy required components
        |
        v
Verify production
```

Before starting work, on local:

``` bash
git branch --show-current
git status --short
git log -1 --oneline
```

Before deployment, confirm the target branch and commit on both local
and VPS.

Do not overwrite, reset, force-push, or discard work simply to make
branches look aligned. First identify which changes are local, remote,
staged, untracked, or production-only.

## 4. Git-managed files vs production-only files

### 4.1 Files that belong in Git

Application and deployment instructions should be version-controlled,
including:

-   Next.js application source.
-   Petpooja integration and worker source.
-   Package manifests and lockfiles.
-   Prisma schema and migration files.
-   Application and worker Dockerfiles.
-   Local and production Compose definitions.
-   Docker ignore files.
-   Systemd service and timer templates.
-   Safe example environment files with placeholders only.
-   Tests and scripts required to build or validate the application.

**The Petpooja worker source must remain tracked**, even though
automatic scheduled execution is intended for the VPS. Tracking the
source allows it to be reviewed, tested, built, and updated through the
same controlled release process as the application.

### 4.2 Production-only files and data

Keep these outside Git:

  ------------------------------------------------------------------------------------------
  Production resource                 Current location
  ----------------------------------- ------------------------------------------------------
  Petpooja worker credentials and     `/etc/gulmohar-analytics/petpooja-sync.env`
  production DB connection            

  Worker state and history            `/opt/data/gulmohar-analytics/petpooja-sync/`

  Installed systemd service           `/etc/systemd/system/gulmohar-petpooja-sync.service`

  Installed systemd timer             `/etc/systemd/system/gulmohar-petpooja-sync.timer`

  Main production environment         `/opt/apps/gulmohar-analytics/.env`
  ------------------------------------------------------------------------------------------

These are production configuration or runtime data, not source code.

Never copy production secrets into Git, source files, screenshots, chat
messages, or logs. Never replace production state/history with local
test state.

### 4.3 Systemd templates vs installed units

These are different:

-   Tracked templates live in `deploy/systemd/` inside the repository.
-   Installed units live in `/etc/systemd/system/` on the VPS.

The tracked service template describes the intended production setup.
The installed VPS unit is the active operating-system configuration.

When the template changes, update it locally, commit it, deploy the
approved commit, and deliberately install/reload the updated unit on the
VPS. A Git pull alone does not update the installed unit.

The service template must use this production environment path:

``` text
/etc/gulmohar-analytics/petpooja-sync.env
```

Do not change it back to a repository-local `.env.sync` path for
production.

## 5. Local and production Docker responsibilities

Keep the Compose files separate because they serve different purposes.

  -----------------------------------------------------------------------
  File                                Purpose
  ----------------------------------- -----------------------------------
  `compose.yaml`                      Local PostgreSQL development
                                      service

  `Dockerfile`                        Main Next.js production image

  `compose.prod.yaml`                 Main application production
                                      container

  `Dockerfile.sync`                   Petpooja worker image

  `compose.sync.yaml`                 Worker container execution

  `.dockerignore`                     Main Docker build-context
                                      exclusions

  `Dockerfile.sync.dockerignore`      Worker-specific build-context
                                      exclusions
  -----------------------------------------------------------------------

### 5.1 Local development

Continue using:

``` bash
docker compose up -d postgres
npm run dev
```

The worker must not start automatically when the Next.js development
server starts.

The worker can be run manually for deliberate local testing, using local
test credentials and a safe development database. Do not point a local
worker at production by default.

The worker Compose configuration uses the external `shared-db-net`
network in production. That network exists on the VPS; do not assume it
exists locally. Use a deliberate local configuration/network if
Compose-based local worker testing is needed.

### 5.2 Production

The main application is deployed using:

``` bash
docker compose -f compose.prod.yaml
```

The production Compose configuration connects to the existing external
`shared-db-net` network and reads the VPS `.env` file.

The worker is a separate service. Do not add it as an automatically
starting dependency of the main application.

### 5.3 Build context and secrets

Review `.dockerignore` whenever new files or environment configuration
are introduced. Ensure secrets, local environment files, database dumps,
runtime state, and unnecessary local files are not included in Docker
build contexts.

Do not remove ignore rules without understanding why they exist.

## 6. Database safety rules

The production PostgreSQL service is shared infrastructure. Treat it as
a critical resource.

1.  Do not recreate, delete, or reset the production PostgreSQL
    container as part of an ordinary application deployment.
2.  Do not change the production database password unless a separately
    planned credential-rotation task requires it.
3.  Do not casually change database names, users, schemas, network
    names, or connection settings.
4.  Do not run destructive commands such as `prisma migrate reset`,
    `DROP DATABASE`, `TRUNCATE`, or volume deletion against production.
5.  A successful application build does not prove a database migration
    is safe.
6.  Review every production migration before applying it.
7.  Back up the production database before risky schema or data changes.
8.  Keep local and production database connections clearly separated.
9.  Do not use production data as a local test target by default.
10. Do not run broad Docker cleanup commands that may remove persistent
    database volumes or production resources.

For schema changes:

-   Develop the schema and migration locally.
-   Test the migration against a development database.
-   Review the generated migration.
-   Commit the schema and migration together.
-   Deploy the approved code.
-   Apply the production migration deliberately.
-   Verify application and database compatibility.

Consider a rollback plan for migrations that are not safely reversible.

## 7. Petpooja worker operating rules

The Petpooja worker is a separate background process from the Next.js
web application.

### 7.1 Intended behaviour

-   Worker source is maintained in Git.
-   Worker image is built from tracked source.
-   Automatic daily execution is configured on the VPS through systemd.
-   The timer is intended to run at **23:00 Asia/Kolkata**.
-   Persistent state and execution history live outside the repository.
-   The worker uses configured production database and Petpooja
    credentials on the VPS.

### 7.2 Worker safety

-   Do not start duplicate scheduled runs manually.
-   The worker's database advisory lock is intended to prevent
    overlapping runs; do not bypass it.
-   Do not delete or reset worker state/history to solve an API or
    ingestion failure.
-   Do not change the initial baseline or recovery settings without
    understanding their effect on historical processing.
-   Do not assume a failed date can be skipped safely.
-   Confirm target dates, pending recovery dates, and previous run
    outcome before manually retrying.
-   Keep raw API responses, credentials, cookies, customer details, and
    order information out of operational logs.
-   Preserve retry behaviour and timeouts unless a tested change is
    required.

### 7.3 API failures

A worker run can fail before any data is ingested. A failed run must not
be described as a successful synchronization.

When diagnosing a failure:

1.  Inspect structured worker history and the systemd journal.
2.  Determine whether the failure occurred during API access,
    normalization, outlet resolution, or database ingestion.
3.  Use safe diagnostic metadata such as HTTP status, error class, and
    allowlisted network error codes.
4.  Do not log secrets, cookies, request headers, raw response bodies,
    or personal/order data.
5.  Fix source code locally, test it, commit it, and deploy the approved
    change.
6.  Retry only after understanding whether the previous run wrote data
    and how completion is tracked.

Do not resume automatic scheduling while a known failure is unresolved
if repeated scheduled attempts would be unhelpful or unsafe. Confirm
timer state before enabling or stopping it.

## 8. Development standards

### 8.1 Scope control

Work on one agreed task at a time.

Do not add speculative modules, optional features, infrastructure, or
dependencies unless they:

-   Are required for the agreed task.
-   Block the current implementation.
-   Are a genuine dependency for the next agreed task.
-   Represent a foundational decision that would be materially harder or
    riskier to change later.

Explain the reason before expanding scope.

### 8.2 Preserve existing architecture

Before changing architecture, inspect the existing implementation and
reuse established patterns.

Do not casually replace:

-   Database access patterns.
-   Authentication and authorization behaviour.
-   Tenant or outlet isolation.
-   Shared Docker networks.
-   Environment variable names.
-   Worker state formats.
-   API contracts.
-   Existing deployment conventions.

A change to a foundational contract must be deliberate and reviewed.

### 8.3 Configuration and secrets

-   Use environment variables for environment-specific configuration.
-   Keep `.env` files out of Git.
-   Maintain `.env.example` with placeholders and no real secrets.
-   Validate required environment variables at startup.
-   Do not hardcode credentials or production-only paths in application
    logic.
-   Do not print secrets during diagnostics.

### 8.4 Testing

Choose tests appropriate to the change. Before merging or deploying, run
relevant checks, such as:

``` bash
npm run lint
npm run build
```

Run the automated tests using the test command configured by the
project.

For worker changes, validate worker-specific tests and build. Use worker
preflight/check mode when appropriate; it is not the same as a real
ingestion run.

For Docker changes, validate the relevant Compose configuration and
build the intended image.

Do not claim a test passed unless it was actually run and its result
checked.

### 8.5 Dependency changes

Before adding or upgrading a dependency:

-   Confirm it is needed.
-   Check compatibility with the project's Node.js and Next.js versions.
-   Update the lockfile with the package manifest.
-   Run relevant tests and production build.
-   Avoid unrelated dependency upgrades.

## 9. Production deployment procedure

### Phase A --- Local preparation

1.  Confirm the current branch is `dev`.
2.  Check `git status`.
3.  Make the agreed source changes locally.
4.  Run relevant tests, linting, type checks, and build.
5.  Validate affected Docker Compose files.
6.  Review all staged changes.
7.  Confirm no secrets, local-only files, database dumps, or runtime
    state are staged.
8.  Commit with a clear message.
9.  Push `dev`.

### Phase B --- Approve production release

1.  Review the changes intended for production.
2.  Merge approved `dev` changes into `main`.
3.  Confirm the resulting `main` commit.
4.  Identify whether the release changes the main application, worker,
    database schema, systemd templates, or only configuration.

Do not deploy directly from an unreviewed `dev` working tree.

### Phase C --- VPS pre-deployment checks

Before pulling or rebuilding:

1.  Confirm the VPS is on the expected production branch.
2.  Check `git status --short`.
3.  Confirm there are no unexplained local modifications or untracked
    files that could conflict.
4.  Record the current deployed commit.
5.  Confirm production environment files exist and remain outside Git.
6.  Confirm the database and Docker network are healthy.
7.  Check worker timer and service state.
8.  Back up the database if the release includes risky schema/data
    changes.

Do not use `git reset --hard`, `git clean -fd`, or `git checkout -f` as
routine deployment commands. Do not remove untracked files to make a
pull succeed. Investigate and preserve them first.

### Phase D --- Deploy

1.  Pull the approved `main` commit.
2.  Build the required image(s).
3.  Apply reviewed database migrations only when required.
4.  Restart or recreate only the affected service(s).
5.  Do not use `--remove-orphans` in the shared Compose project without
    understanding which containers it would remove.
6.  Do not delete persistent volumes, production environment files,
    worker state, or history.

The main application and worker are separate deployment components.
Rebuild/restart the worker only when its source, dependencies, or worker
image configuration changes.

### Phase E --- Verify

After deployment:

-   Confirm the running container is healthy.
-   Check application logs for startup errors.
-   Verify the public application responds.
-   Confirm the application connects to the intended database.
-   Confirm no unexpected migration or data changes occurred.
-   If the worker was changed, run a safe preflight check.
-   Verify the installed systemd unit points to the production
    environment file.
-   Verify timer schedule and active state.
-   Confirm persistent worker state/history remains present.

Record the deployed commit and image version in the release record.

## 10. Server-only operations

Some operations belong only on the VPS because they interact with
production infrastructure:

-   Installing or reloading systemd units.
-   Enabling, disabling, starting, or stopping the production timer.
-   Managing production containers.
-   Inspecting production configuration without exposing its values.
-   Inspecting production logs and worker state.
-   Applying approved production migrations.
-   Backing up production data.

These operations must be deliberate and clearly identified as production
actions.

Before stopping or enabling the worker timer, inspect its current state.
Do not assume it is active or inactive based on an earlier deployment.

Never paste production secrets into terminal output.

## 11. Actions that must not be performed casually

The following are prohibited as routine troubleshooting or deployment
shortcuts:

-   Editing application source files directly on the VPS.
-   Pulling unreviewed changes into production.
-   Force-pushing shared branches.
-   Resetting or cleaning the VPS working tree without inspecting it.
-   Deleting production environment files.
-   Changing production database credentials without a plan.
-   Recreating or deleting shared PostgreSQL infrastructure.
-   Deleting Docker volumes.
-   Removing worker state or history to make a run appear clean.
-   Running historical ingestion again without checking worker state and
    idempotency.
-   Starting duplicate worker executions.
-   Disabling validation or security controls to make deployment
    succeed.
-   Logging raw Petpooja responses or secrets.
-   Treating an image build as proof that production is healthy.

If an emergency appears to require a direct production source patch,
stop and explicitly agree on the emergency procedure first. Any
emergency patch must subsequently be reconciled into local source
control so the repository remains the source of truth.

## 12. Documentation and operational records

The project currently uses a local-only `docs/` directory, excluded from
Git by `/docs/` in `.gitignore`.

Therefore:

-   Documentation stored there remains on the local machine.
-   Changes inside `docs/` are not included in normal commits or pushes.
-   The VPS does not receive updates to those local documents through
    Git.
-   Important operational decisions should still be preserved in the
    team's chosen documentation or release-record process.

If shared documentation is needed later, decide deliberately whether to
introduce a tracked documentation location. Do not remove the ignore
rule or start tracking `docs/` accidentally.

If this guideline is kept under the ignored `docs/` directory, it is
local-only unless separately shared.

## 13. Current known deployment layout

These paths describe the current setup and should be re-verified before
infrastructure changes.

### Repository

``` text
/opt/apps/gulmohar-analytics
```

### Production environment files

``` text
/opt/apps/gulmohar-analytics/.env
/etc/gulmohar-analytics/petpooja-sync.env
```

### Worker persistent data

``` text
/opt/data/gulmohar-analytics/petpooja-sync
```

### Systemd units

``` text
/etc/systemd/system/gulmohar-petpooja-sync.service
/etc/systemd/system/gulmohar-petpooja-sync.timer
```

### Docker and database

-   Main application container: `gulmohar-analytics`
-   Shared PostgreSQL container: `shared-postgres`
-   Shared Docker network: `shared-db-net`
-   Production database: `gulmohar_analytics`
-   Worker image naming is configured through `SYNC_IMAGE`.

Do not treat these values as universal defaults for local development.
They describe the currently established VPS deployment.

## 14. Definition of done

A development task is complete when:

-   The requested behaviour is implemented.
-   Existing project conventions and architecture are respected.
-   Relevant tests and validation pass.
-   No secrets or production runtime data are included in source
    control.
-   The change is reviewed and committed on the correct branch.

A production deployment is complete when:

-   The approved commit is deployed.
-   Required images and services are updated.
-   Required migrations are applied safely.
-   The live application and affected background services are verified.
-   Production database, credentials, and persistent worker state are
    preserved.
-   The deployed commit and outcome are known.

## 15. Final operating principles

1.  **Local is the development workspace.**
2.  **Git is the source of truth for application and deployment
    source.**
3.  **`dev` is for development; `main` is the approved production
    branch.**
4.  **The VPS is a production runtime, not a code editor.**
5.  **Worker source is tracked; automatic worker scheduling is
    production-only.**
6.  **Production secrets, state, history, and database data stay outside
    Git.**
7.  **Local and production Compose files have separate
    responsibilities.**
8.  **Database and shared infrastructure changes require extra review.**
9.  **Test before committing; review before merging; verify after
    deployment.**
10. **Never sacrifice production data or deployment safety to save
    time.**

------------------------------------------------------------------------

**Maintenance note:** Update this document when branch strategy,
deployment paths, database infrastructure, worker scheduling, or
environment ownership changes. Do not update it merely because an
individual feature or task is completed.
