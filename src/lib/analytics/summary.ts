import "server-only";

import { getProducts } from "@/lib/data";
import type { DateRange } from "./date-range";
import { getSaleItemsInRange, getSalesInRange, getNetSales } from "./sales";
import { getFoodCost } from "./profitability";
import { getWastageCost, getWastageInRange } from "./wastage";
import { getBreakageCost, getBreakageInRange } from "./breakage";
import { getOperatingCostsInRange, getTotalOperatingCosts } from "./operating-costs";
import {
  getEstimatedOperationalContribution,
  type OperationalContributionInputs,
} from "./operational-contribution";

export interface OperationalContributionForRange extends OperationalContributionInputs {
  range: DateRange;
  contribution: number;
}

/**
 * Composes sales, food cost, wastage, breakage and operating-cost data
 * for a date range into the estimated operational contribution — the
 * single call a dashboard page should make instead of assembling all of
 * these raw datasets itself.
 */
export async function getOperationalContributionForRange(
  range: DateRange
): Promise<OperationalContributionForRange> {
  const [salesInRange, saleItemsInRange, products, wastageInRange, breakageInRange, operatingCostsInRange] =
    await Promise.all([
      getSalesInRange(range),
      getSaleItemsInRange(range),
      getProducts(),
      getWastageInRange(range),
      getBreakageInRange(range),
      getOperatingCostsInRange(range),
    ]);

  const netSales = getNetSales(salesInRange);
  const foodCost = getFoodCost(saleItemsInRange, products);
  const wastageCost = getWastageCost(wastageInRange);
  const breakageCost = getBreakageCost(breakageInRange);
  const operatingCosts = getTotalOperatingCosts(operatingCostsInRange);

  return {
    range,
    netSales,
    foodCost,
    wastageCost,
    breakageCost,
    operatingCosts,
    contribution: getEstimatedOperationalContribution({
      netSales,
      foodCost,
      wastageCost,
      breakageCost,
      operatingCosts,
    }),
  };
}
