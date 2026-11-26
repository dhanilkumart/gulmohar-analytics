# Gulmohar Analytics --- Pending Features & Recommendations

**Project:** Ashirvad Gulmohar\
**Current configured outlet:** `KOZ-001`\
**Document date:** 26 November 2026

> This register reflects project decisions and Codex reports shared so
> far. It distinguishes completed work from pending verification and
> future ideas. Recheck the repository before implementing any item.

------------------------------------------------------------------------

## 1. Postponed

These items were deliberately deferred to keep the current single-outlet
installation focused. They are not requirements for the current V1
deployment.

### SaaS and restaurant administration

-   [ ] **Feature toggles (`features.ts`)** --- A central
    feature-control system. A working implementation requires more than
    a config file: navigation visibility, page authorization, API
    enforcement and data-loading behavior must all respect feature
    access. Defer until subscription-based module access is required.
-   [ ] **Subscription plans and billing** --- Plan definitions, feature
    entitlements, usage limits, billing and payment lifecycle.
-   [ ] **Master administration dashboard** --- Central management of
    restaurant installations, onboarding, configuration and subscription
    status.
-   [ ] **In-app restaurant onboarding/account creation** --- Current
    direction is independent deployments, not multiple restaurant
    accounts inside one shared application.
-   [ ] **Central integration-management UI** --- A UI for managing
    Petpooja and future integrations. Installation-specific
    configuration and environment variables are sufficient for now.
-   [ ] **Customer-facing multi-outlet selection and management** ---
    Keep normal restaurant workflows fixed to one configured outlet.
    Preserve existing generic multi-outlet database relationships and
    administrative capabilities.

### Multi-outlet and shared SaaS expansion

-   [ ] **Multiple outlets within one restaurant installation** ---
    Revisit only when a customer needs multiple outlets in one
    application.
-   [ ] **Shared application / multi-tenant SaaS deployment** ---
    Current preferred model is the same codebase deployed independently
    for each restaurant, with separate configuration and database. A
    shared application with tenant routing is a separate future
    architecture decision.

### Other previously deferred product capabilities

-   [ ] Sales forecasting and predictive analytics.
-   [ ] Preparation recommendations and demand prediction.
-   [ ] Inventory management and stock analytics.
-   [ ] Automated operational alerts and threshold notifications.
-   [ ] Advanced analytics beyond the current dashboards, comparisons
    and reports.

These were identified as later-phase capabilities, not immediate V1
requirements.

------------------------------------------------------------------------

## 2. Really Needed --- Recommendations

These are practical follow-ups for correctness, security, operational
confidence and release readiness. Some are verification tasks rather
than new features.

### A. Complete verification of central outlet configuration

-   [ ] **Authenticated admin UI smoke test.** Use an existing
    authenticated local admin browser session to check Overview, Sales,
    Profitability, Reports, Wastage & Preparation, and Breakage. Verify
    page rendering, charts/tables, date and comparison controls,
    dropdowns, empty states, dialogs and browser console errors. Do not
    submit forms or create records during this smoke test.
-   [ ] **Operator UI verification.** Verify `/operator/entry`, metadata
    dropdowns and entry tabs using a genuine operator session. An admin
    session is not sufficient because operator APIs enforce the operator
    role. Prefer an isolated/disposable local test environment if a new
    operator session or test data must be created.
-   [ ] **Operational outlet isolation with data.** Preparation, wastage
    and breakage tables returned empty results in the latest local
    checks. Existing regression tests cover restrictions, but live
    cross-outlet isolation for populated operational records remains
    unproven. Verify using isolated test data when available; do not
    fabricate records in the working database merely to complete the
    check.
-   [ ] **Authenticated API verification.** Where practical, verify
    relevant APIs using a valid local session and confirm
    browser-supplied outlet IDs cannot change the configured target.
    Unauthenticated 401 responses are expected and do not prove
    authenticated behavior.
-   [ ] **Keep verification evidence current.** Record which checks were
    actually run, the environment used, and which workflows remain
    unverified.

