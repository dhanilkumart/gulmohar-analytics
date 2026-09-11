import "server-only";

import { getBreakage, getDepartments } from "@/lib/data";
import type { Breakage } from "@/types";
import { filterByDateRange, type DateRange } from "./date-range";

export async function getBreakageInRange(range: DateRange): Promise<Breakage[]> {
  const breakage = await getBreakage();
  return filterByDateRange(breakage, range, (row) => row.date);
}

export function getBreakageCost(breakage: Breakage[]): number {
  return breakage.reduce((sum, row) => sum + row.estimated_cost, 0);
}

export interface BreakageByDepartment {
  departmentId: string;
  departmentName: string;
  eventCount: number;
  breakageCost: number;
}

/** Breakage grouped by `Breakage.department_id`, joined to department names. */
export async function getBreakageByDepartment(range: DateRange): Promise<BreakageByDepartment[]> {
  const [breakageInRange, departments] = await Promise.all([
    getBreakageInRange(range),
    getDepartments(),
  ]);
  const departmentNamesById = new Map(departments.map((d) => [d.department_id, d.name]));

  const byDepartment = new Map<string, { eventCount: number; breakageCost: number }>();
  for (const row of breakageInRange) {
    const existing = byDepartment.get(row.department_id) ?? { eventCount: 0, breakageCost: 0 };
    existing.eventCount += 1;
    existing.breakageCost += row.estimated_cost;
    byDepartment.set(row.department_id, existing);
  }

  return Array.from(byDepartment.entries()).map(([departmentId, agg]) => ({
    departmentId,
    departmentName: departmentNamesById.get(departmentId) ?? departmentId,
    ...agg,
  }));
}

export interface BreakageByItem {
  /** `Breakage.item` is free text, not a `products.json` foreign key. */
  item: string;
  eventCount: number;
  quantity: number;
  breakageCost: number;
}

/** Breakage grouped by `Breakage.item` (free text — see docs/architecture.md). */
export async function getBreakageByItem(range: DateRange): Promise<BreakageByItem[]> {
  const breakageInRange = await getBreakageInRange(range);
  const byItem = new Map<string, { eventCount: number; quantity: number; breakageCost: number }>();

  for (const row of breakageInRange) {
    const existing = byItem.get(row.item) ?? { eventCount: 0, quantity: 0, breakageCost: 0 };
    existing.eventCount += 1;
    existing.quantity += row.quantity;
    existing.breakageCost += row.estimated_cost;
    byItem.set(row.item, existing);
  }

  return Array.from(byItem.entries()).map(([item, agg]) => ({ item, ...agg }));
}

/**
 * The department with the highest breakage cost in the range, or `null`
 * when there is no breakage at all. Composes `getBreakageByDepartment`
 * rather than re-aggregating `Breakage[]`.
 */
export async function getHighestCostBreakageDepartment(
  range: DateRange
): Promise<BreakageByDepartment | null> {
  const byDepartment = await getBreakageByDepartment(range);
  if (byDepartment.length === 0) return null;
  return byDepartment.reduce((highest, current) =>
    current.breakageCost > highest.breakageCost ? current : highest
  );
}
