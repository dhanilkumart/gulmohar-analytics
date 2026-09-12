import {
  CalendarX2,
  ChefHat,
  CircleAlert,
  IndianRupee,
  PackageX,
  Percent,
  Receipt,
  ReceiptIndianRupee,
  TrendingUp,
  UserCheck,
  UserMinus,
  Wallet,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard, SectionHeader } from "@/components/dashboard/ui-kit";
import { ReportProductLists } from "@/components/dashboard/report-product-lists";
import { ReportComparisonTable, type ComparisonRow } from "@/components/dashboard/report-comparison-table";
import { ReportExportControls, type ReportCsvRow } from "@/components/dashboard/report-export-controls";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, presetLabel, type RawSearchParams } from "@/lib/date-range-params";
import {
  getOperationalContributionForRange,
  getSalesSummary,
  getPreparationVsSoldVsWasted,
  getBreakageInRange,
  getAttendanceInRange,
  getAttendanceSummary,
  getProductProfitability,
  getGrossFoodMargin,
  getHighProfitProducts,
  getLossMakingProducts,
  getHighSalesLowMarginProducts,
  comparePeriodValues,
  type DateRange,
} from "@/lib/analytics";

/**
 * All server-side data for the Reports page, for a single concrete
 * range. This page is a consolidated view over the SAME analytics
 * functions already used on the Executive Dashboard, Sales,
 * Profitability, Wastage, Breakage and Manpower pages — it introduces no
 * new aggregation logic, only composes existing results.
 */
async function getReportsPageData(range: DateRange) {
  const [contribution, salesSummary, preparationTotals, breakageInRange, attendanceInRange, productProfitability] =
    await Promise.all([
      getOperationalContributionForRange(range),
      getSalesSummary(range),
      getPreparationVsSoldVsWasted(range),
      getBreakageInRange(range),
      getAttendanceInRange(range),
      getProductProfitability(range),
    ]);

  const preparedQuantity = preparationTotals.reduce((sum, p) => sum + p.preparedQuantity, 0);
  const wastedQuantity = preparationTotals.reduce((sum, p) => sum + p.wastedQuantity, 0);
  const wastagePercentage = preparedQuantity > 0 ? (wastedQuantity / preparedQuantity) * 100 : 0;

  const breakageEventCount = breakageInRange.length;
  const averageBreakageCostPerEvent = breakageEventCount > 0 ? contribution.breakageCost / breakageEventCount : 0;

  const attendance = getAttendanceSummary(attendanceInRange);

  const grossFoodMargin = getGrossFoodMargin(contribution.netSales, contribution.foodCost);
  const marginPercentage = contribution.netSales > 0 ? (grossFoodMargin / contribution.netSales) * 100 : 0;

  return {
    contribution,
    orderCount: salesSummary.orderCount,
    preparedQuantity,
    wastedQuantity,
    wastagePercentage,
    breakageEventCount,
    averageBreakageCostPerEvent,
    attendance,
    grossFoodMargin,
    marginPercentage,
    productProfitability,
  };
}

type ReportsPageData = Awaited<ReturnType<typeof getReportsPageData>>;

