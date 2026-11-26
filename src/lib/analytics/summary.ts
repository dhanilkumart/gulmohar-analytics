import "server-only";

import { getProductsFromDatabase } from "@/lib/data/products";
import type { SalesScope } from "@/lib/data/sales";
import type { DateRange } from "./date-range";
import { getSaleItemsInRange, getSalesInRange, getNetSales } from "./sales";
import { getFoodCost } from "./profitability";
import { getWastageInRange, getWastageCostSummary } from "./wastage";
import { getBreakageInRange, getBreakageCostSummary } from "./breakage";
import { getOperatingCostsInRange, getTotalOperatingCosts } from "./operating-costs";
import {
  getEstimatedOperationalContribution,
  type OperationalContributionInputs,
} from "./operational-contribution";

export interface OperationalContributionForRange extends OperationalContributionInputs {
  range: DateRange;
  contribution: number | null;
  isComplete: boolean;
  incompleteComponents: string[];
}

/**
 * Composes sales, food cost, wastage, breakage and operating-cost data
 * for a date range into the estimated operational contribution — the
 * single call a dashboard page should make instead of assembling all of
 * these raw datasets itself.
 */
export async function getOperationalContributionForRange(
  range: DateRange,
  scope?: SalesScope
): Promise<OperationalContributionForRange> {
  const [salesInRange, saleItemsInRange, products, wastageInRange, breakageInRange, operatingCostsInRange] =
    await Promise.all([
      getSalesInRange(range, scope),
      getSaleItemsInRange(range, scope),
      getProductsFromDatabase(scope),
      getWastageInRange(range),
      getBreakageInRange(range),
      getOperatingCostsInRange(range),
    ]);

  const netSales = getNetSales(salesInRange);
  const foodCost = getFoodCost(saleItemsInRange, products);
  const wastageSummary = getWastageCostSummary(wastageInRange);
  const breakageSummary = getBreakageCostSummary(breakageInRange);
  const wastageCost = wastageSummary.totalCost;
  const breakageCost = breakageSummary.totalCost;
  const operatingCosts = getTotalOperatingCosts(operatingCostsInRange);

  const incompleteComponents: string[] = [];
  if (netSales === null) incompleteComponents.push("Sales");
  if (foodCost === null) incompleteComponents.push("Food Cost");
  if (!wastageSummary.isComplete) incompleteComponents.push("Wastage");
  if (!breakageSummary.isComplete) incompleteComponents.push("Breakage");

  const isComplete = incompleteComponents.length === 0;

  const contribution = getEstimatedOperationalContribution({
    netSales,
    foodCost,
    wastageCost,
    breakageCost,
    operatingCosts,
    isWastageCostComplete: wastageSummary.isComplete,
    isBreakageCostComplete: breakageSummary.isComplete,
  });

  return {
    range,
    netSales,
    foodCost,
    wastageCost,
    breakageCost,
    operatingCosts,
    isWastageCostComplete: wastageSummary.isComplete,
    isBreakageCostComplete: breakageSummary.isComplete,
    contribution,
    isComplete,
    incompleteComponents,
  };
}
