---
name: feature-development
description: Implement or extend features in the Gulmohar Analytics repository using its existing Next.js, Prisma, analytics, UI, and authorization conventions.
---

# Feature development

Use this workflow for scoped feature work. Read the repository's `AGENTS.md` and any applicable nested instructions first; permanent architecture, security, data-source, and safety constraints live there. All paths below are relative to the repository root. Scale the work to the feature.

## Analyze and inspect

- Check `git status --short` and the existing diff to establish the starting state.
- Turn the request into observable acceptance criteria: affected screens/APIs, roles, outlet scope, data source, calculations, empty/error states, and exclusions. Resolve material ambiguity; proceed with reasonable implementation choices.
- Trace the nearest implementation end to end: page/component -> analytics or API -> data loader/Prisma -> types/schema -> tests. Search with `rg`; inspect callers before changing shared signatures.
- Read the relevant architecture/domain references listed in `AGENTS.md`. For UI contracts and workflows inspect `docs/ui-integration-contract.md` and `docs/user-documentation/`; for Petpooja use `docs/petpooja-synchronization.md` / `docs/petpooja-integration-guide.md`.
- Inspect `package.json`, `tsconfig.json`, `eslint.config.mjs`, relevant Prisma models/migrations, and nearby tests. For authorization changes trace actual middleware, layouts, endpoint gates, and `src/lib/auth/permissions.ts` together.

## Plan and implement

- State a short plan naming affected files, existing helpers to reuse, API/data-contract changes, and verification. Identify any schema/data operation separately and check it against the task's scope before execution.
- Reuse `src/components/ui/`, `src/components/dashboard/ui-kit.tsx`, existing tables/dialogs/chart wrappers, and `src/components/layout/page-container.tsx`. Match Tailwind v4 tokens in `src/app/globals.css`, existing chart choices, strict TypeScript, `@/` imports, and nearby naming/style.
- Reuse `src/lib/format.ts`, `src/lib/utils.ts`, `src/lib/date-range-params.ts`, and analytics date-range/comparison helpers. Await page `searchParams` as nearby pages do.
- Follow the existing context resolver and scoped query patterns. Pass resolved context downstream instead of repeatedly querying the outlet. Check both current/comparison reads and every affected create/update/delete path against the acceptance criteria.
- Adapt existing JSON response shapes and status conventions: 401 authentication, 403 authorization, 400 validation, 404 missing records, 500 unexpected/configuration failures. Give forms loading, error, empty, and success feedback using existing patterns.

## Verify and document

- Extend nearby tests for meaningful behavior: happy paths, role denial, organization/outlet isolation, hostile browser IDs, invalid/inactive references, and relevant calculations/comparison ranges. Use `tests/sales-data-source.test.ts` and `tests/restaurant-context.test.ts` as examples for mocked Prisma reads and route integration; restore mocks and environment state.
- There is no package test script. For affected scope/sales behavior run:
  ```sh
  node --conditions=react-server --import tsx --test tests/restaurant-context.test.ts tests/sales-data-source.test.ts
  ```
  Select relevant Petpooja tests for integration changes. Inspect verification scripts for side effects, cleanup, credentials, and required local servers before selecting mutating integration checks.
- Run `npx tsc --noEmit --incremental false`, ESLint on changed TypeScript/TSX files (`npx eslint <files>`), and `git diff --check`. Run `npm run build` or a local UI smoke check when warranted. Compare failures with the starting tree.
- Update only affected maintained docs: architecture/data contracts for behavior changes, `docs/user-documentation/` for changed workflows, integration docs for Petpooja changes, and `.env.example` for new configuration names without secrets.
- Review the final diff for scope and accidental schema, dependency, generated-file, or fixture changes. Report resulting behavior, new/modified files, reuse/integration decisions, commands and outcomes, documentation updates, and remaining limitations or blockers.
