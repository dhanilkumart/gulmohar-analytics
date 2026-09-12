import { IndianRupee, ReceiptIndianRupee, ChefHat, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { SalesPerformanceChart, type SalesPerformancePoint } from "@/components/dashboard/sales-performance-chart";
import { CategoryPerformanceChart, type CategoryPerformancePoint } from "@/components/dashboard/category-performance-chart";
import { TopPerformingItems } from "@/components/dashboard/top-performing-items";
import { ItemsNeedingAttention, type AttentionProduct } from "@/components/dashboard/items-needing-attention";
import { FoodPrepWastageChart, type PreparationChartPoint } from "@/components/dashboard/food-prep-wastage-chart";
import { ManpowerOverview } from "@/components/dashboard/manpower-overview";
import { BreakageSummary } from "@/components/dashboard/breakage-summary";
import { ManagementAttention } from "@/components/dashboard/management-attention";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getCategories, getProducts } from "@/lib/data";
import {
  getSalesSummary,
  getSalesTrend,
  getOrdersTrend,
  getProductProfitability,
  getLossMakingProducts,
  getHighSalesLowMarginProducts,
  getPreparationVsSoldVsWasted,
  getWastageInRange,
  getWastageCost,
  getAttendanceInRange,
  getAttendanceSummary,
  getDepartmentManpower,
  getBreakageInRange,
  getBreakageCost,
  getHighestCostBreakageDepartment,
  getOperationalContributionForRange,
  comparePeriodValues,
  type DateRange,
  type OperationalContributionForRange,
} from "@/lib/analytics";

/**
 * All server-side data for the Executive Dashboard, for a single
 * concrete range. Fetched once for the current range, and again for the
 * previous range only when comparison is active (see the page component
 * below) — every field here comes from an existing analytics function;
 * nothing is computed from raw JSON in this file.
 */
async function getExecutiveDashboardData(range: DateRange) {
  const [
    contribution,
    salesSummary,
    salesTrend,
    ordersTrend,
    productProfitability,
    categories,
    preparationTotals,
    products,
    wastageInRange,
    attendanceInRange,
    departments,
    breakageInRange,
    highestCostDepartment,
  ] = await Promise.all([
    getOperationalContributionForRange(range),
    getSalesSummary(range),
    getSalesTrend(range),
    getOrdersTrend(range),
    getProductProfitability(range),
    getCategories(),
    getPreparationVsSoldVsWasted(range),
    getProducts(),
    getWastageInRange(range),
    getAttendanceInRange(range),
    getDepartmentManpower(),
    getBreakageInRange(range),
    getHighestCostBreakageDepartment(range),
  ]);

  return {
    contribution,
    orderCount: salesSummary.orderCount,
    salesTrend,
    ordersTrend,
    productProfitability,
    categories,
    preparationTotals,
    products,
    wastageCost: getWastageCost(wastageInRange),
    attendance: getAttendanceSummary(attendanceInRange),
    departments,
    breakageCost: getBreakageCost(breakageInRange),
    breakageEventCount: breakageInRange.length,
    highestCostDepartment,
  };
}