**Evidence already reported:** 24 relevant regression tests passed (19
restaurant-context/operational tests and 5 sales tests). The actual
local PostgreSQL resolver successfully resolved active `KOZ-001` for
existing local admin and operator users. Sales reader and summary each
returned 6,112 successful orders for 31 October--22 November 2026,
matching an independent outlet-scoped database count. Operational
readers succeeded but returned empty results. Authenticated UI rendering
and operator UI behavior remain unverified.

### B. Resolve known analytics consistency issue

-   [ ] **Align daily revenue and AOV chart calculations with headline
    KPI calculations.** A prior review found that the daily query sums
    `totalAmount`, while the headline reader can calculate revenue as
    gross minus discount when `totalAmount` is missing and both inputs
    are available. Review the documented business rules and use one
    consistent calculation approach without changing established order
    semantics. Add regression tests for missing `totalAmount`, discounts
    and comparison periods.

### C. Remove unnecessary wastage-to-sales dependency

-   [ ] **Decouple wastage calculations from the sales-dependent
    preparation helper where appropriate.** A prior review found that
    `getWastageByProduct()` indirectly depends on the preparation helper
    and may fail during a sales database outage even though wastage
    calculations do not use sales values. Confirm the current
    implementation and separate dependencies without changing wastage
    formulas or data-source rules.

### D. Resolve existing quality and build blockers

-   [ ] **Investigate and fix the pre-existing Next.js route export
    blocker.** Full TypeScript/build validation has been blocked by the
    extra `requireAdminUser` export in
    `src/app/api/admin/departments/route.ts`, which an earlier review
    traced to existing Git history. Fix it in a separate, scoped task,
    preserving route behavior and callers.
-   [ ] **Review existing ESLint findings.** The latest implementation
    report noted 19 existing errors and 8 warnings, with no new findings
    attributed to the outlet-configuration changes. Triage and fix these
    separately rather than mixing unrelated changes into feature work.
-   [ ] **Review the Next.js middleware deprecation warning.** The local
    server reported that `middleware` is deprecated in favor of `proxy`.
    Assess the migration against the installed Next.js version and its
    documentation; schedule it separately if required.
-   [ ] **Re-run full validation after blockers are addressed:**
    TypeScript, relevant tests, ESLint, `git diff --check` and a
    production build.

### E. Prepare and verify independent restaurant deployment

-   [ ] **Document repeatable onboarding/deployment.** For a new
    independent restaurant: deploy the same application codebase,
    provision a separate empty PostgreSQL database, apply existing
    Prisma migrations, create the required organization/outlet records
    through an approved provisioning process, configure the restaurant
    outlet code and Petpooja environment variables, deploy, then run and
    verify initial synchronization.
-   [ ] **Verify configuration prerequisites per installation.** The
    configured outlet code must resolve to exactly the intended active
    outlet in the intended organization. Its Petpooja mapping must match
    that restaurant. Do not copy production data into a new customer's
    database.
-   [ ] **Verify production separately before release.** Local
    verification does not prove production configuration, outlet
    mapping, environment variables, backups or runtime behavior. Perform
    a read-only production preflight and controlled deployment
    verification when deployment is approved.
-   [ ] **Confirm backup and restore procedures.** Ensure each
    independent restaurant database has a documented backup schedule and
    a tested restore procedure before onboarding paying customers. Keep
    each customer's backup isolated.

### F. Keep data scope and reporting honest

-   [ ] **Review report inputs that are not yet consistently
    outlet-scoped.** A prior audit found some report inputs such as
    wastage, breakage, operating costs and attendance were fetched
    separately from the sales scope. Confirm the current state after the
    outlet-context changes. Do not present values as verified
    outlet-specific metrics unless their source and scope support that
    claim.
-   [ ] **Document empty-data behavior.** Preparation, wastage and
    breakage currently have no local records. Ensure the UI presents
    honest empty states and never implies missing operational data means
    zero activity unless that is the actual business meaning.

------------------------------------------------------------------------

## 3. Nice to Have

These improvements may improve usability or operations but are not
required to complete the current single-outlet implementation.

### User experience

-   [ ] More detailed dashboard drill-downs from KPIs and charts to
    underlying orders.
