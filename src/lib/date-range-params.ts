import {
  resolveDateRange,
  getPreviousPeriodRange,
  type DateRange,
  type DateRangePreset,
  type DateRangeSelection,
} from "@/lib/analytics/date-range";

/**
 * Next.js URL-search-params integration for the global date-range +
 * comparison filter. This is the ONLY module that knows the query-string
 * shape (`range`, `from`, `to`, `compare`) — everything else (the date
 * math itself, the analytics functions) is unaware of URLs.
 *
 * Deliberately framework-light: `parseGlobalRangeParams` takes a plain
 * string-keyed record so it works both from a Server Component's
 * `searchParams` (after awaiting it) and from a client component's
 * `useSearchParams()` (via `Object.fromEntries(searchParams.entries())`).
 *
 * No `server-only` import here on purpose — this module (like
 * `src/lib/analytics/date-range.ts`, which it wraps) must be importable
 * from the client-side date-range control, not just from server pages.
 */

export const RANGE_QUERY_KEY = "range";
export const FROM_QUERY_KEY = "from";
export const TO_QUERY_KEY = "to";
export const COMPARE_QUERY_KEY = "compare";

export type ComparisonMode = "none" | "previous";

export interface ResolvedGlobalRange {
  /** The selection as resolved from the URL (preset, plus `custom` when applicable). */
  selection: DateRangeSelection;
  /** The concrete resolved range for the current period. */
  range: DateRange;
  comparison: ComparisonMode;
  /** Only set when `comparison === "previous"`; from `getPreviousPeriodRange`. */
  previousRange: DateRange | null;
}

/**
 * Default preset when no valid `range` query param is present.
 *
 * Chosen because: (1) it matches the Lovable reference UI's own default
 * (`gulmohar-analytics-ui/src/lib/range-context.tsx` defaults to
 * `"lastMonth"`), and (2) unlike "today"/"thisWeek"/"thisMonth", it is
 * guaranteed to be a complete, fully-populated calendar month within the
 * fixed mock-data window (2025-09-11 to 2026-09-10) regardless of the
 * server's real current date, avoiding an empty first impression. The
 * project had no other established default prior to this step.
 */
export const DEFAULT_PRESET: DateRangePreset = "lastMonth";

/** Default comparison mode: off, so a first-time view shows plain totals. */
export const DEFAULT_COMPARISON: ComparisonMode = "none";

export const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7Days", label: "Last 7 Days" },
  { value: "thisWeek", label: "This Week" },
  { value: "lastWeek", label: "Last Week" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "thisQuarter", label: "This Quarter" },
  { value: "thisYear", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const VALID_PRESETS = new Set<string>(PRESET_OPTIONS.map((option) => option.value));

function isValidPreset(value: string | null): value is DateRangePreset {
  return value !== null && VALID_PRESETS.has(value);
}

function isIsoDate(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function firstValue(value: string | string[] | undefined | null): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Plain string-keyed params, matching both Next's `searchParams` shape and `URLSearchParams` entries. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Parses the global range/comparison query params into a resolved
 * selection, using the existing `resolveDateRange`/`getPreviousPeriodRange`
 * exactly as implemented — no new date math.
 *
 * Invalid/incomplete params fall back to `DEFAULT_PRESET` rather than
 * throwing, since this runs on every page render from user-editable URL
 * query params.
 */
export function parseGlobalRangeParams(params: RawSearchParams): ResolvedGlobalRange {
  const rawPreset = firstValue(params[RANGE_QUERY_KEY]);
  const rawFrom = firstValue(params[FROM_QUERY_KEY]);
  const rawTo = firstValue(params[TO_QUERY_KEY]);
  const rawCompare = firstValue(params[COMPARE_QUERY_KEY]);

  const preset: DateRangePreset = isValidPreset(rawPreset) ? rawPreset : DEFAULT_PRESET;

  let selection: DateRangeSelection;
  if (preset === "custom" && isIsoDate(rawFrom) && isIsoDate(rawTo) && rawFrom <= rawTo) {
    selection = { preset: "custom", custom: { from: rawFrom, to: rawTo } };
  } else if (preset === "custom") {
    // "custom" requested but from/to missing or invalid — fall back rather than throw.
    selection = { preset: DEFAULT_PRESET };
  } else {
    selection = { preset };
  }

  const range = resolveDateRange(selection);
  const comparison: ComparisonMode = rawCompare === "previous" ? "previous" : DEFAULT_COMPARISON;
  const previousRange = comparison === "previous" ? getPreviousPeriodRange(range) : null;

  return { selection, range, comparison, previousRange };
}

/**
 * Builds the query-string params for a given selection/comparison, to be
 * merged into the current URL by the date-range/comparison controls.
 * Omits params that equal the default so a fresh visit to `/dashboard`
 * (no query string) still resolves to the same selection.
 */
export function buildGlobalRangeParams(
  selection: DateRangeSelection,
  comparison: ComparisonMode
): Record<string, string> {
  const params: Record<string, string> = {};

  if (selection.preset !== DEFAULT_PRESET || selection.preset === "custom") {
    params[RANGE_QUERY_KEY] = selection.preset;
  }
  if (selection.preset === "custom" && selection.custom) {
    params[FROM_QUERY_KEY] = selection.custom.from;
    params[TO_QUERY_KEY] = selection.custom.to;
  }
  if (comparison !== DEFAULT_COMPARISON) {
    params[COMPARE_QUERY_KEY] = comparison;
  }

  return params;
}

export function presetLabel(preset: DateRangePreset): string {
  return PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "Custom Range";
}
