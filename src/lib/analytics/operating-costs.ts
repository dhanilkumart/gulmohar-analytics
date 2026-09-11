import "server-only";

import { getOperatingCosts } from "@/lib/data";
import type { OperatingCost } from "@/types";
import { filterByDateRange, type DateRange } from "./date-range";

export async function getOperatingCostsInRange(range: DateRange): Promise<OperatingCost[]> {
  const operatingCosts = await getOperatingCosts();
  return filterByDateRange(operatingCosts, range, (row) => row.date);
}

export function getTotalOperatingCosts(operatingCosts: OperatingCost[]): number {
  return operatingCosts.reduce((sum, row) => sum + row.amount, 0);
}
