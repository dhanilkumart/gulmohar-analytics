import "server-only";

import { prisma } from "@/lib/db/client";
import {
  enumeratePeriods,
  getPeriodKey,
  resolveTrendGranularity,
  type DateRange,
  type TrendGranularity,
} from "./date-range";

export interface ItemPreparationWastageMetric {
  itemId: string;
  itemCode: string;
  name: string;
  unit: string;
  preparedQuantity: number;
  wastedQuantity: number;
  remainingQuantity: number;
  wastageCost: number;
  wastagePercentage: number;
}

export interface WastageTrendPoint {
  period: string;
  wastageCost: number;
  wastedQuantity: number;
}

export interface WastageByReasonPoint {
  reason: string;
  wastedQuantity: number;
  wastageCost: number;
  percentageOfTotal: number;
}

export interface UnitQuantitySummary {
  unit: string;
  preparedQuantity: number;
  wastedQuantity: number;
  remainingQuantity: number;
}

export interface LiveWastagePreparationDashboardData {
  items: ItemPreparationWastageMetric[];
  unitSummaries: UnitQuantitySummary[];
  totalWastageCost: number;
  overallWastagePercentage: number;
  wastageTrend: WastageTrendPoint[];
  wastageByReason: WastageByReasonPoint[];
  hasData: boolean;
}

export async function getLiveWastagePreparationMetrics(
  range: DateRange,
  outletId?: string
): Promise<LiveWastagePreparationDashboardData> {
  const startDate = new Date(`${range.from}T00:00:00.000Z`);
  const endDate = new Date(`${range.to}T23:59:59.999Z`);

  const outletFilter = outletId && outletId !== "all" ? { outletId } : {};

  // Fetch all preparation logs in date range & outlet
  const prepLogs = await prisma.preparationLog.findMany({
    where: {
      ...outletFilter,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      preparationItem: { select: { id: true, code: true, name: true, unit: true, standardCost: true } },
    },
    orderBy: { date: "asc" },
  });

  // Fetch all wastage records in date range & outlet
  const wasteRecords = await prisma.wastageRecord.findMany({
    where: {
      ...outletFilter,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      preparationItem: { select: { id: true, code: true, name: true, unit: true, standardCost: true } },
    },
    orderBy: { date: "asc" },
  });

  const hasData = prepLogs.length > 0 || wasteRecords.length > 0;

  // Aggregate by preparation item
  const itemMap = new Map<
    string,
    {
      itemId: string;
      itemCode: string;
      name: string;
      unit: string;
      preparedQuantity: number;
      wastedQuantity: number;
      wastageCost: number;
    }
  >();

  for (const log of prepLogs) {
    const item = log.preparationItem;
    const existing = itemMap.get(item.id) ?? {
      itemId: item.id,
      itemCode: item.code,
      name: item.name,
      unit: item.unit,
      preparedQuantity: 0,
      wastedQuantity: 0,
      wastageCost: 0,
    };
    existing.preparedQuantity += Number(log.quantity);
    itemMap.set(item.id, existing);
  }

  for (const waste of wasteRecords) {
    const item = waste.preparationItem;
    const existing = itemMap.get(item.id) ?? {
      itemId: item.id,
      itemCode: item.code,
      name: item.name,
      unit: item.unit,
      preparedQuantity: 0,
      wastedQuantity: 0,
      wastageCost: 0,
    };
    existing.wastedQuantity += Number(waste.wastedQuantity);
    existing.wastageCost += waste.estimatedCost !== null ? Number(waste.estimatedCost) : 0;
    itemMap.set(item.id, existing);
  }

  const items: ItemPreparationWastageMetric[] = Array.from(itemMap.values()).map((i) => {
    const remaining = Math.max(0, i.preparedQuantity - i.wastedQuantity);
    const pct = i.preparedQuantity > 0 ? (i.wastedQuantity / i.preparedQuantity) * 100 : 0;
    return {
      itemId: i.itemId,
      itemCode: i.itemCode,
      name: i.name,
      unit: i.unit,
      preparedQuantity: i.preparedQuantity,
      wastedQuantity: i.wastedQuantity,
      remainingQuantity: remaining,
      wastageCost: i.wastageCost,
      wastagePercentage: pct,
    };
  });

  // Group quantities strictly by unit so incompatible units (kg, litre) are NEVER combined
  const unitMap = new Map<string, { prepared: number; wasted: number }>();
  for (const item of items) {
    const existing = unitMap.get(item.unit) ?? { prepared: 0, wasted: 0 };
    existing.prepared += item.preparedQuantity;
    existing.wasted += item.wastedQuantity;
    unitMap.set(item.unit, existing);
  }

  const unitSummaries: UnitQuantitySummary[] = Array.from(unitMap.entries()).map(([unit, val]) => ({
    unit,
    preparedQuantity: val.prepared,
    wastedQuantity: val.wasted,
    remainingQuantity: Math.max(0, val.prepared - val.wasted),
  }));

  const totalWastageCost = wasteRecords.reduce(
    (sum, w) => sum + (w.estimatedCost !== null ? Number(w.estimatedCost) : 0),
    0
  );

  // Overall wastage %: computed across items where preparation occurred
  const totalPreparedWeight = items.reduce((sum, i) => sum + i.preparedQuantity, 0);
  const totalWastedWeight = items.reduce((sum, i) => sum + i.wastedQuantity, 0);
  const overallWastagePercentage =
    totalPreparedWeight > 0 ? (totalWastedWeight / totalPreparedWeight) * 100 : 0;

  // Trend analysis (by period)
  const granularity: TrendGranularity = resolveTrendGranularity(range);
  const periods = enumeratePeriods(range, granularity);
  const trendMap = new Map<string, { cost: number; quantity: number }>();
  for (const p of periods) {
    trendMap.set(p, { cost: 0, quantity: 0 });
  }

  for (const waste of wasteRecords) {
    const dateStr = waste.date.toISOString().split("T")[0];
    const periodKey = getPeriodKey(dateStr, granularity);
    const current = trendMap.get(periodKey);
    if (current) {
      current.cost += waste.estimatedCost !== null ? Number(waste.estimatedCost) : 0;
      current.quantity += Number(waste.wastedQuantity);
    }
  }

  const wastageTrend: WastageTrendPoint[] = periods.map((p) => ({
    period: p,
    wastageCost: trendMap.get(p)?.cost || 0,
    wastedQuantity: trendMap.get(p)?.quantity || 0,
  }));

  // Group by reason
  const reasonMap = new Map<string, { qty: number; cost: number }>();
  for (const waste of wasteRecords) {
    const reason = waste.reason || "Other";
    const existing = reasonMap.get(reason) ?? { qty: 0, cost: 0 };
    existing.qty += Number(waste.wastedQuantity);
    existing.cost += waste.estimatedCost !== null ? Number(waste.estimatedCost) : 0;
    reasonMap.set(reason, existing);
  }

  const wastageByReason: WastageByReasonPoint[] = Array.from(reasonMap.entries()).map(([reason, val]) => ({
    reason,
    wastedQuantity: val.qty,
    wastageCost: val.cost,
    percentageOfTotal: totalWastageCost > 0 ? (val.cost / totalWastageCost) * 100 : 0,
  }));

  return {
    items,
    unitSummaries,
    totalWastageCost,
    overallWastagePercentage,
    wastageTrend,
    wastageByReason,
    hasData,
  };
}
