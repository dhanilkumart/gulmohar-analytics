# UI Integration Contract (Lovable UI ↔ Existing Next.js App)

This document was produced by inspecting the actual current contents of
`src/types/`, `src/lib/data/`, `src/lib/analytics/`, `src/components/`,
`src/app/`, `docs/architecture.md`, and `mock_data/` on 2026-09-11. Every
function, field, and route named below was verified by reading the file
it lives in — nothing here is assumed or carried over from an earlier
summary.

**Update (same date):** following the V1 scope decision, the
well-defined analytics gaps identified below have been implemented (new
functions in existing analytics files, plus one new file,
`src/lib/analytics/comparison.ts`). Every such item is now marked
**IMPLEMENTED** in place, with its function name. Items that were
explicitly deferred (breakage trend, preparation recommendation, sales
vs. manpower, department efficiency, last-year comparison, generic
management insights) remain marked **DEFERRED** or **NOT SUPPORTED** and
were not built — see §6. No UI, routes, or components were changed by
that update, only `src/lib/analytics/*` and this document.

## 1. Purpose

The dashboard UI is going to be designed separately in Lovable and
integrated into this Next.js project afterward. This document is the
map used to do that integration correctly:

- what data the existing analytics layer can already produce,
- what shape that data comes in,
- which planned UI components that does and doesn't cover yet,
- and the boundary the Lovable UI must respect (never touch
  `mock_data/` or raw `sales.json`/`sale-items.json` directly).

It intentionally does not add, redesign, or rewire anything.

## 2. Current Architecture Summary

```
mock_data/*.json  →  src/lib/data/*.ts  →  src/lib/analytics/*.ts  →  (not yet built) UI
```

- `src/lib/data/` — one `getX()` per dataset, each `async`, each reading
  its JSON file from `mock_data/` via a shared cached loader
  (`src/lib/data/reader.ts`). Every file is marked `import "server-only"`.
- `src/lib/analytics/` — pure aggregation functions on top of the data
  layer, implementing the formulas in `mock_data/business-rules.md`.
  Also all `server-only`.
- `src/app/dashboard/*` — 7 routes exist today, each rendering a
  `PlaceholderCard` only (verified in §11). No page currently calls the
  analytics layer.
- `src/components/layout/` and `src/components/dashboard/` — sidebar,
  header, page container, and two generic shells (`MetricCard`,
  `ChartContainer`) with no data wired in.

Full detail: `docs/architecture.md` (unchanged by this task).

## 3. Analytics Function Inventory

All functions below were read directly from their source files. Every
one is exported from `src/lib/analytics/index.ts` via `export *`, so all
are importable from `@/lib/analytics`.

### `src/lib/analytics/date-range.ts`

| | |
|---|---|
| **Types** | `DateRangePreset`, `DateRange { from: string; to: string }`, `DateRangeSelection { preset; custom? }` |
| **`resolveDateRange(selection, referenceDate = new Date())`** | Returns `DateRange`. Turns a preset (or `custom`) into concrete `{from, to}` ("YYYY-MM-DD", inclusive). Pure, synchronous, no dataset access. |
| **`isWithinDateRange(date, range)`** | Returns `boolean`. |
| **`filterByDateRange(items, range, getDate)`** | Returns `T[]`. Generic filter helper. |
| **`resolveTrendGranularity(range)`** *(IMPLEMENTED)* | Returns `"day" \| "week"` — daily buckets up to a 31-day span, weekly beyond that. A charting-readability default, not a business rule; every trend function accepts an explicit override. |
| **`getPeriodKey(date, granularity)`** *(IMPLEMENTED)* | Returns the trend bucket key for a date (the date itself for `"day"`, the Monday-anchored week start for `"week"`). |
| **`enumeratePeriods(range, granularity)`** *(IMPLEMENTED)* | Returns every period key in the range, in order, so trend functions can zero-fill periods with no matching records instead of leaving gaps. |
| **`sumByPeriod(items, granularity, getDate, getValue)`** *(IMPLEMENTED)* | Returns `Map<string, number>` — the one shared "group records by period and sum" helper reused by every `*Trend` function (sales, orders, wastage, wastage %, attendance). |
| **`getPreviousPeriodRange(range)`** *(IMPLEMENTED)* | Returns the immediately preceding `DateRange` of the same length (e.g. March 1–7 → Feb 22–28). Powers previous-*period* comparison only — no previous-*year* equivalent exists (§7). |
| Datasets used | None (date math only). |

### `src/lib/analytics/sales.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getSalesInRange(range)` | `DateRange` | `Promise<Sale[]>` | `sales.json` |
| `getSaleItemsInRange(range)` | `DateRange` | `Promise<SaleItem[]>` | `sales.json` (to resolve bill_ids in range) + `sale-items.json` |
| `getGrossSales(sales)` | `Sale[]` | `number` | — |
| `getNetSales(sales)` | `Sale[]` | `number` | — |
| `getTotalDiscount(sales)` | `Sale[]` | `number` | — |
| `getOrderCount(sales)` | `Sale[]` | `number` | — |
| `getItemQuantitySold(saleItems)` | `SaleItem[]` | `number` | — |
| `getSalesSummary(range)` | `DateRange` | `Promise<SalesSummary>` | both above |
| `getSalesTrend(range, granularity?)` *(IMPLEMENTED)* | `DateRange`, `TrendGranularity?` (defaults via `resolveTrendGranularity`) | `Promise<SalesTrendPoint[]>` — `{ period, netSales }[]`, zero-filled | `sales.json` |
| `getOrdersTrend(range, granularity?)` *(IMPLEMENTED)* | same | `Promise<OrdersTrendPoint[]>` — `{ period, orderCount }[]`, zero-filled | `sales.json` |
| `getSalesByOrderType(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<SalesByOrderType[]>` — `{ orderType, netSales, orderCount }[]`, groups derived from actual data | `sales.json` |
| `getSalesByPaymentMethod(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<SalesByPaymentMethod[]>` — `{ paymentMethod, netSales, orderCount }[]`, groups derived from actual data | `sales.json` |
| `getHourlySales(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<HourlySales[]>` — `{ hour: 0-23, netSales, orderCount }[]`, all 24 hours zero-filled | `sales.json`, parses `Sale.time` |

