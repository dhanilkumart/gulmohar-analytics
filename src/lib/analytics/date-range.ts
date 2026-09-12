/**
 * Reusable date-range model for filtering analytics.
 *
 * Dates throughout the mock data are plain ISO calendar strings
 * ("YYYY-MM-DD"), with no time-zone component beyond the restaurant's
 * fixed `timezone` in restaurant.json. All range math here is done on
 * calendar dates (UTC-anchored) so it is independent of the server's
 * local time zone.
 *
 * This module defines the model + pure resolution logic only — no
 * framework/UI/URL concerns. It has no `server-only` import and no data
 * access, so it is safe to import directly (not via the
 * `src/lib/analytics` barrel, which is server-only) from client
 * components such as the global date-range control in
 * `src/components/layout/date-range-control.tsx`. See
 * `src/lib/date-range-params.ts` for the Next.js URL-search-params
 * integration built on top of this module.
 */

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "custom";

/** Inclusive date range, both bounds as "YYYY-MM-DD". */
export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangeSelection {
  preset: DateRangePreset;
  /** Required, and only used, when `preset` is "custom". */
  custom?: DateRange;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUTCDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Weeks are treated as Monday–Sunday. This is a business-reporting
 * convention choice (not derived from the mock data) and can be revisited
 * later.
 */
function startOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

/** Calendar quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec. */
function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
}

/**
 * Resolves a preset (or custom range) into a concrete `DateRange`,
 * relative to `referenceDate` (defaults to now). Callers doing
 * time-sensitive testing/demos against the fixed mock-data period
 * (2025-09-11 to 2026-09-10) should pass an explicit `referenceDate`
 * that falls inside it.
 */
export function resolveDateRange(
  selection: DateRangeSelection,
  referenceDate: Date = new Date()
): DateRange {
  const today = startOfUTCDate(referenceDate);

  switch (selection.preset) {
    case "today":
      return { from: toISODate(today), to: toISODate(today) };

    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { from: toISODate(yesterday), to: toISODate(yesterday) };
    }

    case "last7Days":
      return { from: toISODate(addDays(today, -6)), to: toISODate(today) };

    case "thisWeek": {
      const start = startOfWeek(today);
      return { from: toISODate(start), to: toISODate(today) };
    }

    case "lastWeek": {
      const startThisWeek = startOfWeek(today);
      const startLastWeek = addDays(startThisWeek, -7);
      const endLastWeek = addDays(startThisWeek, -1);
      return { from: toISODate(startLastWeek), to: toISODate(endLastWeek) };
    }

    case "thisMonth":
      return { from: toISODate(startOfMonth(today)), to: toISODate(today) };

    case "lastMonth": {
      const firstOfThisMonth = startOfMonth(today);
      const lastMonthEnd = addDays(firstOfThisMonth, -1);
      const lastMonthStart = startOfMonth(lastMonthEnd);
      return { from: toISODate(lastMonthStart), to: toISODate(endOfMonth(lastMonthEnd)) };
    }

    case "thisQuarter":
      return { from: toISODate(startOfQuarter(today)), to: toISODate(today) };

    case "thisYear":
      return { from: toISODate(startOfYear(today)), to: toISODate(today) };

    case "custom":
      if (!selection.custom) {
        throw new Error('resolveDateRange: "custom" preset requires a `custom` range.');
      }
      return selection.custom;

    default: {
      const exhaustiveCheck: never = selection.preset;
      throw new Error(`resolveDateRange: unhandled preset "${exhaustiveCheck}".`);
    }
  }
}

/** Inclusive check: is `date` ("YYYY-MM-DD") within `range`? */
export function isWithinDateRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

/** Filters a list of records by an inclusive date range using `getDate`. */
export function filterByDateRange<T>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string
): T[] {
  return items.filter((item) => isWithinDateRange(getDate(item), range));
}

function daysInRange(range: DateRange): number {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// ---------------------------------------------------------------------------
// Trend bucketing (shared by every "*Trend" analytics function)
// ---------------------------------------------------------------------------

export type TrendGranularity = "day" | "week";

/**
 * Picks a bucket size for a trend chart based on the span of the range:
 * daily buckets stay readable up to ~31 days; longer ranges switch to
 * weekly (Monday-anchored, consistent with the "This Week"/"Last Week"
 * presets above) so e.g. a full-year range doesn't render 365 points.
 * This is a charting-readability default, not a business rule — every
 * trend function accepts an explicit `granularity` override instead of
 * always relying on this.
 */
export function resolveTrendGranularity(range: DateRange): TrendGranularity {
  return daysInRange(range) > 31 ? "week" : "day";
}

/** Buckets an ISO date string ("YYYY-MM-DD") into its trend period key. */
export function getPeriodKey(date: string, granularity: TrendGranularity): string {
  if (granularity === "day") return date;
  const parsed = new Date(`${date}T00:00:00Z`);
  return toISODate(startOfWeek(parsed));
}

/**
 * Every period key between `range.from` and `range.to` inclusive, in
 * order, with no duplicates. Used so trend charts can show a zero-value
 * point for a period with no matching records instead of a gap.
 */
export function enumeratePeriods(range: DateRange, granularity: TrendGranularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const end = new Date(`${range.to}T00:00:00Z`);
  let cursor = new Date(`${range.from}T00:00:00Z`);

  while (cursor <= end) {
    const key = getPeriodKey(toISODate(cursor), granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor = addDays(cursor, 1);
  }

  return keys;
}

/**
 * Sums a numeric value per trend period across a list of records. This is
 * the one place the "group records by period, then aggregate" logic
 * lives — every `*Trend` analytics function (sales, orders, wastage,
 * wastage %, attendance) calls this instead of re-implementing its own
 * bucketing loop.
 */
export function sumByPeriod<T>(
  items: T[],
  granularity: TrendGranularity,
  getDate: (item: T) => string,
  getValue: (item: T) => number
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const item of items) {
    const key = getPeriodKey(getDate(item), granularity);
    sums.set(key, (sums.get(key) ?? 0) + getValue(item));
  }
  return sums;
}

// ---------------------------------------------------------------------------
// Previous-period comparison
// ---------------------------------------------------------------------------

/**
 * The immediately preceding period of the same length as `range` (e.g.
 * March 1–7 → previous is February 22–28). Used to power "vs. previous
 * period" comparisons via `comparePeriodValues` in
 * `src/lib/analytics/comparison.ts`. Previous-YEAR comparison is
 * intentionally not provided: the mock dataset spans exactly one year
 * (see restaurant.json's `data_period`), so there is no prior year to
 * compare against.
 */
export function getPreviousPeriodRange(range: DateRange): DateRange {
  const from = new Date(`${range.from}T00:00:00Z`);
  const durationDays = daysInRange(range);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(durationDays - 1));
  return { from: toISODate(previousFrom), to: toISODate(previousTo) };
}