function buildDeltas(current: ReportsPageData, previous: ReportsPageData) {
  return {
    netSales: comparePeriodValues(current.contribution.netSales, previous.contribution.netSales),
    orderCount: comparePeriodValues(current.orderCount, previous.orderCount),
    foodCost: comparePeriodValues(current.contribution.foodCost, previous.contribution.foodCost),
    grossFoodMargin: comparePeriodValues(current.grossFoodMargin, previous.grossFoodMargin),
    marginPercentage: comparePeriodValues(current.marginPercentage, previous.marginPercentage),
    wastageCost: comparePeriodValues(current.contribution.wastageCost, previous.contribution.wastageCost),
    wastedQuantity: comparePeriodValues(current.wastedQuantity, previous.wastedQuantity),
    wastagePercentage: comparePeriodValues(current.wastagePercentage, previous.wastagePercentage),
    breakageCost: comparePeriodValues(current.contribution.breakageCost, previous.contribution.breakageCost),
    breakageEventCount: comparePeriodValues(current.breakageEventCount, previous.breakageEventCount),
    averageBreakageCostPerEvent: comparePeriodValues(
      current.averageBreakageCostPerEvent,
      previous.averageBreakageCostPerEvent
    ),
    present: comparePeriodValues(current.attendance.presentCount, previous.attendance.presentCount),
    absent: comparePeriodValues(current.attendance.absentCount, previous.attendance.absentCount),
    leave: comparePeriodValues(current.attendance.leaveCount, previous.attendance.leaveCount),
    attendanceRate: comparePeriodValues(current.attendance.attendanceRate, previous.attendance.attendanceRate),
    operatingCosts: comparePeriodValues(current.contribution.operatingCosts, previous.contribution.operatingCosts),
    contribution: comparePeriodValues(current.contribution.contribution, previous.contribution.contribution),
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous] = await Promise.all([
    getReportsPageData(range),
    comparison === "previous" && previousRange ? getReportsPageData(previousRange) : Promise.resolve(null),
  ]);

  const deltas = previous ? buildDeltas(current, previous) : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const topProducts = getHighProfitProducts(current.productProfitability, 5);
  const problemProducts = getLossMakingProducts(current.productProfitability).slice(0, 5);
  const highSalesLowMarginProducts = getHighSalesLowMarginProducts(current.productProfitability).slice(0, 5);

  const comparisonRows: ComparisonRow[] = deltas
    ? [
        { label: "Net Sales", comparison: deltas.netSales, money: true },
        { label: "Orders", comparison: deltas.orderCount, money: false },
        { label: "Food Cost", comparison: deltas.foodCost, money: true, invert: true },
        { label: "Gross Food Margin", comparison: deltas.grossFoodMargin, money: true },
        { label: "Wastage Cost", comparison: deltas.wastageCost, money: true, invert: true },
        { label: "Breakage Cost", comparison: deltas.breakageCost, money: true, invert: true },
        { label: "Operating Costs", comparison: deltas.operatingCosts, money: true, invert: true },
        { label: "Estimated Operational Contribution", comparison: deltas.contribution, money: true },
      ]
    : [];

  const csvRows: ReportCsvRow[] = [
    { label: "Report Period", value: `${range.from} to ${range.to}` },
    { label: "Net Sales", value: current.contribution.netSales.toFixed(2) },
    { label: "Orders", value: String(current.orderCount) },
    { label: "Food Cost", value: current.contribution.foodCost.toFixed(2) },
    { label: "Gross Food Margin", value: current.grossFoodMargin.toFixed(2) },
    { label: "Margin %", value: `${current.marginPercentage.toFixed(2)}%` },
    { label: "Wastage Quantity", value: String(current.wastedQuantity) },
    { label: "Wastage Cost", value: current.contribution.wastageCost.toFixed(2) },
    { label: "Wastage %", value: `${current.wastagePercentage.toFixed(2)}%` },
    { label: "Breakage Cost", value: current.contribution.breakageCost.toFixed(2) },
    { label: "Breakage Events", value: String(current.breakageEventCount) },
    { label: "Average Cost per Breakage Event", value: current.averageBreakageCostPerEvent.toFixed(2) },
    { label: "Present", value: String(current.attendance.presentCount) },
    { label: "Absent", value: String(current.attendance.absentCount) },
    { label: "Leave", value: String(current.attendance.leaveCount) },
    { label: "Attendance %", value: `${current.attendance.attendanceRate.toFixed(2)}%` },
    { label: "Operating Costs", value: current.contribution.operatingCosts.toFixed(2) },
    { label: "Estimated Operational Contribution", value: current.contribution.contribution.toFixed(2) },
  ];

  return (
    <PageContainer
      title="Reports"
      description="Consolidated management report — sales, profitability, wastage, breakage and attendance for the selected period."
    >
      <section className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-muted-foreground text-xs">Report Period</p>
          <p className="mt-1 text-base font-semibold">
            {presetLabel(resolvedRange.selection.preset)}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              ({range.from} to {range.to})
            </span>
          </p>
          {previous && previousRange ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Compared to {previousRange.from} to {previousRange.to}
            </p>
          ) : (
            <p className="text-muted-foreground mt-1 text-xs">
              Use the Compare control above to add a previous-period comparison.
            </p>
          )}
        </div>
        <ReportExportControls rows={csvRows} fileName={`report-${range.from}_to_${range.to}`} />
      </section>

      {/* Executive summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Net Sales"
          value={inr(current.contribution.netSales)}
          delta={deltas?.netSales.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={IndianRupee}
          highlight
        />
        <MetricCard
          label="Orders"
          value={num(current.orderCount)}
          delta={deltas?.orderCount.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={ReceiptIndianRupee}
          tone="accent"
        />
        <MetricCard
          label="Food Cost"
          value={inr(current.contribution.foodCost)}
          delta={deltas?.foodCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={ChefHat}
          tone="warning"
        />
        <MetricCard
          label="Wastage Cost"
          value={inr(current.contribution.wastageCost)}
          delta={deltas?.wastageCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={PackageX}
          tone="negative"
        />
        <MetricCard
          label="Breakage Cost"
          value={inr(current.contribution.breakageCost)}
          delta={deltas?.breakageCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={Receipt}
          tone="negative"
        />
        <MetricCard
          label="Est. Operational Contribution"
          value={inr(current.contribution.contribution)}
          delta={deltas?.contribution.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={TrendingUp}
          tone="positive"
        />
      </div>

      {/* Sales & Profitability */}
      <section className="surface-card p-5">
        <SectionHeader
          title="Sales & Profitability"
          description="Gross food margin and management-level product performance."
        />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            label="Gross Food Margin"
            value={inr(current.grossFoodMargin)}
            delta={deltas?.grossFoodMargin.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            icon={Wallet}
            tone="positive"
          />
          <MetricCard
            label="Margin %"
            value={pct(current.marginPercentage)}
            delta={deltas?.marginPercentage.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            icon={Percent}
            tone="accent"
          />
        </div>
        <div className="mt-4">
          <ReportProductLists
            topProducts={topProducts}
            problemProducts={problemProducts}
            highSalesLowMarginProducts={highSalesLowMarginProducts}
          />
        </div>
      </section>

      {/* Wastage & Breakage */}
      <section className="surface-card p-5">
        <SectionHeader title="Wastage & Breakage" description="Preparation wastage and manual breakage for the period." />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Wastage Quantity"
            value={num(current.wastedQuantity)}
            delta={deltas?.wastedQuantity.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            icon={PackageX}
            tone="negative"
          />
          <MetricCard
            label="Wastage %"
            value={pct(current.wastagePercentage)}
            delta={deltas?.wastagePercentage.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            icon={Percent}
            tone="warning"
          />
          <MetricCard
            label="Breakage Events"
            value={num(current.breakageEventCount)}
            delta={deltas?.breakageEventCount.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            icon={Receipt}
            tone="accent"
          />
          <MetricCard
            label="Average Cost per Event"
            value={inr(current.averageBreakageCostPerEvent)}
            delta={deltas?.averageBreakageCostPerEvent.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            icon={CircleAlert}
            tone="negative"
          />
        </div>
      </section>

      {/* Attendance */}
      <section className="surface-card p-5">
        <SectionHeader title="Attendance" description="Company-wide attendance for the selected period." />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Present"
            value={num(current.attendance.presentCount)}
            delta={deltas?.present.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            icon={UserCheck}
            tone="positive"
          />
          <MetricCard
            label="Absent"
            value={num(current.attendance.absentCount)}
            delta={deltas?.absent.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            icon={UserMinus}
            tone="negative"
          />
          <MetricCard
            label="Leave"
            value={num(current.attendance.leaveCount)}
            delta={deltas?.leave.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            icon={CalendarX2}
            tone="warning"
          />
          <MetricCard
            label="Attendance %"
            value={pct(current.attendance.attendanceRate)}
            delta={deltas?.attendanceRate.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            icon={Percent}
            tone="accent"
          />
        </div>
      </section>

      {deltas ? (
        <ReportComparisonTable rows={comparisonRows} />
      ) : (
        <section className="surface-card p-5">
          <SectionHeader
            title="Comparison"
            description="Set the Compare control above to “Previous Period” to see a current-vs-previous breakdown here."
          />
        </section>
      )}

      <p className="text-muted-foreground text-xs">
        Estimated Operational Contribution reflects net sales less food cost, wastage, breakage and operating costs
        currently tracked by this system (Utilities and Gas only). It is not a complete accounting profit measure and
        must not be read as net profit.
      </p>
    </PageContainer>
  );
}
