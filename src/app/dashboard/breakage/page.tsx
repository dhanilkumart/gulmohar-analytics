import { Building2, CircleAlert, IndianRupee, Receipt } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { BreakageByDepartmentChart } from "@/components/dashboard/breakage-by-department-chart";
import { BreakageByItemChart } from "@/components/dashboard/breakage-by-item-chart";
import { BreakageDetailTable, type BreakageDetailRow } from "@/components/dashboard/breakage-detail-table";
import { BreakageRecordsSection, type DepartmentOption } from "@/components/dashboard/breakage-records-table";
import { inr, num } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getDepartments } from "@/lib/data";
import {
  getBreakageInRange,
  getBreakageCost,
  getBreakageByDepartment,
  getBreakageByItem,
  getHighestCostBreakageDepartment,
  comparePeriodValues,
  type DateRange,
} from "@/lib/analytics";

/**
 * All server-side data for the Breakage page, for a single concrete
 * range. Every field comes from `src/lib/analytics/breakage.ts` —
 * nothing is computed from raw JSON here. Unlike Manpower, every
 * breakage analytics function IS range-aware (no snapshot/current-state
 * distinction to preserve).
 */
async function getBreakagePageData(range: DateRange) {
  const [breakageInRange, byDepartment, byItem, highestCostDepartment] = await Promise.all([
    getBreakageInRange(range),
    getBreakageByDepartment(range),
    getBreakageByItem(range),
    getHighestCostBreakageDepartment(range),
  ]);

  const totalCost = getBreakageCost(breakageInRange);
  const eventCount = breakageInRange.length;

  return { breakageInRange, byDepartment, byItem, highestCostDepartment, totalCost, eventCount };
}

export default async function BreakagePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous, departments] = await Promise.all([
    getBreakagePageData(range),
    comparison === "previous" && previousRange ? getBreakagePageData(previousRange) : Promise.resolve(null),
    getDepartments(),
  ]);

  const departmentNamesById = new Map(departments.map((d) => [d.department_id, d.name]));
  const departmentOptions: DepartmentOption[] = departments.map((d) => ({
    departmentId: d.department_id,
    name: d.name,
  }));

  const averageCostPerEvent = current.eventCount > 0 ? current.totalCost / current.eventCount : 0;
  const previousAverageCostPerEvent =
    previous && previous.eventCount > 0 ? previous.totalCost / previous.eventCount : previous ? 0 : null;

  // Total Breakage Cost, Breakage Events and Average Cost/Event are all
  // range-aware and genuinely comparable to the previous period.
  // Highest-Cost Department is a categorical label (which department,
  // not a number to diff) — Lovable's own reference UI does not compare
  // it either, so no delta is shown for it here.
  const deltas = previous
    ? {
        totalCost: comparePeriodValues(current.totalCost, previous.totalCost),
        eventCount: comparePeriodValues(current.eventCount, previous.eventCount),
        averageCostPerEvent:
          previousAverageCostPerEvent !== null
            ? comparePeriodValues(averageCostPerEvent, previousAverageCostPerEvent)
            : null,
      }
    : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const detailRows: BreakageDetailRow[] = current.breakageInRange
    .map((row) => ({
      breakageId: row.breakage_id,
      date: row.date,
      departmentName: departmentNamesById.get(row.department_id) ?? row.department_id,
      item: row.item,
      quantity: row.quantity,
      cost: row.estimated_cost,
      reason: row.reason,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <PageContainer
      title="Breakage"
      description="Manual breakage cost by item, reason and department."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Breakage Cost"
          value={inr(current.totalCost)}
          delta={deltas?.totalCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={IndianRupee}
          tone="negative"
          highlight
        />
        <MetricCard
          label="Breakage Events"
          value={num(current.eventCount)}
          delta={deltas?.eventCount.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={Receipt}
          tone="accent"
        />
        <MetricCard
          label="Average Cost per Event"
          value={inr(averageCostPerEvent)}
          delta={deltas?.averageCostPerEvent?.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={deltas?.averageCostPerEvent ? comparisonLabel : undefined}
          icon={CircleAlert}
          tone="warning"
        />
        <MetricCard
          label="Highest-Cost Department"
          value={current.highestCostDepartment?.departmentName ?? "—"}
          sub={current.highestCostDepartment ? inr(current.highestCostDepartment.breakageCost) : "No breakage recorded"}
          icon={Building2}
          tone="negative"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakageByDepartmentChart data={current.byDepartment} />
        <BreakageByItemChart data={current.byItem} />
      </div>

      <BreakageDetailTable rows={detailRows} />

      <BreakageRecordsSection departments={departmentOptions} />
    </PageContainer>
  );
}