`SalesSummary = { range, orderCount, grossSales, netSales, totalDiscount, itemQuantitySold }`

Business meaning: net sales = gross − discount (business-rules.md line 2). Date-range behavior: inclusive `[from, to]` filter on `Sale.date`; `getSaleItemsInRange` has **no date field of its own** on `SaleItem` — it joins through `sales.bill_id`. **Previous-*period* comparison** is now supported via `getPreviousPeriodRange` + `comparePeriodValues` (§7/§9) — no function computes it automatically, callers compose it by calling the same function twice.

### `src/lib/analytics/profitability.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getFoodCost(saleItems, products)` | `SaleItem[]`, `Product[]` | `number` | (pure, pre-fetched inputs) |
| `getGrossFoodMargin(netSales, foodCost)` | `number, number` | `number` | (pure) |
| `getProductProfitability(range)` | `DateRange` | `Promise<ProductProfitability[]>` | `sale-items.json` via `getSaleItemsInRange`, `products.json` |
| `getLossMakingProducts(productProfitability)` | `ProductProfitability[]` | `ProductProfitability[]` (filtered `grossMargin < 0`, sorted ascending) | — |
| `getHighProfitProducts(productProfitability, limit = 10)` | `ProductProfitability[], number` | `ProductProfitability[]` (top by `grossMargin`) | — |
| `getHighSalesLowMarginProducts(productProfitability, options?)` | `ProductProfitability[]`, `{ volumePercentile?=0.75, marginPercentageThreshold?=25 }` | `ProductProfitability[]` | — |
| `getLowSalesLowMarginProducts(productProfitability, options?)` *(IMPLEMENTED)* | `ProductProfitability[]`, `{ volumePercentile?=0.25, marginPercentageThreshold?=25 }` | `ProductProfitability[]` (bottom-quartile volume by default, sorted ascending) | — |

`ProductProfitability = { productId, name, categoryId, quantitySold, revenue, foodCost, grossMargin, marginPercentage }`

`getLowSalesLowMarginProducts` mirrors `getHighSalesLowMarginProducts` exactly — same threshold-pair convention, `volumePercentile` interpreted from the bottom instead of the top. Verified against the full mock-data year: at the default 25% margin threshold it correctly returns an empty list (no product in this dataset is both low-volume and low-margin — margins range 23.5%–72.2% across all 60 products, and the one product under 25% margin, "Meals", is high-volume, not low-volume), confirmed by relaxing the threshold in a throwaway check and seeing expected products appear.

Business meaning: food cost = sold qty × product food cost; gross food margin = net sales − food cost (business-rules.md lines 3–4). `getProductProfitability` is per-product for the given range — it does **not** return one blended range-level number; the range-level food cost/margin come from `summary.ts` / `getFoodCost` called directly. Date-range behavior: same join-through-sales pattern as `sales.ts`. No comparison-period support.

### `src/lib/analytics/preparation.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getPreparationInRange(range)` | `DateRange` | `Promise<Preparation[]>` | `preparation.json` |
| `getPreparationVsSoldVsWasted(range)` | `DateRange` | `Promise<PreparationTotals[]>` | `preparation.json` |
| `getPreparationHistory(productId)` | `string` | `Promise<Preparation[]>` (sorted by date, **no date-range parameter — returns full history**) | `preparation.json` |
| `getWastagePercentageTrend(range, granularity?)` *(IMPLEMENTED)* | `DateRange`, `TrendGranularity?` | `Promise<WastagePercentageTrendPoint[]>` — `{ period, preparedQuantity, wastedQuantity, wastagePercentage }[]`, zero-filled | `preparation.json` |

`PreparationTotals = { productId, preparedQuantity, soldQuantity, wastedQuantity, wastagePercentage, sellThroughPercentage }`

Business meaning: wastage % = wasted/prepared × 100; sell-through % = sold/prepared × 100 (business-rules.md lines 6–7). **Only covers the 8 products present in `preparation.json`** (confirmed in `docs/architecture.md` §3.2 and by the type comment in `src/types/preparation.ts`). `getPreparationHistory` is per-product, not range-scoped — a caller wanting a bounded history must filter the returned array itself. `getWastagePercentageTrend` sums prepared and wasted quantities per period **first**, then divides — reconciled against a naive average-of-daily-percentages calculation in a throwaway check and confirmed to differ (22.44% weighted vs. 22.55% naive average on the same sample week), i.e. it is not silently averaging percentages.

### `src/lib/analytics/wastage.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getWastageInRange(range)` | `DateRange` | `Promise<Wastage[]>` | `wastage.json` |
| `getWastageCost(wastage)` | `Wastage[]` | `number` | — |
| `getWastageTrend(range, granularity?)` *(IMPLEMENTED)* | `DateRange`, `TrendGranularity?` | `Promise<WastageTrendPoint[]>` — `{ period, wastageCost }[]`, zero-filled | `wastage.json` |
| `getWastageByProduct(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<WastageByProduct[]>` — `{ productId, productName, wastedQuantity, wastageCost, wastagePercentage }[]` | `wastage.json`, composes `getPreparationVsSoldVsWasted` (preparation.ts) for quantity/%, `products.json` for name |
| `getWastageByReason(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<WastageByReason[]>` — `{ reason, wastedQuantity, wastageCost }[]`, groups derived from actual `Wastage.reason` values | `wastage.json` |

Business meaning: wastage cost = wasted qty × product food cost, already pre-computed as `Wastage.estimated_cost` in the mock data (verified in the original data inspection; business-rules.md line 5). `getWastageByProduct` and `getWastageByReason` totals were reconciled against `getWastageCost` on the same range and matched exactly (see §Testing in the implementation task). All wastage functions remain scoped to the 8 preparation-tracked products (§7) — not restaurant-wide.

