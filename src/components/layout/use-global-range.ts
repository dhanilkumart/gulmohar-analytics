"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRangeSelection } from "@/lib/analytics/date-range";
import {
  buildGlobalRangeParams,
  parseGlobalRangeParams,
  RANGE_QUERY_KEY,
  FROM_QUERY_KEY,
  TO_QUERY_KEY,
  COMPARE_QUERY_KEY,
  type ComparisonMode,
  type ResolvedGlobalRange,
} from "@/lib/date-range-params";

const MANAGED_KEYS = [RANGE_QUERY_KEY, FROM_QUERY_KEY, TO_QUERY_KEY, COMPARE_QUERY_KEY];

/**
 * Reads the current global date-range/comparison selection from the URL
 * and returns setters that update it in place — preserving the current
 * pathname (so it works the same on any of the 7 dashboard pages) and
 * any *other* query params already present.
 *
 * This is the single place the date-range/comparison controls talk to
 * the URL; the actual date math is `parseGlobalRangeParams`/
 * `buildGlobalRangeParams` (src/lib/date-range-params.ts), which in turn
 * only wrap the existing `resolveDateRange`/`getPreviousPeriodRange`.
 */
export function useGlobalRange(): {
  resolved: ResolvedGlobalRange;
  setSelection: (selection: DateRangeSelection) => void;
  setComparison: (comparison: ComparisonMode) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const resolved = parseGlobalRangeParams(Object.fromEntries(searchParams.entries()));

  const applyParams = (selection: DateRangeSelection, comparison: ComparisonMode) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of MANAGED_KEYS) next.delete(key);
    for (const [key, value] of Object.entries(buildGlobalRangeParams(selection, comparison))) {
      next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return {
    resolved,
    setSelection: (selection) => applyParams(selection, resolved.comparison),
    setComparison: (comparison) => applyParams(resolved.selection, comparison),
  };
}