function buildKpiComparisons(
  current: Pick<OperationalContributionForRange, "netSales" | "foodCost" | "wastageCost" | "breakageCost" | "contribution">,
  currentOrderCount: number,
  previous: Pick<OperationalContributionForRange, "netSales" | "foodCost" | "wastageCost" | "breakageCost" | "contribution">,
  previousOrderCount: number
) {
  return {
    netSales: comparePeriodValues(current.netSales, previous.netSales),
    orderCount: comparePeriodValues(currentOrderCount, previousOrderCount),
    foodCost: comparePeriodValues(current.foodCost, previous.foodCost),
    wastageCost: comparePeriodValues(current.wastageCost, previous.wastageCost),
    breakageCost: comparePeriodValues(current.breakageCost, previous.breakageCost),
    contribution: comparePeriodValues(current.contribution, previous.contribution),
  };
}

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous] = await Promise.all([
    getExecutiveDashboardData(range),
    comparison === "previous" && previousRange
      ? getExecutiveDashboardData(previousRange)
      : Promise.resolve(null),
  ]);

  const deltas =
    previous !== null
      ? buildKpiComparisons(current.contribution, current.orderCount, previous.contribution, previous.orderCount)
      : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const { netSales, foodCost, contribution } = current.contribution;
  const foodCostPct = netSales > 0 ? (foodCost / netSales) * 100 : 0;
  const wastagePctOfSales = netSales > 0 ? (current.wastageCost / netSales) * 100 : 0;
  const contributionPct = netSales > 0 ? (contribution / netSales) * 100 : 0;

  // --- Sales Performance chart: merge getSalesTrend + getOrdersTrend by period ---
  const ordersByPeriod = new Map(current.ordersTrend.map((point) => [point.period, point.orderCount]));
  const salesPerformanceData: SalesPerformancePoint[] = current.salesTrend.map((point) => ({
    period: point.period,
    netSales: point.netSales,
    orderCount: ordersByPeriod.get(point.period) ?? 0,
  }));

  // --- Category Performance: group getProductProfitability by categoryId, join getCategories names ---
  const categoryNameById = new Map(current.categories.map((c) => [c.category_id, c.name]));
  const netSalesByCategory = new Map<string, number>();
  for (const product of current.productProfitability) {
    netSalesByCategory.set(
      product.categoryId,
      (netSalesByCategory.get(product.categoryId) ?? 0) + product.revenue
    );
  }
  const categoryPerformanceData: CategoryPerformancePoint[] = Array.from(
    netSalesByCategory.entries()
  ).map(([categoryId, netSalesForCategory]) => ({
    categoryId,
    name: categoryNameById.get(categoryId) ?? categoryId,
    netSales: netSalesForCategory,
  }));

  // --- Items Needing Attention: loss-making + high-sales/low-margin, deduped ---
  const lossMaking = getLossMakingProducts(current.productProfitability);
  const highSalesLowMargin = getHighSalesLowMarginProducts(current.productProfitability);
  const lossMakingIds = new Set(lossMaking.map((p) => p.productId));
  const attentionProducts: AttentionProduct[] = [
    ...lossMaking.map((product) => ({ product, classification: "Loss-Making Product" as const })),
    ...highSalesLowMargin
      .filter((product) => !lossMakingIds.has(product.productId))
      .map((product) => ({ product, classification: "High Sales / Low Margin" as const })),
  ];

  // --- Food Preparation & Wastage: join getPreparationVsSoldVsWasted with product names ---
  const productNameById = new Map(current.products.map((p) => [p.product_id, p.name]));
  const preparationChartData: PreparationChartPoint[] = current.preparationTotals
    .map((totals) => ({
      productId: totals.productId,
      name: productNameById.get(totals.productId) ?? totals.productId,
      prepared: totals.preparedQuantity,
      sold: totals.soldQuantity,
      wasted: totals.wastedQuantity,
    }))
    .sort((a, b) => b.prepared - a.prepared);
  const totalPrepared = current.preparationTotals.reduce((sum, p) => sum + p.preparedQuantity, 0);
  const totalSold = current.preparationTotals.reduce((sum, p) => sum + p.soldQuantity, 0);
  const totalWasted = current.preparationTotals.reduce((sum, p) => sum + p.wastedQuantity, 0);
  const preparationWastagePct = totalPrepared > 0 ? (totalWasted / totalPrepared) * 100 : 0;
  const sellThroughPct = totalPrepared > 0 ? (totalSold / totalPrepared) * 100 : 0;

  // --- Management Attention: the two approved threshold-free insights ---
  const departmentsOverBenchmark = current.departments.filter((dept) => dept.variance > 0);

  return (
    <PageContainer
      title="Executive Dashboard"
      description="Restaurant performance overview and management analytics"
    >
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Net Sales"
          value={inr(netSales)}
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
          value={inr(foodCost)}
          delta={deltas?.foodCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          sub={`${pct(foodCostPct)} of net sales`}
          icon={ChefHat}
          tone="warning"
        />
        <Link href="/dashboard/wastage" className="block">
          <MetricCard
            label="Wastage"
            value={inr(current.wastageCost)}
            delta={deltas?.wastageCost.percentageChange ?? undefined}
            deltaInvert
            comparisonLabel={comparisonLabel}
            sub={`${pct(wastagePctOfSales)} of net sales`}
            icon={Trash2}
            tone="negative"
          />
        </Link>
        <MetricCard
          label="Est. Operational Contribution"
          value={inr(contribution)}
          delta={deltas?.contribution.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          sub={`${pct(contributionPct)} of net sales`}
          icon={TrendingUp}
          tone="positive"
        />
      </div>

      {/* Sales + category */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SalesPerformanceChart data={salesPerformanceData} />
        <CategoryPerformanceChart data={categoryPerformanceData} />
      </div>

      {/* Top items + attention */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TopPerformingItems items={current.productProfitability} categoryNameById={categoryNameById} />
        <ItemsNeedingAttention items={attentionProducts} />
      </div>

      {/* Preparation & wastage + manpower/breakage */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="surface-card flex flex-col p-5 xl:col-span-2">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Food Preparation &amp; Wastage</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Prepared, sold and wasted quantities for tracked preparation items.
              </p>
            </div>
            <Link
              href="/dashboard/wastage"
              className="border-border hover:bg-secondary inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              View Wastage Analysis
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_190px]">
            <FoodPrepWastageChart data={preparationChartData} />
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-muted-foreground text-[11px]">Wastage Cost</p>
                <p className="num mt-1 text-lg font-bold">{inr(current.wastageCost)}</p>
              </div>
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-muted-foreground text-[11px]">Wastage %</p>
                <p className="num text-danger mt-1 text-lg font-bold">{pct(preparationWastagePct)}</p>
              </div>
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-muted-foreground text-[11px]">Sell-through %</p>
                <p className="num text-success mt-1 text-lg font-bold">{pct(sellThroughPct)}</p>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            <span className="bg-warning mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" />
            Based on tracked preparation items only ({current.preparationTotals.length} of{" "}
            {current.products.length} menu products) — not every restaurant product.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <ManpowerOverview attendance={current.attendance} departments={current.departments} />
          <BreakageSummary
            totalCost={current.breakageCost}
            eventCount={current.breakageEventCount}
            highestCostDepartment={current.highestCostDepartment}
            comparison={deltas?.breakageCost}
          />
        </div>
      </div>

      {/* Management attention */}
      <ManagementAttention
        highSalesLowMarginProducts={highSalesLowMargin}
        departmentsOverBenchmark={departmentsOverBenchmark}
      />
    </PageContainer>
  );
}
