# Architecture

Ashirvad Gulmohar Restaurant Intelligence Dashboard — application scaffold.

Stack: Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix) + Recharts.

## 1. Current mock-data architecture

All demo data lives in `mock_data/` at the repository root (sibling to
`src/`), exactly as inspected before this scaffold was built:

```
mock_data/
  restaurant.json        (1 object)
  departments.json       (6 rows)
  categories.json        (10 rows)
  products.json          (60 rows)
  ingredients.json       (41 rows)
  recipes.json           (19 rows — only 5 of 60 products have a recipe)
  employees.json         (55 rows)
  sales.json             (~179k rows, ~30MB)
  sale-items.json        (~341k rows, ~44MB)
  preparation.json       (2,920 rows — only 8 of 60 products tracked)
  wastage.json           (2,920 rows, 1:1 with preparation.json)
  breakage.json          (731 rows — non-food breakage, not linked to products)
  attendance.json        (20,075 rows)
  operating-costs.json   (730 rows — "Utilities" and "Gas" only)
```

`mock_data/` is treated as read-only source-of-truth data and is never
modified or reshaped by the application. `mock_data/business-rules.md`
is the single source of truth for financial/operational formulas.

## 2. Data access layer — `src/lib/data/`

This is the **only** layer in the app that knows the data currently comes
from JSON files in `mock_data/`. It exposes one function per dataset —
`getRestaurant()`, `getDepartments()`, `getCategories()`, `getProducts()`,
`getIngredients()`, `getRecipes()`, `getEmployees()`, `getSales()`,
`getSaleItems()`, `getPreparation()`, `getWastage()`, `getBreakage()`,
`getAttendance()`, `getOperatingCosts()` — each returning a `Promise` of
the dataset's typed shape (see `src/types/`).

Implementation notes:

- `src/lib/data/reader.ts` centralizes filesystem access
  (`node:fs` + `node:path`, resolved from `mock_data/` at
  `process.cwd()`) behind `createCachedLoader<T>(filename)`, which reads
  and `JSON.parse`s a file **at most once per server process** and
  memoizes the result in a module-level variable.
- Every file in `src/lib/data/` (and `src/lib/analytics/`) imports the
  `server-only` package. This makes it a **build-time error** to import
  this code — even transitively — into a Client Component bundle, so raw
  mock data (sales/sale-items especially) can never be shipped to the
  browser.
- Functions are `async`/return `Promise<T>` even though the current mock
  implementation is synchronous under the hood. This is deliberate: it
  means the eventual swap to a real backend call (`fetch`, an ORM query,
  etc.) requires **no signature change** at any call site.

## 3. Analytics layer — `src/lib/analytics/`

Pure aggregation/calculation functions built on top of `src/lib/data`,
implementing the formulas in `mock_data/business-rules.md`:

| File | Responsibility |
|---|---|
| `date-range.ts` | `DateRangePreset`, `DateRange`, `resolveDateRange()` — the reusable date-range model (see §6). |
| `sales.ts` | Gross/net sales, discount, order count, item quantity sold; `getSaleItemsInRange()` joins `sale-items` to `sales` via `bill_id` since sale-items have no date of their own. |
| `profitability.ts` | Food cost, gross food margin, per-product profitability, loss-making / high-profit / high-sales-low-margin product lists. |
| `wastage.ts` | Wastage cost (from `wastage.json`'s pre-computed `estimated_cost`). |
| `preparation.ts` | Wastage % and sell-through % (from `preparation.json`), prepared-vs-sold-vs-wasted aggregates, per-product preparation history. |
| `breakage.ts` | Breakage cost. |
| `attendance.ts` | Present/absent/leave counts, attendance rate, total & average working hours. |
| `manpower.ts` | Department headcount vs. `benchmark_headcount`, monthly labor cost roll-ups. |
| `operating-costs.ts` | Total variable operating costs for a range. |
| `operational-contribution.ts` | `getEstimatedOperationalContribution()` — see §3.1. |
| `summary.ts` | Composes the above into ready-to-use aggregates (e.g. `getOperationalContributionForRange()`) so a page makes one call instead of assembling raw datasets itself. |

Dashboard pages should call these functions (or the composed ones in
`summary.ts`), not `src/lib/data` directly, and never `mock_data/*.json`
directly.

### 3.1 "Estimated operational contribution" — naming discipline

Per `business-rules.md`:

> Estimated operational contribution = sales - food cost - wastage -
> breakage - variable operating costs. Do not label contribution as net
> profit unless all relevant accounting expenses are included.

`operating-costs.json` only contains two cost types ("Utilities" and
"Gas") — no rent, no full payroll, no other overheads. This value is
therefore a **partial** contribution estimate. The function name
(`getEstimatedOperationalContribution`), its return type, and every
place it is surfaced in the UI must keep calling it "estimated
operational contribution" — never "net profit" or "profit".

### 3.2 Known mock-data scope limits reflected in the analytics layer

- **Preparation/wastage/sell-through** metrics only exist for the 8
  products present in `preparation.json` (Idli, Vada, Meals, Mini Meals,
  Veg Biryani, Special Thali, Sambar, Rasam). Functions in
  `preparation.ts` naturally return data for those products only —
  callers must not present this as restaurant-wide coverage.
- **Recipes** cover only 5 of 60 products. `recipes.json` is exposed via
  `getRecipes()` but is not used by the profitability functions, which
  rely on `products.json`'s own `food_cost` field (the reliable,
  full-coverage figure) rather than reconstructing cost from a
  mostly-absent bill of materials.
- **Labor cost** is monthly only — `employees.json` has no hourly rate,
  so `manpower.ts` exposes monthly figures rather than inventing a
  daily/hourly conversion.
- **High-sales/low-margin thresholds** are not defined in
  `business-rules.md`. `getHighSalesLowMarginProducts()` takes explicit,
  documented, overridable parameters (a volume percentile and a margin %
  threshold) instead of a silently hard-coded rule.

## 4. UI layer

- `src/app/layout.tsx` — root layout: fonts, global styles, metadata.
- `src/app/page.tsx` — minimal landing page linking to `/dashboard`.
- `src/app/dashboard/layout.tsx` — dashboard shell: desktop `Sidebar` +
  `Header` (with a mobile nav `Sheet`/drawer) around a `<main>` area.
