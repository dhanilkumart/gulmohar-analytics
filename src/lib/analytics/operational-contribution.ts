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
  netSales: number;
  foodCost: number;
  wastageCost: number;
  breakageCost: number;
  operatingCosts: number;
}

export function getEstimatedOperationalContribution(
  inputs: OperationalContributionInputs
): number {
  const { netSales, foodCost, wastageCost, breakageCost, operatingCosts } = inputs;
  return netSales - foodCost - wastageCost - breakageCost - operatingCosts;
}
