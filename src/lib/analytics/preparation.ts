import "server-only";

import { getPreparation } from "@/lib/data";
import type { Preparation } from "@/types";
import {
  filterByDateRange,
  resolveTrendGranularity,
  enumeratePeriods,
  sumByPeriod,
  type DateRange,
  type TrendGranularity,
} from "./date-range";

/**
 * preparation.json only tracks a subset of products (8 of 60 in the mock
 * data). Callers should not assume every product has preparation history.
 */
export interface PreparationTotals {
  productId: string;
  preparedQuantity: number;
  soldQuantity: number;
  wastedQuantity: number;
  /** wasted / prepared * 100 (business-rules.md), 0 when nothing was prepared. */
  wastagePercentage: number;
  /** sold / prepared * 100 (business-rules.md), 0 when nothing was prepared. */
  sellThroughPercentage: number;
}

export async function getPreparationInRange(range: DateRange): Promise<Preparation[]> {
  const preparation = await getPreparation();
  return filterByDateRange(preparation, range, (row) => row.date);
}

/** Aggregate prepared/sold/wasted quantities per product for a date range. */
export async function getPreparationVsSoldVsWasted(
  range: DateRange
): Promise<PreparationTotals[]> {
  const preparationInRange = await getPreparationInRange(range);

  const byProduct = new Map<
    string,
    { preparedQuantity: number; soldQuantity: number; wastedQuantity: number }
  >();

  for (const row of preparationInRange) {
    const existing = byProduct.get(row.product_id) ?? {
      preparedQuantity: 0,
      soldQuantity: 0,
      wastedQuantity: 0,
    };
    existing.preparedQuantity += row.prepared_quantity;
    existing.soldQuantity += row.sold_quantity;
    existing.wastedQuantity += row.wasted_quantity;
    byProduct.set(row.product_id, existing);
  }

  return Array.from(byProduct.entries()).map(([productId, totals]) => ({
    productId,
    ...totals,
    wastagePercentage:
      totals.preparedQuantity > 0
        ? (totals.wastedQuantity / totals.preparedQuantity) * 100
        : 0,
    sellThroughPercentage:
      totals.preparedQuantity > 0
        ? (totals.soldQuantity / totals.preparedQuantity) * 100
        : 0,
  }));
}

/** Full daily preparation history for a single product, sorted by date. */
export async function getPreparationHistory(productId: string): Promise<Preparation[]> {
  const preparation = await getPreparation();
  return preparation
    .filter((row) => row.product_id === productId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WastagePercentageTrendPoint {
  period: string;
  preparedQuantity: number;
  wastedQuantity: number;
  /** wasted / prepared * 100, computed from the PERIOD TOTALS (not an average of daily percentages). */
  wastagePercentage: number;
}

/**
 * Wastage percentage over time, across the 8 products tracked in
 * preparation.json (not restaurant-wide — see docs/architecture.md).
 * Prepared and wasted quantities are summed per period first, and the
 * percentage is derived from those sums — this avoids the distortion of
 * averaging each day's percentage independently (a day with a tiny
 * prepared quantity would otherwise skew an average disproportionately).
 */
export async function getWastagePercentageTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range)
): Promise<WastagePercentageTrendPoint[]> {
  const preparationInRange = await getPreparationInRange(range);

  const preparedSums = sumByPeriod(
    preparationInRange,
    granularity,
    (row) => row.date,
    (row) => row.prepared_quantity
  );
  const wastedSums = sumByPeriod(
    preparationInRange,
    granularity,
    (row) => row.date,
    (row) => row.wasted_quantity
  );

  return enumeratePeriods(range, granularity).map((period) => {
    const preparedQuantity = preparedSums.get(period) ?? 0;
    const wastedQuantity = wastedSums.get(period) ?? 0;
    return {
      period,
      preparedQuantity,
      wastedQuantity,
      wastagePercentage: preparedQuantity > 0 ? (wastedQuantity / preparedQuantity) * 100 : 0,
    };
  });
}