- `src/app/dashboard/*/page.tsx` — one route per section (`/dashboard`,
  `/sales`, `/profitability`, `/wastage`, `/manpower`, `/breakage`,
  `/reports`), each currently rendering a `PlaceholderCard` inside the
  shared `PageContainer`. No charts or real metrics are wired up yet —
  this is scaffolding only.
- `src/components/layout/` — `Sidebar`, `Header`, `SidebarNav` (shared
  nav-item list used by both desktop and mobile), `NavLink` (active-state
  link), `PageContainer` (responsive title + content wrapper), and
  `nav-items.ts` (the single place route labels/icons/hrefs are defined).
- `src/components/dashboard/` — `MetricCard` (KPI stat-tile shell) and
  `ChartContainer` (a `Card` + Recharts `ResponsiveContainer` shell) as
  reusable foundations for future dashboard screens; `PlaceholderCard` for
  the current placeholder routes.
- `src/components/ui/` — shadcn/ui primitives (`button`, `card`, `table`,
  `badge`, `separator`, `scroll-area`, `skeleton`, `sheet`).

Tailwind v4 + shadcn's generated CSS variables (`src/app/globals.css`)
provide the base theme (light/dark tokens, radius scale, chart color
tokens) — no dashboard-specific visual design has been layered on top
yet.

## 5. Replacing mock data with a real API/database later

The production data flow is intended to be:

```
Petpooja / Biometric / Manual Inputs → Backend → Database → API
                                                              │
                                                              ▼
                                          src/lib/data (getDataSourceMode())
                                                              │
                                                              ▼
                                              src/lib/analytics (unchanged)
                                                              │
                                                              ▼
                                                   Dashboard (unchanged)
```

### Data Access Mode & Integrity Guarantee (`src/lib/data/reader.ts`):
- Controlled via `DATA_SOURCE = "mock" | "database"` in environment variables (defaults to `"mock"`).
- `getDataSourceMode()` exposes the active mode server-side.
- **Strict Data-Integrity Rule:** In `"database"` mode, loaders query production tables and return empty datasets for dates without records. They **never silently fall back** to mock data or disguise data gaps with fictitious sales figures.

Because every consumer of data goes through `src/lib/data`'s named
functions (`getSales()`, `getProducts()`, etc.) and never touches
`mock_data/*.json` directly, swapping the source means **only**
rewriting the bodies of the functions in `src/lib/data/*.ts` — e.g.
replacing `createCachedLoader("sales.json")` with a `fetch()` call to a
real API route or a database query. `src/lib/analytics`, every
`src/app/dashboard/*` page, and every `src/types/*` interface can stay
exactly as they are, provided the API/database returns data shaped like
the current types (adjusting types where the real schema differs is
expected).

No Petpooja or biometric-vendor API shapes are assumed anywhere in this
codebase — `mock_data/README.md` is explicit that this schema is an
internal demo model, not a claim about any real vendor's API.

## 6. Date-range model

`src/lib/analytics/date-range.ts` defines `DateRangePreset` ("today",
"yesterday", "last7Days", "thisWeek", "lastWeek", "thisMonth",
"lastMonth", "thisYear", "custom") and `resolveDateRange()`, which turns
a preset (or an explicit custom `{ from, to }`) into a concrete
`DateRange` used to filter every analytics function. No visual date-range
picker has been built yet — only the underlying model, per scaffolding
scope.

## 7. Why raw sales data must not be loaded unnecessarily into client components

- `sales.json` (~30MB / ~179k rows) and `sale-items.json` (~44MB / ~341k
  rows) are the two largest datasets by far. Sending either to the
  browser — as a prop, embedded JSON, or a client-side `fetch` of the raw
  file — would ship tens of megabytes to every visitor and force
  aggregation to happen on the client, on every page view.
- The `server-only` import in every `src/lib/data/*.ts` and
  `src/lib/analytics/*.ts` file turns any accidental client-side import
  of this code into a build failure, rather than a silent bundle-size
  regression discovered later.
- `createCachedLoader` reads and parses each JSON file once per server
  process and keeps the parsed array in memory, so repeated Server
  Component renders or Route Handler calls do not re-read multi-megabyte
  files from disk each time.
- The analytics layer's job is to turn "hundreds of thousands of rows"
  into "a handful of numbers/aggregates" (e.g. `getSalesSummary()`,
  `getProductProfitability()`) entirely server-side, so what ultimately
  reaches a Client Component (if one is used for an interactive chart) is
  a small, pre-aggregated payload — not the raw dataset.

---

## 8. Phase A: Production Database Design & Order Processing Architecture (Proposed)

*Status: Design Proposal (Pending Implementation Approval)*

To transition from file-based mock data to live POS-driven analytics without destabilizing existing calculations, the system adopts a multi-tier delivery staging, lease-fenced processing, and normalized persistence pipeline.

```
Petpooja POS ("SAVE AND PRINT" Webhook)
                   │
                   ▼
[Raw Staging]     public.petpooja_webhook_events
                   - Byte-for-byte exact HTTP body: raw_body (BYTEA NOT NULL)
                   - Parsed JSON structure: payload (JSONB NOT NULL)
                   - Cryptographic SHA-256 hash: payload_sha256 computed on raw_body
                   - Transmission & storage integrity: Proves payload unaltered at rest/transit
                   - Origin authenticity: Gated by registered restID credentials & network checks
                   - Exact repeats staged with processing_status = 'duplicate' & duplicate_of_event_id
                   - Concurrency control: Active leases block newer events for the same order
                   - Worker lease fencing: Unique lease_token verified atomically at commit
                   - PostgreSQL-compatible sequential claim: CTE + ROW_NUMBER() over uncompleted events
                   - Exponential backoff retry: processing_attempts, next_retry_at, last_error
                   - Relational link: sales_order_id (nullable FK -> sales_orders.id)
                   │
                   ├──► public.petpooja_event_errors (Full error history & attempt audit trail)
                   │
                   ▼
[Processing Engine] Validate -> Check Registered Restaurant -> Cross-API Resolution -> Lease-Fenced Commit
                   │
                   ├──► public.restaurants (Strict registration: NO auto-creation of unknown outlets)
                   ├──► public.sales_orders (financial_status, matching_status, evidence, nullable source fields)
                   ├──► public.sales_order_items (Nullable item tax/discount, snapshot preservation)
                   ├──► public.sales_order_taxes (Order-level tax breakdown: CGST, SGST, VAT)
                   ├──► public.sales_order_discounts (Order-level discounts)
                   ├──► public.sales_order_item_addons (Add-ons contributing to item/order totals)
                   ├──► public.sales_order_payments (Multi-tender breakdown ONLY when part_payments[] provided)
                   └──► public.menu_items (Canonical catalog; food_cost is NULLABLE, never false zero)
                   │
                   ▼
[Data Access Bridge] src/lib/data/*.ts (Returns typed models matching existing contracts)
                   │
                   ▼
[Analytics Engine]   src/lib/analytics/*.ts (Unchanged business rules and metrics; food cost coverage)
```

