import "server-only";

import { getPreparation } from "@/lib/data";
import { prisma } from "@/lib/db/client";
import { getSalesOutletFilter, type SalesScope } from "@/lib/data/sales";
import { getSaleItemsInRange } from "./sales";
import type { Preparation } from "@/types";
import {
  filterByDateRange,
  resolveTrendGranularity,
  enumeratePeriods,
  sumByPeriod,
  type DateRange,
  type TrendGranularity,
} from "./date-range";

export interface PreparationTotals {
  productId: string;
  name: string;
  preparationUnit?: string;
  preparedQuantity: number;
  soldQuantity: number;
  wastedQuantity: number;
}

export async function getPreparationInRange(range: DateRange): Promise<Preparation[]> {
  return filterByDateRange(await getPreparation(), range, (row) => row.date);
}

async function getPreparationChartRecords(range: DateRange, scope?: SalesScope) {
  const where = {
    outlet: scope?.organizationId ? { organizationId: scope.organizationId } : undefined,
    outletId: getSalesOutletFilter(scope),
    date: {
      gte: new Date(range.from + "T00:00:00.000Z"),
      lte: new Date(range.to + "T23:59:59.999Z"),
    },
  };
  return Promise.all([
    prisma.preparationLog.findMany({
      where,
      select: { date: true, quantity: true, preparationItem: { select: { id: true, name: true, unit: true } } },
    }),
    prisma.wastageRecord.findMany({
      where,
      select: { date: true, wastedQuantity: true, preparationItem: { select: { id: true, name: true, unit: true } } },
    }),
    getSaleItemsInRange(range, scope),
  ]);
}

/** Chart rows for recorded preparation items and sold menu products. */
export async function getPreparationVsSoldVsWasted(
  range: DateRange,
  scope?: SalesScope
): Promise<PreparationTotals[]> {
  const [prepared, wasted, sold] = await getPreparationChartRecords(range, scope);
  const totals = new Map<string, PreparationTotals>();
  function row(productId: string, name: string, preparationUnit?: string) {
    const existing = totals.get(productId) ?? {
      productId, name, preparationUnit, preparedQuantity: 0, soldQuantity: 0, wastedQuantity: 0,
    };
    totals.set(productId, existing);
    return existing;
  }

  for (const record of prepared) {
    const item = record.preparationItem;
    row("prep:" + item.id, item.name + " (" + item.unit + ")", item.unit).preparedQuantity += Number(record.quantity);
  }
  for (const record of wasted) {
    const item = record.preparationItem;
    row("prep:" + item.id, item.name + " (" + item.unit + ")", item.unit).wastedQuantity += Number(record.wastedQuantity);
  }
  for (const item of sold) {
    const name = item.product_name ?? item.item_name;
    if (name) {
      const key = item.product_id ? "product:" + item.product_id : "sold-name:" + name;
      row(key, name).soldQuantity += item.quantity;
    }
  }

  return [...totals.values()];
}

/** Full daily preparation history for a single product, sorted by date. */
export async function getPreparationHistory(
  productId: string,
  scope?: SalesScope
): Promise<Preparation[]> {
  const preparation = await getPreparation();
  const history = preparation
    .filter((row) => row.product_id === productId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return history;

  const items = await getSaleItemsInRange({ from: first.date, to: last.date }, scope);
  const soldByDay = new Map<string, number>();
  for (const item of items) {
    if (item.product_id === productId) {
      soldByDay.set(item.date, (soldByDay.get(item.date) ?? 0) + item.quantity);
    }
  }
  return history.map((row) => ({ ...row, sold_quantity: soldByDay.get(row.date) ?? 0 }));
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

export interface PreparationTrendPoint {
  period: string;
  preparedQuantity: number | null;
  soldQuantity: number;
  wastedQuantity: number | null;
}

/** Prepared, sold and wasted quantities over the selected periods. */
export async function getPreparationTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range),
  scope?: SalesScope
): Promise<PreparationTrendPoint[]> {
  const [prepared, wasted, sold] = await getPreparationChartRecords(range, scope);
  const units = new Set([...prepared, ...wasted].map((row) => row.preparationItem.unit));
  const hasMixedUnits = units.size > 1;
  const dateKey = (row: { date: Date }) => row.date.toISOString().slice(0, 10);
  const preparedSums = sumByPeriod(prepared, granularity, dateKey, (row) => Number(row.quantity));
  const wastedSums = sumByPeriod(wasted, granularity, dateKey, (row) => Number(row.wastedQuantity));
  const soldSums = sumByPeriod(sold, granularity, (item) => item.date, (item) => item.quantity);

  return enumeratePeriods(range, granularity).map((period) => ({
    period,
    preparedQuantity: hasMixedUnits ? null : (preparedSums.get(period) ?? 0),
    soldQuantity: soldSums.get(period) ?? 0,
    wastedQuantity: hasMixedUnits ? null : (wastedSums.get(period) ?? 0),
  }));
}
