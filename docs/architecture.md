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
                                          src/lib/data (same function names)
                                                              │
                                                              ▼
                                              src/lib/analytics (unchanged)
                                                              │
                                                              ▼
                                                   Dashboard (unchanged)
```

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