### `src/lib/analytics/breakage.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getBreakageInRange(range)` | `DateRange` | `Promise<Breakage[]>` | `breakage.json` |
| `getBreakageCost(breakage)` | `Breakage[]` | `number` | — |
| `getBreakageByDepartment(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<BreakageByDepartment[]>` — `{ departmentId, departmentName, eventCount, breakageCost }[]` | `breakage.json`, joined to `departments.json` for the name |
| `getBreakageByItem(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<BreakageByItem[]>` — `{ item, eventCount, quantity, breakageCost }[]`, `item` is free text (not a product FK) | `breakage.json` |
| `getHighestCostBreakageDepartment(range)` *(IMPLEMENTED)* | `DateRange` | `Promise<BreakageByDepartment \| null>` — composes `getBreakageByDepartment`, `null` when there's no breakage in range | `breakage.json` |

Reconciled: `getBreakageByDepartment`/`getBreakageByItem` cost sums and `getBreakageByDepartment` event-count sum both matched `getBreakageCost`/`getBreakageInRange(range).length` on the same range exactly. **Breakage trend was intentionally NOT implemented** — deferred per the V1 scope decision (§6).

### `src/lib/analytics/attendance.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getAttendanceInRange(range)` | `DateRange` | `Promise<Attendance[]>` | `attendance.json` |
| `getAttendanceSummary(attendance)` | `Attendance[]` | `AttendanceSummary` | — |
| `getAttendanceTrend(range, granularity?)` *(IMPLEMENTED)* | `DateRange`, `TrendGranularity?` | `Promise<AttendanceTrendPoint[]>` — `{ period, presentCount, absentCount, leaveCount, attendanceRate }[]`, zero-filled | `attendance.json` |

`AttendanceSummary = { presentCount, absentCount, leaveCount, attendanceRate, totalWorkingHours, averageWorkingHoursPerPresentDay }`

`attendanceRate` = presentCount / total records × 100 — `getAttendanceTrend` uses the identical formula per-period, so it's consistent with `getAttendanceSummary` by construction, not a separate definition. No per-employee or per-department breakdown function exists.

### `src/lib/analytics/manpower.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getDepartmentManpower()` | none | `Promise<DepartmentManpower[]>` | `departments.json`, `employees.json` (filters `employment_status === "active"`) |
| `getTotalMonthlyLaborCost()` | none | `Promise<number>` | `employees.json` |

`DepartmentManpower = { departmentId, name, benchmarkHeadcount, actualHeadcount, variance, monthlyLaborCost }`

**Neither function takes a `DateRange`.** Headcount and labor cost are current-snapshot/monthly figures, not date-filterable — `employees.json` has no hire/termination dates and no daily attendance-linked cost. `monthlyLaborCost` sums `Employee.monthly_salary`, not a range-prorated figure.

### `src/lib/analytics/operating-costs.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getOperatingCostsInRange(range)` | `DateRange` | `Promise<OperatingCost[]>` | `operating-costs.json` |
| `getTotalOperatingCosts(operatingCosts)` | `OperatingCost[]` | `number` | — |

### `src/lib/analytics/operational-contribution.ts`

| Function | Params | Returns |
|---|---|---|
| `getEstimatedOperationalContribution(inputs)` | `{ netSales, foodCost, wastageCost, breakageCost, operatingCosts }` | `number` |

Pure function, `netSales − foodCost − wastageCost − breakageCost − operatingCosts` (business-rules.md line 8). The file's own comment states this must never be labeled "net profit" (line 9) — see §7.

### `src/lib/analytics/comparison.ts` *(new file, IMPLEMENTED)*

| Function | Params | Returns |
|---|---|---|
| `comparePeriodValues(current, previous)` | `number, number` | `PeriodComparison = { current, previous, difference, percentageChange }` |

`percentageChange` is `null` (not `0` or `Infinity`) when `previous` is 0 — verified with both a `previous = 0` case and a `current = previous = 0` case. This is a generic numeric helper, not date-aware itself; pair it with `getPreviousPeriodRange` (date-range.ts) to build an actual period-over-period comparison — see §8/§9 for the composition pattern. Reconciled example: for the range 2025-12-01–2025-12-07, `getPreviousPeriodRange` correctly resolves to 2025-11-24–2025-11-30, and `comparePeriodValues` on the two periods' `getSalesSummary(...).netSales` produced a correct difference and percentage change.

### `src/lib/analytics/summary.ts`

| Function | Params | Returns | Uses |
|---|---|---|---|
| `getOperationalContributionForRange(range)` | `DateRange` | `Promise<OperationalContributionForRange>` | `sales.json`, `sale-items.json`, `products.json`, `wastage.json`, `breakage.json`, `operating-costs.json` (composes nearly every other file above) |

`OperationalContributionForRange = { range, netSales, foodCost, wastageCost, breakageCost, operatingCosts, contribution }`

This is the single richest "give me the headline numbers for a range" call currently in the codebase.

### Confirmed absent (do not assume these exist)

Deliberately not implemented, per the V1 scope decision (§6): breakage trend (day/week bucketing of breakage cost); the preparation-recommendation engine described in `business-rules.md` line 10 (the same-weekday/recent-average/trend/safety-buffer formula is not defined); "sales vs. manpower" (no department-attributed sales data, no defined labor-cost prorating rule); "department efficiency" (no defined formula — `manpower.ts` still exposes only `actualHeadcount`, `benchmarkHeadcount`, `variance`, `monthlyLaborCost`); previous-*year* comparison (the mock dataset spans exactly one year); and a generic Management Insights/narrative engine (only the two threshold-free, already-supported insights from §6 are exposed — see there).

## 4. UI-to-Analytics Mapping