### Core Architecture Pillars:
1. **Preserve Exact Request Bytes & Parsed JSONB (Integrity vs. Authenticity):** Every delivery is stored with both `raw_body` (`BYTEA NOT NULL`) for byte-for-byte cryptographic verification and `payload` (`JSONB NOT NULL`) for querying. `payload_sha256` is derived from `raw_body` bytes at ingestion (via Node.js `crypto`, avoiding runtime `pgcrypto` bottlenecks). Repeats are flagged as `'duplicate'`, preserving delivery timestamps and headers without queue duplicate processing. The SHA-256 hash proves transmission/storage integrity, not authenticated origin or cryptographic non-repudiation (which is gated by registered `restID` credentials and network security).
2. **Missing Monetary Values vs. Actual Zero:** Missing source monetary values remain `NULL` across all tables, never auto-coerced into zero. Unmapped or uncosted menu items have `menu_items.food_cost = NULL` (never zero). Analytics compute an explicit `food_cost_coverage_pct` rather than reporting inflated false margins.
3. **Independent Financial & Matching Status Models:**
   - Financial reconciliation is tracked via `sales_orders.financial_status` (`'pending'`, `'reconciled'`, `'mismatch'`, `'not_computable'`).
   - Cross-API matching is tracked via `sales_orders.matching_status` (`'unmatched'`, `'matched'`, `'ambiguous_match'`, `'manual_review'`).
4. **PostgreSQL-Compatible Sequential Processing with Active-Lease Blocking & Terminal Exits:**
   - Worker batch claiming ranks **all outstanding events** (`'received'`, `'processing'`, `'failed'`) per order using composite grouping expressions: `(part_rest_id, part_order_ref)` (no delimiter collision hazards).
   - **Active Lease Blocking:** An older event with an active, unexpired lease holds `rn = 1`, blocking any newer events for that order from becoming claimable until the older event completes or its lease expires.
   - **Exhausted Retry Unblocking:** Events reaching 5 attempts transition atomically to `permanently_failed`, immediately exiting `outstanding_events` and preventing bill deadlocks.
   - **Null-Reference Isolation:** Events with `NULL` or empty order references or outlet IDs resolve to isolated keys (`'unidentified_order_' || id`), processing independently without cross-blocking.
   - Combined with `FOR UPDATE SKIP LOCKED`, concurrent workers cannot claim two events for the same order.
5. **Atomic Lease Fencing & Independent Per-Row Tokens:**
   - The batch claim query generates an independent, unique cryptographically random UUID per row via `gen_random_uuid()`.
   - Business mutations and the terminal event status update execute inside a single transaction.
   - The event update requires `WHERE id = :event_id AND lease_token = :my_lease_token`. If 0 rows are affected (lease expired and reclaimed by another worker), the transaction immediately executes `ROLLBACK`, guaranteeing that stale workers never overwrite active database state.
   - Database CHECK constraints enforce that any row in `'processing'` status must have valid `locked_at`, `locked_by`, and `lease_token`. Legacy or malformed leases (`locked_at IS NULL`) are automatically reclaimed by the query.
6. **Delivery Order vs. Source Event Order:** HTTP receipt timestamp (`received_at`) does not represent source POS event order. Processing evaluates source timestamps (`created_on`, `modified_on`). Stale events never overwrite newer order state. Missing, equal, or contradictory timestamps trigger `matching_status = 'manual_review'` without guessing.
7. **Idempotent Replacement vs. Partial Updates:** Full snapshots atomically delete and re-insert child records (`items`, `addons`, `taxes`, `discounts`, `payments`) inside a transaction, while partial/status-only updates touch only order header fields.
8. **Ambiguity Guardrail on Cross-API Matching:** When Get Orders API records match multiple candidates in the matching window, records are never silently merged. The incoming bill is created with `matching_status = 'ambiguous_match'`, candidate IDs are preserved in `matching_evidence`, and the record is surfaced for manual review.
9. **Clean Migration Sequence for Circular References:** Foreign key dependencies between `petpooja_webhook_events.sales_order_id` and `sales_orders.latest_raw_event_id` are created safely using a 3-phase execution (`CREATE TABLE` without constraint $\to$ `CREATE TABLE sales_orders` $\to$ `ALTER TABLE petpooja_webhook_events ADD CONSTRAINT`).
10. **Phase 1 Minimum Reliable Scope & Explicit Mode Safeguard:**
    - To eliminate operational risks during initial live data verification, Phase 1 establishes the minimal reliable database core (`restaurants`, `menu_items`, `sales_orders`, `sales_order_items`, and staging references).
    - **No Automatic Fallback:** Data source selection is explicitly controlled (`DATA_SOURCE=database` vs `mock`). In database mode, missing date ranges render an empty state rather than silently masking data gaps with mock figures.
    - **No Premature Unique Constraints:** `sales_orders` avoids permanent unique constraints on `(restaurant_id, petpooja_order_id, order_date)`, handling de-duplication cautiously at the staging layer.
    - **Protected Pull Operations:** Historical and daily Get Orders API pulls are protected via authenticated cron headers or CLI commands, avoiding unrestricted endpoints.

Detailed relational schemas, indexing strategies, idempotency guarantees, and reconciliation rules with the Get Orders API are specified in `docs/petpooja-integration-guide.md` (Section 10 & 11).

---

## 9. Role-Based Access Control (RBAC) Architecture (Confirmed Specification)

