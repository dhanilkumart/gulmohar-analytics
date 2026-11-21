import { ChefHat, IndianRupee, Percent, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { PrepVsWastedChart } from "@/components/dashboard/prep-vs-wasted-chart";
import { WastageTrendChart } from "@/components/dashboard/wastage-trend-chart";
import { WastageByItemChart } from "@/components/dashboard/wastage-by-item-chart";
import { WastageByReasonChart } from "@/components/dashboard/wastage-by-reason-chart";
import { WastageDetailTable } from "@/components/dashboard/wastage-detail-table";
import { PreparationRecordsSection } from "@/components/dashboard/preparation-records-table";
import { WastageRecordsSection } from "@/components/dashboard/wastage-records-table";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getPreparationItems, getDepartments, getActiveMasterOptions } from "@/lib/data";
import { getLiveWastagePreparationMetrics, comparePeriodValues } from "@/lib/analytics";

export default async function WastagePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;
  const rawOutlet = (await searchParams).outletId;
  const currentOutletId = Array.isArray(rawOutlet) ? rawOutlet[0] : rawOutlet || undefined;

  const [currentMetrics, previousMetrics, prepItems, departments, masterOptions] = await Promise.all([
    getLiveWastagePreparationMetrics(range, currentOutletId),
    comparison === "previous" && previousRange
      ? getLiveWastagePreparationMetrics(previousRange, currentOutletId)
      : Promise.resolve(null),
    getPreparationItems(),
    getDepartments(),
    getActiveMasterOptions(),
  ]);

  const costDelta = previousMetrics
    ? comparePeriodValues(currentMetrics.totalWastageCost, previousMetrics.totalWastageCost)
    : null;
  const comparisonLabel = costDelta ? "vs previous period" : undefined;

  const departmentOptions = departments.map((d) => ({
    id: d.department_id,
    name: d.name,
  }));

  // Quantity summaries by unit (kg, litre, portion) so incompatible units are never added
  const unitSummariesFormatted = currentMetrics.unitSummaries.map((u) => ({
    unit: u.unit,
    prepared: `${num(u.preparedQuantity)} ${u.unit}`,
    wasted: `${num(u.wastedQuantity)} ${u.unit}`,
    remaining: `${num(u.remainingQuantity)} ${u.unit}`,
  }));

  const preparedDisplay =
    unitSummariesFormatted.length > 0
      ? unitSummariesFormatted.map((u) => u.prepared).join(" • ")
      : "0 units";

  const wastedDisplay =
    unitSummariesFormatted.length > 0
      ? unitSummariesFormatted.map((u) => u.wasted).join(" • ")
      : "0 units";

  return (
    <PageContainer
      title="Wastage & Preparation"
      description="Track kitchen batch preparation, validate available stock, and analyze operational food waste"
    >
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Prepared Quantity"
          value={preparedDisplay}
          sub={unitSummariesFormatted.length > 1 ? "Quantities displayed by unit" : "Total batch preparation"}
          icon={ChefHat}
          highlight
        />
        <MetricCard
          label="Wasted Quantity"
          value={wastedDisplay}
          sub={unitSummariesFormatted.length > 1 ? "Quantities displayed by unit" : "Total kitchen waste"}
          icon={Trash2}
          tone="negative"
        />
        <MetricCard
          label="Wastage Cost"
          value={inr(currentMetrics.totalWastageCost)}
          delta={costDelta?.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={IndianRupee}
          tone="negative"
        />
        <MetricCard
          label="Wastage %"
          value={pct(currentMetrics.overallWastagePercentage)}
          sub="Recorded waste / prepared quantity"
          icon={Percent}
          tone="warning"
        />
      </div>

      {/* Analytics Section: Pure live database records, empty states when no records */}
      {currentMetrics.hasData ? (
        <>
          <PrepVsWastedChart data={currentMetrics.items} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <WastageTrendChart data={currentMetrics.wastageTrend} />
            <WastageByItemChart data={currentMetrics.items} />
          </div>

          <WastageByReasonChart data={currentMetrics.wastageByReason} />

          <WastageDetailTable rows={currentMetrics.items} />
        </>
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">No preparation or wastage records found for this period.</p>
          <p className="mt-1 text-xs">
            Log preparation batches or kitchen waste records below to populate operational analytics.
          </p>
        </div>
      )}

      {/* Operational Workflows: Separated Preparation History and Wastage Records */}
      <div className="space-y-6">
        <PreparationRecordsSection
          preparationItems={prepItems}
          departments={departmentOptions}
        />

        <WastageRecordsSection
          preparationItems={prepItems}
          departments={departmentOptions}
          reasons={masterOptions.wastageReasons}
        />
      </div>
    </PageContainer>
  );
}
