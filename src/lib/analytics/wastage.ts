import "server-only";

import { getWastage, getProducts } from "@/lib/data";
import type { Wastage } from "@/types";
import {
  filterByDateRange,
  resolveTrendGranularity,
  enumeratePeriods,
  sumByPeriod,
  type DateRange,
  type TrendGranularity,
} from "./date-range";
import { getPreparationVsSoldVsWasted } from "./preparation";

export async function getWastageInRange(range: DateRange): Promise<Wastage[]> {
  const wastage = await getWastage();
  return filterByDateRange(wastage, range, (row) => row.date);
}

/** Wastage cost = wasted quantity x product food cost, pre-computed on each wastage.json row. */
export function getWastageCost(wastage: Wastage[]): number {
  return wastage.reduce((sum, row) => sum + row.estimated_cost, 0);
}

export interface WastageTrendPoint {
  period: string;
  wastageCost: number;
}

/**
 * Wastage cost over time. Scoped to the 8 products tracked in
 * preparation.json/wastage.json — not restaurant-wide (see
 * docs/architecture.md).
 */
export async function getWastageTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range)
): Promise<WastageTrendPoint[]> {
  const wastageInRange = await getWastageInRange(range);
  const sums = sumByPeriod(
    wastageInRange,
    granularity,
    (row) => row.date,
    (row) => row.estimated_cost
  );
  return enumeratePeriods(range, granularity).map((period) => ({
    period,
    wastageCost: sums.get(period) ?? 0,
  }));
}

export interface WastageByProduct {
  productId: string;
  productName: string;
  wastedQuantity: number;
  wastageCost: number;
  /** From `getPreparationVsSoldVsWasted` — wasted/prepared * 100 for this product in the range. */
  wastagePercentage: number;
}

/**
 * Wastage grouped by product, for the 8 products tracked in
 * preparation.json/wastage.json. Composes `getPreparationVsSoldVsWasted`
 * for wasted quantity/percentage (already-aggregated, weighted correctly)
 * instead of re-deriving it from wastage.json.
 */
export async function getWastageByProduct(range: DateRange): Promise<WastageByProduct[]> {
  const [wastageInRange, preparationTotals, products] = await Promise.all([
    getWastageInRange(range),
    getPreparationVsSoldVsWasted(range),
    getProducts(),
  ]);

  const productsById = new Map(products.map((p) => [p.product_id, p]));
  const preparationByProduct = new Map(preparationTotals.map((p) => [p.productId, p]));

  const costByProduct = new Map<string, number>();
  for (const row of wastageInRange) {
    costByProduct.set(row.product_id, (costByProduct.get(row.product_id) ?? 0) + row.estimated_cost);
  }

  return Array.from(costByProduct.entries()).map(([productId, wastageCost]) => {
    const preparation = preparationByProduct.get(productId);
    return {
      productId,
      productName: productsById.get(productId)?.name ?? productId,
      wastedQuantity: preparation?.wastedQuantity ?? 0,
      wastageCost,
      wastagePercentage: preparation?.wastagePercentage ?? 0,
    };
  });
}

export interface WastageByReason {
  reason: string;
  wastedQuantity: number;
  wastageCost: number;
}

/**
 * Wastage grouped by `Wastage.reason`. Groups are derived from whatever
 * values actually appear in the data (currently "Over-preparation" |
 * "End-of-day unsold") rather than a hardcoded list.
 */
export async function getWastageByReason(range: DateRange): Promise<WastageByReason[]> {
  const wastageInRange = await getWastageInRange(range);
  const byReason = new Map<string, { wastedQuantity: number; wastageCost: number }>();

  for (const row of wastageInRange) {
    const existing = byReason.get(row.reason) ?? { wastedQuantity: 0, wastageCost: 0 };
    existing.wastedQuantity += row.quantity;
    existing.wastageCost += row.estimated_cost;
    byReason.set(row.reason, existing);
  }

  return Array.from(byReason.entries()).map(([reason, agg]) => ({ reason, ...agg }));
}
