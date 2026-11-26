<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Permanent project guidance

These rules apply to all repository work, whether or not a skill is activated. When implementing or extending application features, use [feature-development](.agents/skills/feature-development/SKILL.md) for the development workflow. Keep enduring constraints here and task procedures in that skill.

## Architecture and data contracts

- Preserve the existing App Router structure: pages/APIs in `src/app/`, UI in `src/components/`, dataset loading/mapping in `src/lib/data/`, calculations/composed summaries in `src/lib/analytics/`, and shared contracts in `src/types/`. Reuse existing components and utilities; avoid unnecessary dependencies or new architectural layers.
- Keep database, authentication, and data-access code server-only. Send only necessary serializable display data to clients. Pages should compose analytics rather than duplicate formulas or read raw fixtures; follow existing operational Prisma and metadata-loading patterns.
- Use `src/lib/db/client.ts` for Prisma. Preserve UUID identities, foreign keys, historical records, nullable unknown costs, and Decimal financial calculations. Display codes are not interchangeable with database UUIDs. Preserve preparation/wastage availability checks and related transactional writes; a transaction alone is not proof of concurrency safety.
- Preserve successful-order revenue filters, units, date-only boundaries, and IST display conventions. Financial formulas and naming are documented in `mock_data/business-rules.md`; partial contribution estimates must not be labeled net profit.
- Respect each loader's actual data-source policy. Sales readers use PostgreSQL even in mock mode; other datasets may switch with `DATA_SOURCE` or intentionally remain fixtures. Never fabricate records, coerce unknown costs to zero, or silently fall back to mock data on database failure; empty live data needs an empty state.

## Outlet isolation and authorization

- Normal restaurant workflows use `src/config/restaurant.ts`, `src/lib/context/restaurant-context.ts`, and the dashboard sales-scope adapter. Require the configured active outlet, matching user organization, and an assignment to that exact outlet for operators. Do not hardcode UUIDs, select the first assigned outlet, or silently fall back. Reuse trusted context within a request; current and comparison queries must have identical outlet scope.
- Authenticate through `src/lib/auth/scope.ts` and enforce the existing role and ownership checks on the server. Middleware and UI visibility do not replace endpoint authorization. Preserve admin/manager/operator behavior unless the requested change explicitly alters it.
- Derive operational outlet and recorded-user IDs on the server. Browser-supplied outlet IDs must not widen scope. Verify existing-record ownership before updates/deletes; validate active items within the organization and departments within the target outlet.
- Preserve generic multi-outlet administration, department pickers, and user assignments. Keep Petpooja's incoming restaurant-ID resolution in `src/lib/petpooja/` separate from application outlet configuration.
- Preserve API contracts and distinguish authentication, authorization, validation, missing-record, configuration, and unexpected errors. Return safe explicit errors and never expose credentials in responses, logs, or documentation.

## Development safety and references

- Preserve unrelated working-tree changes. Verify the intended database/environment before queries; use read-only checks for discovery. Inspect verification scripts before running them: some `tests/verify-*.ts` and `prisma/seeds/verify-*.ts` mutate data. Mutating integration tests need an appropriate isolated local target.
- Keep migrations, seeding, historical-data edits, production actions, commits, and pushes within the user's authorized scope; a feature request does not authorize unrelated operations. Keep `mock_data/` fixtures read-only unless changing them is part of the task.
- Verify changes with appropriate checks. Report actual results and pre-existing blockers separately; do not disable checks or make unrelated fixes to obtain a passing result.
- Consult `docs/architecture.md` for architecture, `docs/local-configuration.md` / `compose.yaml` for local setup, and relevant domain docs for details. Some documents describe historical phases: reconcile them with current code and `prisma/schema.prisma` rather than restoring obsolete behavior. Update affected maintained documentation without duplicating its detailed reference material here.
