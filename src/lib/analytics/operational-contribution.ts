import "server-only";

/**
 * Estimated operational contribution, per business-rules.md:
 *   sales - food cost - wastage - breakage - variable operating costs.
 *
 * business-rules.md explicitly warns: do NOT label this "net profit"
 * unless all relevant accounting expenses are included. operating-costs.json
 * only contains "Utilities" and "Gas" (no rent, no full payroll, no other
 * overheads), so this is a partial contribution estimate, not a P&L
 * bottom line. Every consumer of this value (UI copy included) must keep
 * calling it "estimated operational contribution".
 */
export interface OperationalContributionInputs {
  netSales: number | null;
  foodCost: number | null;
  wastageCost: number;
  breakageCost: number;
  operatingCosts: number;
  isWastageCostComplete?: boolean;
  isBreakageCostComplete?: boolean;
}

export function getEstimatedOperationalContribution(
  inputs: OperationalContributionInputs
): number | null {
  const { netSales, foodCost, wastageCost, breakageCost, operatingCosts, isWastageCostComplete = true, isBreakageCostComplete = true } = inputs;
  if (netSales === null || foodCost === null || !isWastageCostComplete || !isBreakageCostComplete) {
    return null;
  }
  return netSales - foodCost - wastageCost - breakageCost - operatingCosts;
}
