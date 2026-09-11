import "server-only";

/**
 * Generic previous-period comparison result for a single numeric metric.
 * Pair with `getPreviousPeriodRange` (date-range.ts): resolve the current
 * and previous `DateRange`s, call the same analytics function for both,
 * then pass the two resulting numbers in here — e.g.:
 *
 *   const previousRange = getPreviousPeriodRange(range);
 *   const [current, previous] = await Promise.all([
 *     getSalesSummary(range),
 *     getSalesSummary(previousRange),
 *   ]);
 *   const netSalesComparison = comparePeriodValues(current.netSales, previous.netSales);
 *
 * This keeps the diff/percentage math in one place instead of every page
 * re-implementing it.
 */
export interface PeriodComparison {
  current: number;
  previous: number;
  difference: number;
  /**
   * (current - previous) / previous * 100. `null` when `previous` is 0 —
   * a percentage change from zero is undefined, not 0% or Infinity.
   */
  percentageChange: number | null;
}

export function comparePeriodValues(current: number, previous: number): PeriodComparison {
  const difference = current - previous;
  return {
    current,
    previous,
    difference,
    percentageChange: previous !== 0 ? (difference / previous) * 100 : null,
  };
}