-   [ ] Saved report filters and commonly used date ranges.
-   [ ] Additional report export formats (for example, Excel) if
    customers request them.
-   [ ] Contextual explanations for metrics, calculation definitions and
    data freshness.
-   [ ] Optional scheduled email delivery of selected reports.

### Analytics enhancements

-   [ ] Sales trend forecasting.
-   [ ] Preparation demand forecasting and suggested preparation
    quantities.
-   [ ] Menu-item performance insights and actionable recommendations.
-   [ ] Advanced product/category contribution analysis.
-   [ ] Operational trend and anomaly detection.

### Operational enhancements

-   [ ] Inventory and stock tracking.
-   [ ] Low-stock, wastage and unusual-sales alerts.
-   [ ] Configurable notification channels.
-   [ ] More detailed operational audit history and activity views, if
    existing audit coverage proves insufficient.

### Platform and administration

-   [ ] Guided restaurant setup for restaurant identity, outlet code and
    Petpooja credentials.
-   [ ] Central integration settings UI.
-   [ ] Feature entitlements and subscription-based module access.
-   [ ] Master admin dashboard for managing independent restaurant
    installations.
-   [ ] Multi-outlet workflows within one restaurant account, if
    customer demand justifies the added complexity.
-   [ ] Centralized deployment/update orchestration across independent
    installations.

------------------------------------------------------------------------

## Current architecture decisions to preserve

These are established decisions, not pending feature requests:

1.  **One independent restaurant installation per deployment** for the
    current product model.
2.  **One configured outlet per installation** for normal restaurant
    workflows.
3.  **Separate PostgreSQL database per restaurant installation.**
4.  Reuse the same application codebase across deployments; configure
    each installation independently.
5.  Resolve the configured outlet code server-side to the existing
    PostgreSQL `Outlet.id` UUID. Do not hardcode database UUIDs in
    application code.
6.  Keep existing `Organization` and `Outlet` relationships and
    historical records. Do not remove multi-outlet schema support.
7.  Preserve generic multi-outlet administration and user-assignment
    capabilities where they already exist.
8.  Keep Petpooja incoming `restID` resolution separate from the
    application's configured outlet context.
9.  Do not expose outlet selection in normal single-outlet dashboard
    workflows.
10. Keep Petpooja credentials in environment variables or secure
    integration storage, never in source-controlled configuration.
11. Do not introduce feature flags, subscription management, master
    administration or a shared multi-tenant application until those
    requirements are approved.

## Completed work --- Reference only

The following items were reported completed and should not be treated as
pending unless a later regression is found:

-   PostgreSQL became the exclusive source for sales orders and line
    items, including analytics, reports and CSV exports; sales reads do
    not fall back to mock fixtures.
-   Sales authorization and date-range scoping were tightened for
    current and comparison periods.
-   Preparation chart sales quantities and date ranges were moved to
    PostgreSQL-backed data. Preparation and menu-product quantities
    remain separate because the current schema does not link them.
-   Central configuration was added at `src/config/restaurant.ts`.
-   Server-only outlet context resolution was added at
    `src/lib/context/restaurant-context.ts`.
-   Normal dashboard and operational workflows were updated to use the
    configured outlet context.
-   Local outlet `KOZ-001` was verified as active under organization
    `AG`, with Petpooja ID `9780nusx` and UUID
    `4c78ce87-79cf-4f0d-817e-23e728db9bf8`.
-   19 restaurant-context/operational regression tests and 5 sales
    regression tests passed in the latest terminal verification.
-   The local resolver was exercised against PostgreSQL for existing
    admin and operator users.
-   Sales reader and summary each returned 6,112 successful orders for
    31 October--22 November 2026, matching an independent scoped
    database count.
-   Generic multi-outlet administration and Petpooja ingestion were
    preserved.
-   No Prisma schema change or migration was required for the central
    outlet configuration.

------------------------------------------------------------------------

**Maintenance note:** Update this document when an item is completed,
reprioritized or explicitly rejected. Before implementing an item, ask
Codex to inspect the current repository and reconcile this register with
the actual implementation. This document is a planning register, not
proof that an item remains outstanding.
