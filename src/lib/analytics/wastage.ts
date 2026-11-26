import "server-only";

import type { SalesScope } from "@/lib/data/sales";
import { getRestaurantContext } from "@/lib/context/restaurant-context";

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
import { getPreparationInRange } from "./preparation";

export async function getWastageInRange(range: DateRange, scope?: SalesScope): Promise<Wastage[]> {
  const context = scope ?? await getRestaurantContext();
  const wastage = await getWastage({
    outletId: context.outletId,
    organizationId: context.organizationId,
    startDate: range.from,
    endDate: range.to,
  });
  return filterByDateRange(wastage, range, (row) => row.date);
}

export interface WastageCostSummary {
  totalCost: number;
  isComplete: boolean;
  unknownCostCount: number;
}

/**
 * Returns summary of wastage cost, tracking whether all records had known costs.
 */
export function getWastageCostSummary(wastage: Wastage[]): WastageCostSummary {
  let totalCost = 0;
  let unknownCostCount = 0;
  for (const row of wastage) {
    if (row.estimated_cost != null) {
      totalCost += row.estimated_cost;
    } else {
      unknownCostCount += 1;
    }
  }
  return {
    totalCost,
    isComplete: unknownCostCount === 0,
    unknownCostCount,
  };
}

/** Wastage cost = wasted quantity x product food cost, pre-computed on each wastage.json row.
 * Handles nullable estimated_cost safely without producing NaN.
 */
export function getWastageCost(wastage: Wastage[]): number {
  return wastage.reduce((sum, row) => sum + (row.estimated_cost != null ? row.estimated_cost : 0), 0);
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
    (row) => (row.estimated_cost != null ? row.estimated_cost : 0)
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
  /** From `getPreparationInRange` — wasted/prepared * 100 for this product in the range. */
  wastagePercentage: number;
}

/**
 * Wastage grouped by product, for the 8 products tracked in
 * preparation.json/wastage.json. Preparation records supply the quantities
 * used for the weighted wastage percentage.
 */
export async function getWastageByProduct(range: DateRange): Promise<WastageByProduct[]> {
  const [wastageInRange, preparationTotals, products] = await Promise.all([
    getWastageInRange(range),
    getPreparationInRange(range),
    getProducts(),
  ]);

  const productsById = new Map(products.map((p) => [p.product_id, p]));
  const preparationByProduct = new Map<string, { preparedQuantity: number; wastedQuantity: number }>();
  for (const row of preparationTotals) {
    const totals = preparationByProduct.get(row.product_id) ?? { preparedQuantity: 0, wastedQuantity: 0 };
    totals.preparedQuantity += row.prepared_quantity;
    totals.wastedQuantity += row.wasted_quantity;
    preparationByProduct.set(row.product_id, totals);
  }

  const costByProduct = new Map<string, number>();
  for (const row of wastageInRange) {
    const cost = row.estimated_cost != null ? row.estimated_cost : 0;
    costByProduct.set(row.product_id, (costByProduct.get(row.product_id) ?? 0) + cost);
  }

  return Array.from(costByProduct.entries()).map(([productId, wastageCost]) => {
    const preparation = preparationByProduct.get(productId);
    return {
      productId,
      productName: productsById.get(productId)?.name ?? productId,
      wastedQuantity: preparation?.wastedQuantity ?? 0,
      wastageCost,
      wastagePercentage: preparation && preparation.preparedQuantity > 0
        ? (preparation.wastedQuantity / preparation.preparedQuantity) * 100
        : 0,
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
    existing.wastageCost += row.estimated_cost != null ? row.estimated_cost : 0;
    byReason.set(row.reason, existing);
  }

  return Array.from(byReason.entries()).map(([reason, agg]) => ({ reason, ...agg }));
}