*Status: Architecture Planning & RBAC Specification Finalized (Pending Implementation Approval)*

The application enforces Role-Based Access Control across **three application roles**:
1. **Admin (Owner/Executive):** Full unrestricted access to all business, sales, profitability, operational, manpower, and reporting domains, plus employee master management (`/dashboard/settings/staff`) across all outlets or filtered by outlet.
2. **Manager (Operational Loss Lead):** Dedicated operational management restricted to Wastage & Preparation (`/dashboard/wastage`) and Breakage (`/dashboard/breakage`) for their assigned outlet(s). Prohibited from executive sales, profitability margins, manpower, business reports, and unassigned outlets.
3. **Operator (Floor Data Logger):** Dedicated simplified operational entry interface (`/operator/entry`) for logging daily kitchen food waste and tableware breakage for their assigned outlet. Prohibited from all analytical charts, cost values (₹), record edits/deletions, and unassigned outlets.

### Key Architectural Pillars:
1. **Three Roles vs Employee Directory:** The application does **not** create an application login per physical restaurant employee. It maintains dedicated user accounts (`user_accounts` + `user_outlet_assignments`) assigned to the three roles, completely separate from the internal employee master directory (`employees`).
2. **Dedicated Operator UI (`/operator/entry`):** Operator receives a purpose-built, financial-free entry screen rather than a Manager page with hidden charts, preventing sensitive cost leaks over network props.
3. **Out-of-Scope Clarification:** Attendance marking, approvals, and shift scheduling are explicitly excluded. The existing Manpower analytics page is preserved for **Admin only**.
4. **4-Tier Security & Server-Side Revocation:** Enforced via Edge Middleware (`src/middleware.ts`), PostgreSQL session verification (`user_sessions` token hash check), persistent rate limiting (`login_attempts`), and HTTP-only signed session cookies. On logout, server sessions are marked revoked, preventing replay of copied cookies.

Complete route inventories, action permissions, department linkages, security hardening, and verification reports are documented in [`docs/rbac-audit-and-plan.md`](./rbac-audit-and-plan.md) and [`docs/authentication-phase1-verification.md`](./authentication-phase1-verification.md).

---

## 10. Multi-Outlet Architecture & Organization Hierarchy

*Status: Audit & Architectural Specification Complete (See [`docs/multi-outlet-architecture-audit.md`](./multi-outlet-architecture-audit.md))*

### 10.1 Organization vs. Outlet Hierarchy
1. **Organization:** Represents the overarching business entity (`Ashirvad Gulmohar`). Holds unique ID (UUID), business code, and tax settings.
2. **Outlets:** Individual physical restaurant locations:
   - Kozhikode – Outlet 001 (`KOZ-001`)
   - Kozhikode – Outlet 002 (`KOZ-002`)
   - Bangalore – Outlet 001 (`BLR-001`)
   - Future outlets across regional markets.
3. **Primary Keys & Identifiers:**
   - Database primary keys are internal UUIDs (`gen_random_uuid()`).
   - Human-readable outlet codes (`KOZ-001`) are unique business identifiers.
   - `city` (e.g. `'Kozhikode'`) is an informational attribute column, **never** a primary key or unique identifier. Multiple outlets can reside in the same city.

### 10.2 Server-Side Data Isolation & Zero Trust
- Every operational record (`sales_orders`, `wastage_records`, `breakage_records`, `employees`) carries a mandatory foreign key `outlet_id UUID REFERENCES outlets(id)`.
- Operational entries (`wastage_records`, `breakage_records`) strictly attribute `recorded_by_id UUID REFERENCES user_accounts(id)`, recording the authenticated user account (never arbitrary strings).
- Client-side selection (e.g., query params or cookies) is treated as an **untrusted UI display hint**.
- Server queries and Server Actions resolve authority dynamically from PostgreSQL on every request via `resolveAuthorizedOutletScope(userId, requestedOutletId)`:
  - Admin: Organization-wide access (can query all outlets or a specific validated outlet).
  - Manager: Scoped strictly to their assigned outlets (can switch between assigned outlets; blocked from unassigned outlets). Never assumes `assignedOutletIds[0]`.
  - Operator: Scoped strictly to their single assigned outlet (add-only operational entry; costs computed server-side).
- All database queries inject `where: { outletId }` directly on the server.

### 10.3 Shared Menu & Recipe Master with Outlet Overrides
- **Organization-Level Master:** Categories, Products, Ingredients, and Recipes are defined once at the Organization level (`Ashirvad Gulmohar`), preventing catalog duplication across outlets.
- **Outlet Overrides (`outlet_product_settings`):** Outlets customize selling price (`price_override`), item availability (`is_available`), and terminal mappings (`petpooja_item_id`) without altering core recipes.
- **Food Cost Continuity:** Formulas from `mock_data/business-rules.md` remain intact. Missing ingredient/recipe costs evaluate to `NULL`, never false zero.

### 10.4 Relational Departments & Decoupled Employee Master
- **Outlet-Specific Departments:** `departments` are scoped by `outlet_id UUID REFERENCES outlets(id)`, allowing individual outlets to maintain unique staffing benchmarks and department structures.
- **Decoupled Staff Directory:** `employees` belong to `outlets` and `departments`. They do **not** have application logins, passwords, or session tokens.
- **No Attendance Functionality:** Attendance marking, approvals, and shift scheduling are completely excluded. The `/dashboard/manpower` analytics page remains accessible to Admin only.

### 10.5 Database & Migration Workflow (Local Docker Compose + VPS Production)
- **Status:** Initial Migration Implemented & Verified in Local Docker PostgreSQL.
- **Local Development Environment:**
  - Docker Compose: `compose.yaml` running `postgres:16-alpine` (container: `gulmohar-postgres`, db: `gulmohar_dev`, user: `gulmohar_app`).
  - Prisma Schema: `prisma/schema.prisma` with classic PostgreSQL engine and `DATABASE_URL`.
  - Initial Migration: `prisma/migrations/20261111173938_init_multi_outlet_schema/migration.sql` creating 15 application tables and 2 enum types.
  - Development Commands:
    - `npm run db:migrate` (`npx prisma migrate dev`) — applies schema changes and generates client.
    - `npm run db:status` (`npx prisma migrate status`) — verifies sync status.
    - `npm run db:studio` (`npx prisma studio`) — visual database browser.