Legend for **Available?**: **A** = already available as-is, **B** =
available by composing/reshaping existing function output, **C** =
requires a new analytics function, **D** = requires a business/product
decision first, **E** = not possible with current data. Rows updated to
**A** below carry an *(IMPLEMENTED)* tag naming the new function; rows
still marked **C**/**D** were explicitly deferred in the V1 scope
decision and remain unimplemented (§6).

### Executive Dashboard (`/dashboard`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Net Sales KPI | `getSalesSummary` or `getOperationalContributionForRange` | `.netSales` | A | |
| Orders KPI | `getSalesSummary` | `.orderCount` | A | |
| Food Cost KPI | `getOperationalContributionForRange` | `.foodCost` | A | |
| Wastage KPI | `getOperationalContributionForRange` or `getWastageCost(getWastageInRange(range))` | `.wastageCost` | A | |
| Estimated Operational Contribution KPI | `getOperationalContributionForRange` | `.contribution` | A | Must display as "estimated operational contribution", never "net profit" (§7). |
| Sales Trend (chart over time) | `getSalesTrend` *(IMPLEMENTED)* | — | A | Daily or weekly, auto-selected by range span. |
| Category Performance | `getProductProfitability` | group its rows by `categoryId` | B | Field exists per-product; no function sums by category (unchanged — not in V1 scope). |
| Top Performing Items | `getHighProfitProducts` | — | A | |
| Items Needing Attention | `getLossMakingProducts` + `getHighSalesLowMarginProducts` | — | B | Two existing lists; no single combined function (unchanged). |
| Food Preparation & Wastage | `getPreparationVsSoldVsWasted` | — | A | Only the 8 tracked products (§7). |
| Manpower Overview | `getDepartmentManpower` + `getAttendanceSummary` | — | B | Two existing functions, not pre-combined (unchanged). |
| Breakage Summary | `getBreakageCost(getBreakageInRange(range))` + array length | — | B | Cost is A; "summary" (count, avg) needs simple arithmetic on top (unchanged). |
| Management Insights | `getHighSalesLowMarginProducts`, `DepartmentManpower.variance` *(IMPLEMENTED, limited)* | — | A (2 insights only) | Only the two threshold-free insights approved for V1 — see §6. No narrative/general insights engine. |
| Preparation Recommendation | none | recommended prep qty per product | **DEFERRED** | business-rules.md line 10 specifies the intended method, but the safety buffer and combination formula are undefined — not built (§6). |

### Sales Analytics (`/dashboard/sales`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Sales KPI cards | `getSalesSummary` | gross/net/discount/orders/items | A | |
| Sales trend | `getSalesTrend` *(IMPLEMENTED)* | — | A | |
| Orders trend | `getOrdersTrend` *(IMPLEMENTED)* | — | A | |
| Hourly sales | `getHourlySales` *(IMPLEMENTED)* | — | A | 24 hours, zero-filled. |
| Category performance | `getProductProfitability` grouped | — | B | Unchanged — not in V1 scope. |
| Order type performance | `getSalesByOrderType` *(IMPLEMENTED)* | — | A | Groups derived from actual data (Dine-in/Delivery/Takeaway observed). |
| Payment method distribution | `getSalesByPaymentMethod` *(IMPLEMENTED)* | — | A | Groups derived from actual data (Cash/Card/UPI observed). |
| Product performance table | `getProductProfitability` | quantitySold, revenue | A | |

### Profitability (`/dashboard/profitability`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Revenue | `getSalesSummary`/`getOperationalContributionForRange` | netSales (or grossSales) | A | "Revenue" is not itself a business-rules.md term; map to gross or net sales explicitly. |
| Food cost | `getFoodCost` / `getOperationalContributionForRange` | — | A | |
| Gross food margin | `getGrossFoodMargin` / derivable from summary | — | A | |
| Margin % | none directly at range level | `grossFoodMargin / netSales * 100` | B | Per-product `marginPercentage` exists on `ProductProfitability`; a single range-level % needs one division on already-available totals. |
| Profitability matrix (volume vs. margin) | `getProductProfitability` | — | B | Data exists per product; no function labels quadrants. |
| Most profitable products | `getHighProfitProducts` | — | A | |
| High-sales/low-margin products | `getHighSalesLowMarginProducts` | — | A | Thresholds are configurable, documented defaults (§7). |
| Low-sales/low-margin products | `getLowSalesLowMarginProducts` *(IMPLEMENTED)* | — | A | Same threshold-pair convention, mirrored for the low-volume side (§7). |
| Loss-making products | `getLossMakingProducts` | — | A | |
| Product profitability table | `getProductProfitability` | — | A | |

### Wastage & Preparation (`/dashboard/wastage`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Prepared / Sold / Wasted quantity | `getPreparationVsSoldVsWasted` | — | A | 8 tracked products only. |
| Wastage cost | `getWastageCost` | — | A | |
| Wastage % | `PreparationTotals.wastagePercentage` | — | A | |
| Sell-through % | `PreparationTotals.sellThroughPercentage` | — | A | |
| Wastage trend | `getWastageTrend` *(IMPLEMENTED)* | — | A | 8 tracked products only. |
| Wastage by product (cost) | `getWastageByProduct` *(IMPLEMENTED)* | — | A | Composes `getPreparationVsSoldVsWasted` for quantity/%, joined with product names. |
| Wastage by reason | `getWastageByReason` *(IMPLEMENTED)* | — | A | Groups derived from actual `Wastage.reason` values. |
| Prepared vs sold by day | `getPreparationInRange` | raw daily rows | B | Unchanged — `Preparation.json` rows are already daily-granular; charting is reshaping, not new aggregation logic. |
| Wastage percentage trend | `getWastagePercentageTrend` *(IMPLEMENTED)* | — | A | Aggregates prepared/wasted quantities per period first, then divides (not an average of daily %s). |
| Preparation recommendation | none | — | **DEFERRED** | Safety buffer and combination formula undefined (§6) — not built. |

### Manpower (`/dashboard/manpower`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Total employees | `getDepartmentManpower` (sum `actualHeadcount`) or a new `getEmployees().length` | — | B | |
| Present / Absent / Leave | `getAttendanceSummary` | — | A | |
| Attendance % | `AttendanceSummary.attendanceRate` | — | A | |
| Labor cost | `getTotalMonthlyLaborCost` / `DepartmentManpower.monthlyLaborCost` | — | A | Monthly only (§7). |
| Attendance trend | `getAttendanceTrend` *(IMPLEMENTED)* | — | A | Present/absent/leave counts + rate, per period. |
| Department headcount | `getDepartmentManpower` | — | A | |
| Actual vs. benchmark | `DepartmentManpower.{actualHeadcount, benchmarkHeadcount, variance}` | — | A | |
| Sales vs. manpower | none | cross-dataset comparison | **NOT SUPPORTED** | No department-attributed sales data and no defined labor-cost prorating rule — explicitly not built (§6). |
| Department efficiency | none | undefined metric | **NOT SUPPORTED** | "Efficiency" has no defined formula — explicitly not built; use headcount variance and labor cost instead (§6). |

### Breakage (`/dashboard/breakage`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Breakage cost | `getBreakageCost` | — | A | |
| Breakage events (count) | `getBreakageInRange(range).length` | — | B | |
| Average cost/event | `getBreakageCost / count` | — | B | Simple arithmetic on two existing values. |
| Highest-cost department | `getHighestCostBreakageDepartment` *(IMPLEMENTED)* | — | A | Composes `getBreakageByDepartment` (max), returns `null` when no breakage in range. |
| Breakage trend | none | daily/weekly series | **DEFERRED** | Explicitly deferred per the V1 scope decision (§6) — technically straightforward, held back on prioritization, not a data/definition gap. |
| Breakage by department | `getBreakageByDepartment` *(IMPLEMENTED)* | — | A | Joined to department names. |
| Breakage by item | `getBreakageByItem` *(IMPLEMENTED)* | — | A | `item` remains free text, not a product FK. |
| Breakage frequency | `getBreakageByItem` / `getBreakageByDepartment` `.eventCount` *(IMPLEMENTED)* | — | A | Covered by the `eventCount` field on both grouping functions. |
| Breakage table | `getBreakageInRange` | raw rows | A | Returns exactly `item`, `quantity`, `estimated_cost`, `department_id`, `reason`, `date` per row. |

### Reports (`/dashboard/reports`)

| UI Component | Existing Function(s) | Required Data | Available? | Notes |
|---|---|---|---|---|
| Daily report | `resolveDateRange({preset:"today"})` + `getOperationalContributionForRange`/`getSalesSummary` | — | B | Presets exist; no bundled "report" function — page composes several calls. |
| Weekly report | `resolveDateRange({preset:"thisWeek"|"lastWeek"})` + same | — | B | |
| Monthly report | `resolveDateRange({preset:"thisMonth"|"lastMonth"})` + same | — | B | |
| Yearly report | `resolveDateRange({preset:"thisYear"})` + same | — | B | No "lastYear" preset exists (§9). |
| Custom range report | `resolveDateRange({preset:"custom", custom:{from,to}})` + same | — | B | |
| Previous-period comparison (e.g. "vs. last week") | `getPreviousPeriodRange` + `comparePeriodValues` *(IMPLEMENTED)* | — | B | Reusable primitives, not a single "report" call — a page/function composes them per metric (§9). |
| Previous-year comparison | none | — | **NOT SUPPORTED** | Mock dataset spans exactly one year — no prior year exists to compare against (§7). |

## 5. Data Availability Matrix (by dataset)

| Dataset | Accessor | Analytics coverage | Confirmed limitation |
|---|---|---|---|
| `restaurant.json` | `getRestaurant()` | Not used by any analytics function | Metadata only |
| `departments.json` | `getDepartments()` | `getDepartmentManpower()` | — |
| `categories.json` | `getCategories()` | Not directly used by any analytics function (only `category_id` passed through on `ProductProfitability`) | Category *names* must be joined by the caller |
| `products.json` | `getProducts()` | `getFoodCost`, `getProductProfitability`, `getOperationalContributionForRange` | `food_cost` is the trusted source (§7) |
| `ingredients.json` | `getIngredients()` | Not used by any analytics function | — |
| `recipes.json` | `getRecipes()` | Not used by any analytics function | Only 5 of 60 products have a recipe (§7) |
| `employees.json` | `getEmployees()` | `getDepartmentManpower`, `getTotalMonthlyLaborCost` | Monthly salary only, no hourly rate |
| `sales.json` | `getSales()` | `sales.ts` (incl. trend/order-type/payment-method/hourly), `profitability.ts`, `summary.ts` | Never exposed raw to UI (§10) |
| `sale-items.json` | `getSaleItems()` | `sales.ts`, `profitability.ts`, `summary.ts` | Never exposed raw to UI (§10) |
| `preparation.json` | `getPreparation()` | `preparation.ts` (incl. wastage % trend) | 8 of 60 products only |
| `wastage.json` | `getWastage()` | `wastage.ts` (incl. trend, by-product, by-reason), `summary.ts` | Grouping by product/reason now implemented; still scoped to the 8 tracked products |
| `breakage.json` | `getBreakage()` | `breakage.ts` (incl. by-department, by-item, highest-cost department), `summary.ts` | Grouping now implemented; `item` is still free text, not linked to `products.json`; trend intentionally not implemented (§6) |
| `attendance.json` | `getAttendance()` | `attendance.ts` (incl. trend) | No per-employee/per-department breakdown function |
| `operating-costs.json` | `getOperatingCosts()` | `operating-costs.ts`, `summary.ts` | Only "Utilities" and "Gas" cost types exist |

## 6. Identified Gaps — IMPLEMENTED / DEFERRED / NOT SUPPORTED

Following the V1 scope decision, every well-defined gap from the
original review was implemented. This section now records what was
actually built vs. what remains deliberately out of scope.

### IMPLEMENTED (this update)

All of the following were genuinely missing only a *function*, not data
or a definition — confirmed by inspection and, in every case, verified
against the real mock data (reconciliation checks in the implementation
task: trend totals matched their corresponding existing aggregates
exactly; group-by totals matched their corresponding cost/count totals
exactly):

- Sales trend — `getSalesTrend` (sales.ts)
- Orders trend — `getOrdersTrend` (sales.ts)
- Sales by order type — `getSalesByOrderType` (sales.ts)
- Sales by payment method — `getSalesByPaymentMethod` (sales.ts)
- Hourly sales — `getHourlySales` (sales.ts)
- Wastage trend — `getWastageTrend` (wastage.ts)
- Wastage by product — `getWastageByProduct` (wastage.ts)
- Wastage by reason — `getWastageByReason` (wastage.ts)
- Wastage percentage trend — `getWastagePercentageTrend` (preparation.ts)
- Attendance trend — `getAttendanceTrend` (attendance.ts)
- Breakage by department — `getBreakageByDepartment` (breakage.ts)
- Breakage by item — `getBreakageByItem` (breakage.ts)
- Highest-cost breakage department — `getHighestCostBreakageDepartment` (breakage.ts)
- Low-sales/low-margin products — `getLowSalesLowMarginProducts` (profitability.ts)
- Previous-period comparison — `getPreviousPeriodRange` (date-range.ts) + `comparePeriodValues` (comparison.ts)
- Management Insights (the two threshold-free ones only) — already-existing `getHighSalesLowMarginProducts` and `DepartmentManpower.variance`; no new function needed, just confirmed and documented as the supported insight data

### DEFERRED (explicitly not built — technical gap, not a data/definition gap)

- **Breakage trend** — day/week bucketing of breakage cost would be
  straightforward (same pattern as the other trend functions), but was
  held back on prioritization per the V1 scope decision, not because of
  a data or definition problem.

### NOT SUPPORTED (business/product decision or missing data — do not implement without one)

- **Preparation recommendation engine** — business-rules.md line 10
  names the four inputs (same-weekday history, recent average, trend,
  safety buffer) but defines neither the safety buffer value nor the
  formula combining them. Not built.
- **Sales vs. manpower** — no department-attributed sales data exists,
  and there is no defined rule for prorating `Employee.monthly_salary`
  to a date range. Not built.
- **Department efficiency** — no formula for "efficiency" is defined
  anywhere. The supported manpower metrics remain exactly
  `actualHeadcount`, `benchmarkHeadcount`, `variance`, and
  `monthlyLaborCost` (manpower.ts, unchanged).
- **Previous-year comparison** — the mock dataset spans exactly one year
  (`restaurant.json.data_period`); there is no prior year to compare
  against. `getPreviousPeriodRange` deliberately has no year-mode.
- **Generic Management Insights / narrative engine** — everything beyond
  the two threshold-free insights (high-sales/low-margin,
  department-over-benchmark) needs a wastage-%/sell-through-% threshold
  that has not been defined. Not built; no threshold was invented.

**E — not possible with available data:** only previous-year comparison,
as above. Everything else requested in the original review turned out to
be a missing-function gap, not a missing-data gap, and has now been
implemented.

## 7. Data Limitations (verified)

- **Preparation/wastage coverage**: `preparation.json` and (1:1)
  `wastage.json` only cover 8 of the 60 products in `products.json`
  (confirmed via the type-file comments in `src/types/preparation.ts`
  and `docs/architecture.md` §3.2). Any wastage/sell-through UI must be
  scoped/labeled to these products, not presented as restaurant-wide.
- **Recipe coverage**: `recipes.json` covers only 5 of 60 products
  (`src/types/recipe.ts`). `getRecipes()` exists in the data layer but is
  not consumed by any analytics function.
- **Food cost source**: all cost/margin analytics use `Product.food_cost`
  directly (a given field), not a bottom-up recipe/ingredient
  calculation — confirmed by reading `profitability.ts`, which never
  imports `getRecipes` or `getIngredients`.
- **Labor cost granularity**: `getDepartmentManpower` and
  `getTotalMonthlyLaborCost` both sum `Employee.monthly_salary` — there
  is no date-range parameter on either function and no hourly/daily rate
  in the data.
- **Breakage structure**: `Breakage.item` is a free-text field (e.g.
  "Cup", "Serving Bowl") with no foreign key to `products.json`.
- **Operating cost coverage**: `operating-costs.json` contains exactly
  two `cost_type` values, "Utilities" and "Gas" (confirmed during the
  original data inspection) — no rent, no payroll, no other overheads.
- **Operational contribution vs. net profit**: `operational-contribution.ts`'s
  own doc comment states this is a partial estimate and must never be
  labeled "net profit" in the UI.
- **High-sales/low-margin thresholds**: `getHighSalesLowMarginProducts`
  defaults to `volumePercentile = 0.75` and `marginPercentageThreshold =
  25`, both overridable parameters, not values derived from
  `business-rules.md` (which doesn't define this metric at all).
- **Preparation recommendation assumptions**: business-rules.md line 10
  specifies the intended method (same-weekday history + recent average +
  trend + safety buffer) — no function implements any part of this yet.
- **Date-range behavior**: every range-based function takes exactly one
  `DateRange` (`{from, to}`, inclusive, "YYYY-MM-DD" strings) and filters
  a single dataset (or a sales-joined dataset) against it. There is no
  "all time" sentinel — a range must always be resolved first.
- **Comparison-period support**: previous-*period* comparison is now
  supported — `getPreviousPeriodRange(range)` (date-range.ts) resolves
  the immediately preceding period of the same length, and
  `comparePeriodValues(current, previous)` (comparison.ts) computes the
  difference and percentage change (`null`, not `0`/`Infinity`, when
  `previous` is 0). These are composable primitives, not a single
  "diff this metric automatically" call — a caller resolves both ranges,
  calls the same analytics function twice, and passes the two resulting
  numbers into `comparePeriodValues`. **Previous-*year* comparison
  remains unsupported** — the mock dataset spans exactly one year, so
  there is no prior year to compare against, and no year-mode was added.

## 8. Future UI Integration Contract

This section describes what a future Lovable component should
conceptually receive — not new TypeScript interfaces, since none of
these are implemented. Field names below reuse the actual field names
from the verified return types in §3 wherever a real function produces
them; anything else is described in prose, not as a fabricated type.

**KPI / Metric Card** (e.g. Net Sales, Orders, Food Cost, Estimated
Operational Contribution): the underlying value comes from an existing
function (`SalesSummary`, `OperationalContributionForRange`) for a
single `DateRange`. A "change vs. previous period" can now be built: the
page resolves `getPreviousPeriodRange(range)`, calls the same summary
function for both ranges, and passes the two resulting numbers into
`comparePeriodValues(current, previous)` — giving `{ current, previous,
difference, percentageChange }` (`percentageChange` is `null`, not
`0`/`Infinity`, when `previous` is 0). A metric card can now conceptually
receive: the label, the current value, the unit/format (currency vs.
count vs. %, from business-rules.md, not from any function), and —
where a comparison is wanted — that `PeriodComparison` object. Note this
is period-over-period only; there is no year-over-year equivalent (§6).

**Trend Chart** (Sales Trend, Orders Trend, Wastage Trend, Wastage %
Trend, Attendance Trend): now returns exactly the array-of-points shape
a chart needs, zero-filled for periods with no activity — e.g.
`SalesTrendPoint[] = { period, netSales }[]`,
`AttendanceTrendPoint[] = { period, presentCount, absentCount, leaveCount, attendanceRate }[]`.
`period` is a "YYYY-MM-DD" string — either a calendar day or a
Monday-anchored week start, decided per-range by
`resolveTrendGranularity` (daily up to 31 days, weekly beyond). **Breakage
Trend remains unimplemented** — deferred, not a data gap (§6).

**Category/Group Breakdown** (Order Type Performance, Payment Method
Distribution, Wastage by Reason, Wastage by Product, Breakage by
Department, Breakage by Item): now returns an array shaped per group,
e.g. `SalesByOrderType[] = { orderType, netSales, orderCount }[]`,
`WastageByReason[] = { reason, wastedQuantity, wastageCost }[]`,
`BreakageByDepartment[] = { departmentId, departmentName, eventCount, breakageCost }[]`.
Group keys are derived from whichever values actually appear in the
data, not a hardcoded list. **Category Performance** (by
`categoryId`) remains a composition task for the caller — grouping
`ProductProfitability[]` by its existing `categoryId` field — since it
wasn't in the V1 implementation scope.

**Ranked/Attention Table** (Top Performing Items, Loss-Making Products,
High-Sales/Low-Margin Products, Low-Sales/Low-Margin Products, Items
Needing Attention): all five now exist
(`getHighProfitProducts`, `getLossMakingProducts`,
`getHighSalesLowMarginProducts`, `getLowSalesLowMarginProducts`) and
return `ProductProfitability[]` arrays sorted/filtered appropriately — a
table or ranked list component can consume these arrays directly, using
the real field names (`productId`, `name`, `categoryId`, `quantitySold`,
`revenue`, `foodCost`, `grossMargin`, `marginPercentage`).

**Data Table** (Product Profitability Table, Breakage Table, Wastage by
Product table): consumes the raw array from the relevant
`getXInRange`/`getProductProfitability`/`getWastageByProduct` function
directly — these return exactly the fields listed in §3, no reshaping
needed.

**Highest-Cost callout** (Highest-Cost Breakage Department): returns a
single `BreakageByDepartment | null` object (composes
`getBreakageByDepartment`) — `null` specifically means no breakage
occurred in the range, not "unknown."

**Preparation Recommendation Card, Sales-vs-Manpower widget, Department
Efficiency widget, generic Narrative/Insights Panel**: none of these
have a conceptual shape yet, and none should be designed against real
data in this V1 pass — each is blocked on an explicit business/product
decision, not a missing function (§6). The only "insight" shapes that
exist are the two approved threshold-free ones: a high-sales/low-margin
product list (`getHighSalesLowMarginProducts`) and an
over-benchmark-headcount department list (filter
`DepartmentManpower[]` where `variance > 0`).

## 9. Date Filter Contract

Verified directly from `src/lib/analytics/date-range.ts`:

- **Supported presets** (`DateRangePreset`): `today`, `yesterday`,
  `last7Days`, `thisWeek`, `lastWeek`, `thisMonth`, `lastMonth`,
  `thisYear`, `custom`. There is **no `lastYear` preset** — a "yearly
  report" for a prior year must be built via `custom`.
- **Week-start behavior**: weeks are Monday–Sunday (`startOfWeek`
  computes the Monday on/before the given date). This is called out in
  the code as a convention choice, not derived from the mock data.
- **Custom date behavior**: `{ preset: "custom", custom: { from, to } }`
  passes the given range through unchanged. Calling `resolveDateRange`
  with `preset: "custom"` and no `custom` object throws.
- **Comparison behavior**: `getPreviousPeriodRange(range)` returns the
  immediately preceding period of the same length (e.g. March 1–7 →
  February 22–28 — verified with this exact example against the real
  implementation). Pair it with `comparePeriodValues` (comparison.ts) —
  resolve both ranges, call the same analytics function for each, then
  diff the two resulting numbers. There is still no year-over-year
  equivalent (§6/§7).
- **How pages should pass ranges to analytics**: call
  `resolveDateRange(selection, referenceDate?)` once per page/request to
  get a `DateRange`, then pass that same `DateRange` object into every
  analytics function used on that page (`getSalesSummary(range)`,
  `getProductProfitability(range)`, etc.) so all widgets on one page
  agree on the same window. Every `*Trend` function additionally accepts
  an optional `granularity: "day" | "week"` — omit it to let
  `resolveTrendGranularity` pick automatically (daily up to 31 days,
  weekly beyond), or pass it explicitly if a page wants to force one
  (e.g. always-daily for a 7-day view).
- **Limitations**: all range math is UTC-anchored calendar-date math with
  no timezone conversion beyond that (`restaurant.json.timezone` is
  metadata only — not consumed by `date-range.ts`). `resolveDateRange`
  defaults `referenceDate` to `new Date()` (real "now"), which as of
  today (2026-09-11) is one day past the mock dataset's actual
  `data_period.to` (2026-09-10) — a Lovable UI demoing against this mock
  data will need to pass an explicit `referenceDate`/custom range inside
  2025-09-11–2026-09-10 for non-empty results on "today"/"thisWeek"/etc.

## 10. Performance Considerations

Verified in `src/lib/data/reader.ts`, `src/lib/data/sales.ts`,
`src/lib/data/sale-items.ts`, and every `analytics/*.ts` file:

- Every file in `src/lib/data/` and `src/lib/analytics/` starts with
  `import "server-only"` — this is a **build-time enforced** boundary;
  none of this code can end up in a Client Component bundle.
- `sales.json` (~179k rows) and `sale-items.json` (~341k rows) are read
  and parsed once per server process via `createCachedLoader`
  (`reader.ts`) and kept in memory — not re-read per request, but still
  full in-memory arrays.
- `getSaleItemsInRange` filters the full in-memory `sale-items` array on
  every call (`O(n)` over ~341k rows) after building a `Set` of matching
  `bill_id`s from the range-filtered sales. This runs server-side today
  and must continue to.
- **No UI component should ever receive `Sale[]` or `SaleItem[]`
  directly as page/component data** — the only functions that return
  those raw arrays (`getSalesInRange`, `getSaleItemsInRange`) exist to
  feed the aggregation functions built on top of them
  (`getSalesSummary`, `getProductProfitability`,
  `getOperationalContributionForRange`), not to be rendered row-by-row.
  Exceptions that are safe to hand to a table component as-is because
  they're already small: `getBreakageInRange` (731 rows total, dataset
  max), `getPreparationInRange`/`getPreparationHistory` (2,920 rows
  total, dataset max, and further scoped to 8 products), `getDepartmentManpower`
  (6 rows), `getAttendanceInRange` (20,075 rows total — still large
  enough that a page should aggregate via `getAttendanceSummary` rather
  than rendering every row).
- Every Lovable component that needs sales/sale-item-derived numbers
  should be designed against the **aggregate** functions
  (`getSalesSummary`, `getProductProfitability`,
  `getOperationalContributionForRange`, and now `getSalesTrend`,
  `getOrdersTrend`, `getSalesByOrderType`, `getSalesByPaymentMethod`,
  `getHourlySales`) — never against a plan to fetch raw rows into the
  browser and aggregate client-side.
- All newly added functions (§3/§6) follow this same boundary: every one
  lives in a `server-only`-marked file, reads through the existing
  cached data-layer accessors (`getSales`, `getWastage`, `getBreakage`,
  `getAttendance`, `getProducts`, `getDepartments`, etc.), and returns a
  small aggregated result — never a raw dataset. No new filesystem/data
  access was introduced; every new function is built by composing
  existing `getXInRange`/`getX` calls and existing per-record fields.

## 11. Verified Routes

Read directly from `src/app/dashboard/**/page.tsx` and
`src/components/layout/nav-items.ts`:

| Page (as named in the task) | Actual route | File |
|---|---|---|
| Executive Dashboard | `/dashboard` | `src/app/dashboard/page.tsx` |
| Sales | `/dashboard/sales` | `src/app/dashboard/sales/page.tsx` |
| Profitability | `/dashboard/profitability` | `src/app/dashboard/profitability/page.tsx` |
| Wastage & Preparation | `/dashboard/wastage` | `src/app/dashboard/wastage/page.tsx` |
| Manpower | `/dashboard/manpower` | `src/app/dashboard/manpower/page.tsx` |
| Breakage | `/dashboard/breakage` | `src/app/dashboard/breakage/page.tsx` |
| Reports | `/dashboard/reports` | `src/app/dashboard/reports/page.tsx` |

There is no separate "Executive Dashboard" route distinct from
`/dashboard` — they are the same page. All 7 routes currently render
only `<PageContainer><PlaceholderCard .../></PageContainer>` (verified
by reading every file above) — none call any analytics function today.
`src/app/dashboard/layout.tsx` wraps all of them with `Sidebar` +
`Header`. The nav labels in `nav-items.ts` are "Overview", "Sales",
"Profitability", "Wastage", "Manpower", "Breakage", "Reports" — "Overview"
is the sidebar label for the `/dashboard` route.

## 12. Integration Principles

1. **The Lovable UI must call into `src/lib/analytics`, never
   `src/lib/data` and never `mock_data/*.json` directly.** This is the
   same boundary already established and enforced (`server-only`) in the
   current codebase — nothing new is being asked of the UI here.
2. **Business terminology must be preserved as named in
   `mock_data/business-rules.md`** — in particular, "estimated
   operational contribution" must never be shortened to or relabeled
   "net profit" or "profit" anywhere in the UI copy.
3. **Every widget that needs sales/sale-item numbers consumes an
   aggregate, not raw rows** (§10) — this determines what data shape a
   Lovable component should be designed to expect.
4. **Wastage/preparation/sell-through widgets must be scoped or labeled
   to the 8 tracked products** — do not present them as covering the
   full 60-item menu.
5. **Previous-*period* comparison UI (deltas, "vs. last period" labels)
   can now be built** via `getPreviousPeriodRange` + `comparePeriodValues`
   (§6/§9) — compose them per metric at the call site. **Previous-*year*
   comparison still cannot be built** — no data exists for it.
6. **The remaining DEFERRED/NOT SUPPORTED items (§6) — breakage trend,
   preparation recommendation, sales-vs-manpower, department efficiency,
   previous-year comparison, and any generic Management Insights beyond
   the two approved ones — must still be held back from the Lovable
   spec**, or explicitly marked as "static/placeholder until a business
   decision is made or the item is prioritized for a later version."
   Everything else in the original review is now implemented and safe to
   design against.
7. **This document does not authorize building any of the remaining
   deferred functions.** Preparation recommendation and department
   efficiency in particular require explicit business decisions (a
   safety-buffer value/combination formula, and an efficiency formula,
   respectively) before any code should be written for them — inventing
   either would violate the "do not invent business rules or thresholds"
   constraint this project operates under.