- **Production (Hostinger KVM2 VPS):**
  - Self-hosted PostgreSQL 16 on Hostinger KVM2 VPS.
  - Release deployments execute `npm run db:deploy` (`npx prisma migrate deploy`), idempotently executing committed migration history.
- **Supabase Role:** Staging receiver for external POS webhooks only; not the primary application analytics database.
- **Seeding:** Strict separation between `seed.dev.ts` (mock fixtures) and `seed.prod.ts` (org, outlets, admin credentials). Local test data is never transferred to production.

### 10.6 Petpooja Multi-Outlet POS Mapping & Quarantine Pipeline
- POS webhooks deliver external outlet identity in `Restaurant.restID`.
- Observed test ID `53qcgrdis8` belongs to `Petpooja_Rider_Testing` and is **NOT** associated with any production outlet. `petpooja_rest_id` remains `NULL` until official credentials are confirmed.
- Mapped to internal outlets via `outlets.petpooja_rest_id` (Unique, Nullable).
- Incoming events with unmatched `restID` are quarantined with status `unregistered_restaurant` without interrupting active outlet operations.

---

## 11. Manager Module & Dashboard PostgreSQL Integration (Phase 1)

*Status: Implemented & End-to-End Verified (November 2026)*

### 11.1 Header Outlet Selector & Scoping Logic
- **Header Component (`src/components/layout/outlet-selector.tsx`):**
  - Consumes `/api/dashboard/outlets` to dynamically detect the authenticated user's permissions and assigned outlets.
  - **Operator:** Component does not render (Operators use `/operator/entry`).
  - **Single-Outlet Manager:** Renders a static read-only badge indicating their outlet assignment (switching disabled, `canSwitch: false`).
  - **Multi-Outlet Manager:** Renders an interactive dropdown selector listing only their assigned outlets. Switching updates `?outletId=` in URL search parameters.
  - **Admin:** Renders an interactive dropdown selector with all organization outlets plus an "All Outlets (Consolidated)" option.
- **Server Scoping Validation (`src/lib/auth/scope.ts`):**
  - Resolves `resolveAuthorizedOutletScope(user, requestedOutletId)` against PostgreSQL.
  - Unauthorized outlet queries or mutation attempts strictly return `403 Forbidden`.

### 11.2 PostgreSQL CRUD Endpoints for Manager
1. **Wastage Management (`/api/dashboard/wastage`):**
   - `GET`: Returns outlet-filtered wastage records with date range and product filters.
   - `POST`: Creates new wastage records. Computes `unitFoodCost` and `estimatedCost` server-side from `products.food_cost`. Respects strict **NULL-cost policy** (if food cost is not configured, cost is stored as `null`, never 0).
   - `PUT`: Updates existing records with server-side outlet ownership verification and cost recomputation.
   - `DELETE`: Permanently deletes records with server-side outlet ownership verification.
2. **Breakage Management (`/api/dashboard/breakage`):**
   - `GET`: Returns outlet-filtered breakage records with date range and department filters.
   - `POST`: Creates new tableware breakage records scoped to validated outlet departments.
   - **Costing & Financial Security:** Client-supplied cost fields are strictly ignored to prevent cost spoofing. Because the current PostgreSQL schema and master data lack a dedicated tableware replacement cost catalog (tableware item names are free-text strings), the API strictly stores `unit_cost: NULL` and `total_cost: NULL` under the established **NULL-cost policy** (never using invented baselines or hardcoded fallbacks). Migration `20261113132452_make_breakage_cost_nullable` makes `unit_cost` and `total_cost` nullable.
   - `PUT`: Updates existing breakage records with server-side outlet verification. If `unit_cost` was previously set on the record, `total_cost` is recomputed server-side (`unit_cost * broken_qty`); otherwise costs remain strictly NULL.
   - `DELETE`: Deletes breakage records with server-side outlet verification.
   - **Deferred Requirement:** A dedicated tableware / crockery replacement cost catalog (`tableware_items` table or organization master) is required before automatic server-side breakage valuation can occur.

### 11.3 Records Table Database Integration
- `src/components/dashboard/wastage-records-table.tsx` and `src/components/dashboard/breakage-records-table.tsx` were transformed from in-memory state tables to live PostgreSQL client components.
- Upper KPI stat-tiles and summary charts continue reading historical benchmark analytics via `DATA_SOURCE=mock`, cleanly isolating PostgreSQL records tables without impacting existing dashboard analytics.
- Operators attempting to call manager endpoints receive `403 Forbidden`. Manager actions are strictly limited to their assigned outlets.

---

## 12. Admin Module — Master Data Management (Phase 1)

*Status: Implemented & End-to-End Verified (November 2026)*

### 12.1 Overview & Security Guardrails
- **Role Requirement:** Admin only (`role: admin`). Manager and Operator access is strictly blocked at both Next.js edge middleware (`src/middleware.ts` redirects pages and returns `403 Forbidden` on API calls) and server route handler level (`requireUser()` with `session.role !== "admin"` returning HTTP 403).
- **Navigation:** Added to sidebar navigation (`src/components/layout/nav-items.ts`) under "Administration" &rarr; "Master Data" (`/dashboard/master-data`).
- **Organization Scoping:** All master records are scoped to the administrator's organization (`user.organizationId`). Admins cannot view or modify master data across tenant organization boundaries.

### 12.2 Master Data Entities & API Endpoints

1. **Departments (`/api/admin/departments`):**
   - **Schema & Migration:** Supported by `departments` table. Non-destructive migration `20261114074821_add_is_active_to_department_and_ingredient` introduced `is_active BOOLEAN NOT NULL DEFAULT true`.
   - **CRUD Operations:**
     - `GET`: Lists organization departments with outlet names, staff count, and active status. Supports filtering by `outletId` and `isActive`.
     - `POST`: Creates new department associated with a valid organization outlet. Validates uniqueness of `code` within the organization (returns `409 Conflict` on duplicates).
     - `PUT`: Updates department details, benchmark headcount, outlet association, or activation/deactivation status.
   - **Referential Integrity:** Referenced departments cannot be deleted; deactivation is used to preserve operational history for wastage, breakage, and labor tracking.

2. **Products & Menu Catalog (`/api/admin/products`):**
   - **Catalog Hierarchy:** Shared organization-level catalog (`products` table) mapped to organization categories (`categories` table).
   - **Strict NULL-Cost Policy:** If food cost is omitted or unknown, `food_cost` is stored strictly as `NULL` (never defaulting to 0 or arbitrary placeholders). Food cost is used solely for baseline margin calculations and wastage cost valuation.
   - **Outlet Overrides (`outlet_product_settings`):** Products can have outlet-specific pricing, food cost overrides, and active status flags. The API creates and updates these overrides seamlessly.
   - **CRUD Operations:**
     - `GET`: Returns organization products with category relations and outlet overrides.
     - `POST`: Validates category ownership, enforces unique `code` per organization (HTTP 409), and stores default price and optional food cost.
     - `PUT`: Updates dish details, preparation type (`veg`, `non_veg`, `egg`), food cost, and outlet overrides.

3. **Ingredients (`/api/admin/ingredients`):**
   - **Schema & Migration:** Supported by `ingredients` table with `is_active BOOLEAN NOT NULL DEFAULT true` via migration `20261114074821_add_is_active_to_department_and_ingredient`.
   - **CRUD Operations:**
     - `GET`: Returns organization ingredients, unit of measure (`kg`, `ltr`, `pcs`, `gms`, `ml`), current cost per unit, and active status.
     - `POST`: Enforces unique ingredient `code` per organization (HTTP 409).
     - `PUT`: Updates ingredient details, unit cost, and active status.

4. **Recipe Mapping (`/api/admin/recipes`):**
   - **Component Mapping:** Links dishes (`products`) to raw materials (`ingredients`) via `recipe_items` table with `quantity_per_unit`.
   - **CRUD Operations:**
     - `GET`: Lists recipe items for a given `productId` within the organization.
     - `POST`: Adds or updates ingredient quantity per dish unit.
     - `DELETE`: Safely removes an ingredient from a recipe without impacting historical records or master ingredient catalog.
   - **Boundary Enforcement:** Phase 1 establishes component mapping only. Automatic inventory deduction, stock depletion, and complex recipe variance models are deferred to future inventory phases.

### 12.3 Tableware Replacement Cost Audit & Gap
- **Audit Outcome:** Comprehensive database schema audit confirms that `breakage_records` records tableware breakage using a free-text `item` field without a foreign key relation to a tableware master catalog.
- **Handling:** In accordance with architectural boundaries, no unapproved tableware models were introduced in this phase. Tableware breakage records continue to adhere to the strict **NULL-cost policy** established in migration `20261113132452_make_breakage_cost_nullable` until an official tableware catalog is approved and migrated.

---

## 13. Phase 1 Overall Integration Audit & System Status

*Status: Fully Audited, Verified & Production Ready (November 2026)*

### 13.1 Verified System Capabilities
- **Authentication & Durable Sessions:** HMAC-signed session cookies bound to SHA-256 database tokens in PostgreSQL `user_sessions`, with instant server-side revocation on logout, rate limiting in `login_attempts`, and rejection of inactive users.
- **Role-Based Access Control:** Strict 3-role segregation (`admin`, `manager`, `operator`) enforced via edge middleware (`src/middleware.ts`), layout navigation guards, and server-side route handler validations.
- **Operational Persistence:** Operator floor portal (`/operator/entry`) writes wastage and breakage records directly to PostgreSQL with server-side food costing and department outlet scoping.
- **Management Loss-Tracking:** Managers manage wastage and breakage for assigned outlets via interactive PostgreSQL client tables with real-time CRUD and strict outlet isolation.
- **Admin Master Data:** Organization-scoped CRUD for departments, menu products, ingredients, and recipe item mappings with soft-deactivation protection and unique code constraints.
- **Financial Cost Integrity:** Strict **NULL-cost policy** enforced across products, wastage calculations, and tableware breakage. Fallback costs or artificial baselines are never invented.
- **Multi-Outlet Scoping:** Header outlet selector accommodates consolidated/multi-outlet views for Admins, assigned-outlet switching for Managers, and locked floor access for Operators.
- **Static Core Analytics Isolation:** Sales, Profitability, Manpower, and Overview analytics retain high-performance cached loaders (`DATA_SOURCE=mock`) pending VPS deployment, ensuring zero performance regression.

---

## 14. Petpooja POS Sales Integration Architecture (Phase 1 Status & Audit)

*Status: Audit Completed (November 2026)*

### 14.1 Existing Architectural Readiness
- **Ingress Layer:** Global API push webhook (`/api/webhooks/petpooja`) safely receives real-time order payloads and stores the complete raw JSON in Supabase `public.petpooja_webhook_events`. PII (customer phones, GSTIN, addresses) is masked before console logging.
- **Relational Domain Models:** The application PostgreSQL database defines `SalesOrder` (`sales_orders`) and `SalesOrderItem` (`sales_order_items`) linked to `outlets` and `products`.
- **Analytics Separation:** The dashboard sales and profitability calculation engines (`src/lib/analytics/sales.ts`, `src/lib/analytics/profitability.ts`) consume normalized order metrics (`grossSales`, `netSales`, `discount`, `unitPrice`, `quantity`, `foodCost`).

### 14.2 Schema Hardening for Live Ingestion (Task 2 Completed)
- **Database Migration:** Applied non-destructive migration `20261115070600_add_status_and_unique_to_sales_orders`.
- **Order Idempotency Constraint (Resolved):** Added composite unique constraint `@@unique([outletId, petpoojaOrderId])` on `SalesOrder` (`sales_orders_outlet_id_petpooja_order_id_key`). Prevents duplicate order insertion per outlet while allowing the same Petpooja order ID across separate physical outlets.
- **Order Status Tracking (Resolved):** Added `status String @default("Success")` column mapped to `sales_orders.status`. Preserves Petpooja order status ("Success", "Cancelled"), cleanly segregated from internal reconciliation statuses `financial_status` and `matching_status`.
- **Deferred Schema Fields:** `payment_type`, `customer_invoice_id`, and detailed multi-tender breakdowns are deferred to subsequent ingestion/reporting tasks to maintain minimum required scope.

### 14.3 Database-Backed Sales Loaders (Task 4 Completed)
- **Data Loaders Connected (`src/lib/data/sales.ts`, `src/lib/data/sale-items.ts`):**
  - Implemented dual-mode sales and sale-items data access.
  - Default mode (`DATA_SOURCE=mock` or unset): Loads existing `sales.json` and `sale-items.json` cached in-memory.
  - Database mode (`DATA_SOURCE=database`): Loads real sales orders and sale items directly from PostgreSQL `sales_orders` and `sales_order_items` via Prisma Client.
- **Business Rule Enforcement:**
  - Status isolation: Only orders with `status = 'Success'` are returned; cancelled orders are strictly excluded from order volume and revenue calculations.
  - Scoping & filtering: Supports `outletId`, `startDate`, and `endDate` options at the database layer.
  - Zero-Tolerance Silent Fallback: If database queries fail or if unconnected models (e.g. `products.json`) are accessed in `DATA_SOURCE=database` mode, an explicit error is thrown; mock data is never silently substituted.
  - Missing financial data handling: Nullable fields remain `null` or convert to safe numeric values for the `Sale` interface without fabricating arbitrary numbers or false zeros.

### 14.4 Database-Backed Product and Category Loaders (Task 5 Completed)
- **Data Loaders Connected (`src/lib/data/products.ts`, `src/lib/data/categories.ts`):**
  - Connected `getProducts()` and `getCategories()` to PostgreSQL via Prisma Client with full dual-mode support.
  - Default mode (`DATA_SOURCE=mock` or unset): Continues serving static `products.json` and `categories.json` cached in memory.
  - Database mode (`DATA_SOURCE=database`): Queries live `products`, `categories`, and `outlet_product_settings` tables in PostgreSQL.
- **Business Rule Enforcement:**
  - Active/Inactive filtering: `getProducts()` returns only active products (`isActive = true`) by default; supports `includeInactive: true` for administrative/audit contexts.
  - Relational mapping: Joins category relations and resolves canonical `categoryCode` (or `id`) to `category_id`.
  - Outlet overrides: When `outletId` is supplied, applies `OutletProductSetting.priceOverride` and checks `OutletProductSetting.isAvailable`. If marked unavailable for an outlet, `active` evaluates to `false`.
  - Strict NULL-cost policy: Nullable `foodCost` values are strictly preserved as `null`, never defaulted to 0.00.
  - Unit gross margin: Computed as `effectivePrice - (foodCost ?? 0)`.
  - Zero-Tolerance Silent Fallback: In database mode, any query failure throws an explicit `[DATA_SOURCE=database]` error; never silently returns mock data.

### 14.5 Gaps Remaining Prior to Live Ingestion
1. **Live Ingestion Logic:** Neither Get Orders pull client nor Supabase-to-PostgreSQL normalization worker is yet connected to write into `sales_orders`.
2. **Date Range Clarification:** Awaiting Petpooja API documentation confirmation on whether Get Orders API supports single-day queries or requires specific from_date/to_date ranges.
3. **API Key Provisioning:** Live Petpooja production credentials for Kozhikode (`9780nusx`) pending activation.

### 14.7 Operational Data Loaders (Task 7 Completed)
- **Wastage Loader (`src/lib/data/wastage.ts`):**
  - Connected `getWastage(options?: WastageFilterOptions)` to PostgreSQL `wastage_records` via Prisma Client with dual-mode support.
  - Supports `outletId`, `startDate`, and `endDate` query options.
  - Preserves `estimated_cost: null` under strict NULL-cost policy; never forces artificial zero costs.
  - `src/lib/analytics/wastage.ts` updated to safely handle null costs in cost reductions and trend summations.
- **Breakage Loader (`src/lib/data/breakage.ts`):**
  - Connected `getBreakage(options?: BreakageFilterOptions)` to PostgreSQL `breakage_records` via Prisma Client with dual-mode support.
  - Supports `outletId`, `startDate`, and `endDate` query options.
  - Adheres strictly to the NULL-cost policy for breakage (`totalCost: null`); missing costs are never estimated with arbitrary numbers.
  - `src/lib/analytics/breakage.ts` updated to aggregate null-safely without `NaN`.
- **Department Loader (`src/lib/data/departments.ts`):**
  - Connected `getDepartments(options?: DepartmentFilterOptions)` to PostgreSQL `departments` table via Prisma Client.
  - Respects organization and outlet relationships, mapping `departmentCode` to `department_id`, `name`, and `benchmarkHeadcount`.
  - Default active filtering (`isActive = true`), supporting `includeInactive: true`.
- **Preparation Data Isolation (`src/lib/data/preparation.ts`):**
  - `getPreparation()` strictly remains on the verified mock dataset (`preparation.json`).
  - No synthetic preparation records or assumed calculations (`prepared = sold + wasted`) are fabricated.
  - Database-backed preparation logs and batch scheduling are explicitly deferred to Phase 2.

### 14.8 Executive Dashboard and Reports Database Integration (Task 8 Verified)
- **Executive Dashboard (`/dashboard`):**
  - Confirmed live PostgreSQL read capability across Sales (`getSalesSummary`, `getSalesTrend`, `getOrdersTrend`), Product Profitability (`getProductProfitability`), Wastage KPIs (`getWastageInRange`, `getWastageCost`), and Breakage KPIs (`getBreakageInRange`, `getBreakageCost`).
  - Operational Contribution is calculated as $\text{netSales} - \text{foodCost} - \text{wastageCost} - \text{breakageCost} - \text{operatingCosts}$, safely tolerating `null` food costs or breakage replacement costs without `NaN`.
- **Reports Page (`/dashboard/reports`):**
  - Inherits underlying database-backed loaders for all primary transactional domains (Sales, Profitability, Wastage, Breakage).
  - Clearly identifies mixed data sources: preparation totals, employee attendance, and operating costs remain on verified baseline data until Phase 2.
- **CSV Export & Print Operations:**
  - `ReportExportControls` client CSV download generates valid CSV rows containing exact database-derived metrics without formatting corruption.
  - Print functionality (`window.print()`) operational.
  - PDF export remains a prototype action with a toast notification as designed.
- **RBAC & Authorization Preservation:**
  - Admin, Manager, and Operator boundaries, session validation, and server-side outlet scoping (`resolveAuthorizedOutletScope`) remain strictly enforced.

### 14.9 Dashboard Modules PostgreSQL Readiness Status (Updated: Task 8)

| Dashboard Module | Page Route | Current Data Source | PostgreSQL Support | Required Prisma Models | Status & Phase 1 Readiness | Blockers / External Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Wastage & Preparation** | `/dashboard/wastage` | Dual-mode (`mock_data` or PostgreSQL) | **Ready in DB Mode:** Reads from `WastageRecord`, `Product`, `Outlet`. Prep remains on mock baseline. | `WastageRecord`, `Product`, `Outlet` | **Implemented**: Both table and analytics read PostgreSQL when `DATA_SOURCE=database`. | Batch preparation tracking model deferred to Phase 2. |
| **Breakage** | `/dashboard/breakage` | Dual-mode (`mock_data` or PostgreSQL) | **Ready in DB Mode:** Reads from `BreakageRecord`, `Department`, `Outlet`. Strict NULL-cost active. | `BreakageRecord`, `Department`, `Outlet` | **Implemented**: Both table and analytics read PostgreSQL when `DATA_SOURCE=database`. | Tableware master replacement catalog deferred to Phase 2. |
| **Manpower** | `/dashboard/manpower` | Mock JSON (`attendance.json`, `employees.json`, `departments.json`) | None (Analytics read mock JSON exclusively) | `Employee`, `Department`, `Outlet` | **Deferred to Phase 2**: Headcount and payroll can read from `employees` table, but daily swipe/attendance tracking is explicitly deferred. | Live biometric attendance machine / shift integration. |
| **Reports** | `/dashboard/reports` | Composed analytics layer | **Ready in DB Mode:** Composes live Sales, Wastage, Breakage, and Products when in DB mode. | `SalesOrder`, `WastageRecord`, `BreakageRecord` | **Implemented**: Automatically runs on PostgreSQL data for supported domains. | Operating costs (`operating-costs.json`) deferred to Phase 2. |
| **Executive Dashboard** | `/dashboard` | Composed analytics layer | **Ready in DB Mode:** Sales, Wastage, and Breakage modules now fully backed by PostgreSQL. | `SalesOrder`, `Product`, `Category`, `WastageRecord`, `BreakageRecord` | **Implemented**: Core sales, loss tracking, and category KPIs read live database. | Full P&L deferred (operating expenses remain on baseline). |

### 14.10 Financial Data Integrity & Regression Verification (Task 9 & 9.1 Verified)
- **Financial Integrity Audit & Corrections:**
  - **Unknown Financial Values Preserved:** Database loaders (`getSales`, `getProducts`, `getWastage`, `getBreakage`) strictly retain `NULL` when financial metrics are missing or uncomputed. Unknown discounts, core totals, and food costs are never coerced to zero.
  - **Known Zero vs NULL:** A recorded `0` discount (`discountTotal = 0`) is preserved as `0`, allowing net sales derivation (`gross - 0`). A `null` discount remains `null`.
  - **Margin and Profitability Integrity:**
    - Products without a recorded food cost (`food_cost === null`) output `grossMargin: null` and `marginPercentage: null`.
    - Uncosted products are strictly excluded from profitability rankings (`getLossMakingProducts`, `getHighProfitProducts`, `getHighSalesLowMarginProducts`, `getLowSalesLowMarginProducts`).
  - **Incomplete Loss Totals Flagged:**
    - `getWastageCostSummary()` and `getBreakageCostSummary()` compute known subtotals while exposing `isComplete: boolean` and `unknownCostCount: number`.
    - Partial sums are never presented as complete figures.
  - **Estimated Operational Contribution Safety:**
    - If any component (Sales, Food Cost, Wastage, Breakage) contains uncosted records, `getOperationalContributionForRange()` returns `contribution: null` and lists `incompleteComponents`.
    - Strictly prohibited from labeling as "Net Profit".
  - **Export and UI Safety:**
    - Format helpers (`src/lib/format.ts`) safely map `null`/`undefined` to `" — "`.
    - Reports CSV export outputs `"Incomplete"` or `"Incomplete (X.XX known)"` instead of false `"0.00"`.
- **Regression Suite Execution & Results:**
  - **Authentication Unit / Security (`prisma/seeds/test-auth.ts`):** 12/12 passing tests.
  - **Database Runtime Engine (`prisma/seeds/verify-runtime.ts`):** 17/17 passing tests.
  - **HTTP Endpoints & Rate Limiting (`prisma/seeds/verify-http-endpoints.ts`):** 31/31 passing tests.
  - **Operator Floor API (`prisma/seeds/verify-operator-api.ts`):** 28/28 passing tests. (Root cause of initial test failure diagnosed as test harness server not running on port 3099; verified green once targeted test dev server was active).
  - **Manager Multi-Outlet Scoping & Loss CRUD (`prisma/seeds/verify-manager-api.ts`):** 46/46 passing tests.
  - **Admin Master Data Management (`prisma/seeds/verify-admin-master-data.ts`):** 41/41 passing tests.
  - **Financial Data Integrity & Dashboard Integration:** 40/40 passing assertions.
  - **Overall Regression Total:** 215 tests executed across 7 suites, 215 passed, 0 failed.
- **Database Cleanup:** All test fixtures safely removed. Verified 0 leftover business rows across `sales_orders`, `sales_order_items`, `wastage_records`, and `breakage_records`.

### 14.11 Deferred Scope Checklist (Phase 2 & Phase 3)
**Phase 2:**
- [ ] Daily kitchen preparation logs and batch schedule tracking (`preparation_logs` model).
- [ ] Dedicated tableware / crockery replacement cost catalog (`tableware_items` table).
- [ ] Attendance swipe logs and biometric shift tracking (Phase 2 HR/Manpower).
- [ ] General ledger / operating overhead expense ledger (`operating_expenses` table).
- [ ] Automated real-time stock deduction on order arrival (Phase 2 Inventory).
- [ ] Recipe-based ingredient depletion for sales orders (Phase 2 Inventory).
- [ ] Supplier purchase orders and procurement reconciliation (Phase 2 Supply Chain).
- [ ] Complex multi-tender reconciliation dashboards and gateway settlement tracking (Phase 2 Finance).

**Phase 3:**
- [ ] Demand forecasting and AI predictive preparation recommendations.