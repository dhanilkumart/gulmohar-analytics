import { BadgePercent, ReceiptText } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { DeltaBadge, MetricCard } from "@/components/dashboard/ui-kit";
import { KpiMiniChart } from "@/components/dashboard/kpi-mini-chart";
import { RevenueOrderTrendChart, type SalesPerformancePoint } from "@/components/dashboard/revenue-order-trend-chart";
import { HourlySalesChart } from "@/components/dashboard/hourly-sales-chart";
import { OrderTypeChart } from "@/components/dashboard/order-type-chart";
import { TopSellingItemsChart } from "@/components/dashboard/top-selling-items-chart";
import { OrderHealthSection } from "@/components/dashboard/order-health-section";
import { CategoryPerformanceChart, type CategoryPerformancePoint } from "@/components/dashboard/category-performance-chart";
import { ProductPerformanceTable, type ProductSalesRow } from "@/components/dashboard/product-performance-table";
import { inr, num } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getCategories } from "@/lib/data";
import {
  getSalesSummary,
  getOrderHealth,
  getSalesTrend,
  getOrdersTrend,
  getHourlySales,
  getSalesByOrderType,
  getSalesByPaymentMethod,
  getItemSalesRanking,
  getProductProfitability,
  getDailySalesKpiTrends,
  comparePeriodValues,
  resolveTrendGranularity,
  type DateRange,
  type SalesSummary,
} from "@/lib/analytics";

/**
 * All server-side data for the Sales Analytics page, for a single
 * concrete range. Every field comes from an existing analytics function
 * — see the data-contract mapping in the integration report.
 */
async function getSalesPageData(range: DateRange) {
  const [salesSummary, orderHealth, salesTrend, ordersTrend, hourlySales, byOrderType, byPaymentMethod, productProfitability, categories, itemRankings, kpiTrends] =
    await Promise.all([
      getSalesSummary(range),
      getOrderHealth(range),
      getSalesTrend(range),
      getOrdersTrend(range),
      getHourlySales(range),
      getSalesByOrderType(range),
      getSalesByPaymentMethod(range),
      getProductProfitability(range),
      getCategories(),
      getItemSalesRanking(range),
      getDailySalesKpiTrends(range),
    ]);

  return { salesSummary, orderHealth, salesTrend, ordersTrend, hourlySales, byOrderType, byPaymentMethod, productProfitability, categories, itemRankings, kpiTrends };
}

function buildSalesKpiComparisons(
  current: SalesSummary,
  previous: SalesSummary,
  currentTotalOrders?: number,
  previousTotalOrders?: number
) {
  const currentAov = current.orderCount > 0 && current.netSales !== null ? current.netSales / current.orderCount : null;
  const previousAov = previous.orderCount > 0 && previous.netSales !== null ? previous.netSales / previous.orderCount : null;
  return {
    netSales: comparePeriodValues(current.netSales, previous.netSales),
    orderCount: comparePeriodValues(currentTotalOrders ?? current.orderCount, previousTotalOrders ?? previous.orderCount),
    aov: comparePeriodValues(currentAov, previousAov),
    itemQuantitySold: comparePeriodValues(current.itemQuantitySold, previous.itemQuantitySold),
    totalDiscount: comparePeriodValues(current.totalDiscount, previous.totalDiscount),
    totalTax: comparePeriodValues(current.totalTax, previous.totalTax),
  };
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous] = await Promise.all([
    getSalesPageData(range),
    comparison === "previous" && previousRange ? getSalesPageData(previousRange) : Promise.resolve(null),
  ]);

  const deltas = previous
    ? buildSalesKpiComparisons(
        current.salesSummary,
        previous.salesSummary,
        current.orderHealth.totalOrders,
        previous.orderHealth.totalOrders
      )
    : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const { netSales, orderCount: successfulOrderCount, itemQuantitySold, totalDiscount, totalTax } = current.salesSummary;
  const totalOrdersCount = current.orderHealth.totalOrders;
  const aov = successfulOrderCount > 0 && netSales !== null ? netSales / successfulOrderCount : null;

  // --- Sales/Orders trend: merge getSalesTrend + getOrdersTrend by period (same as Executive Dashboard) ---
  const ordersByPeriod = new Map(current.ordersTrend.map((point) => [point.period, point.orderCount]));
  const trendData: SalesPerformancePoint[] = current.salesTrend.map((point) => ({
    period: point.period,
    netSales: point.netSales,
    orderCount: ordersByPeriod.get(point.period) ?? 0,
  }));

  const comparisonOrdersByPeriod = previous
    ? new Map(previous.ordersTrend.map((point) => [point.period, point.orderCount]))
    : null;
  const comparisonTrendData: SalesPerformancePoint[] | undefined = previous
    ? previous.salesTrend.map((point) => ({
        period: point.period,
        netSales: point.netSales,
        orderCount: comparisonOrdersByPeriod?.get(point.period) ?? 0,
      }))
    : undefined;

  // --- Category Performance: group getProductProfitability by categoryId, join getCategories names ---
  const categoryNameById = new Map(current.categories.map((c) => [c.category_id, c.name]));
  const netSalesByCategory = new Map<string, number>();
  for (const product of current.productProfitability) {
    netSalesByCategory.set(product.categoryId, (netSalesByCategory.get(product.categoryId) ?? 0) + product.revenue);
  }
  const categoryPerformanceData: CategoryPerformancePoint[] = Array.from(netSalesByCategory.entries()).map(
    ([categoryId, netSalesForCategory]) => ({
      categoryId,
      name: categoryNameById.get(categoryId) ?? categoryId,
      netSales: netSalesForCategory,
    })
  );

  // --- Product Performance table: prefer itemRankings (includes unmapped items from POS) ---
  const productRows: ProductSalesRow[] =
    current.itemRankings && current.itemRankings.length > 0
      ? current.itemRankings.map((item) => ({
          productId: item.productId || item.itemName,
          name: item.itemName,
          categoryName: "—",
          quantitySold: item.quantitySold,
          revenue: item.revenue,
        }))
      : current.productProfitability.map((product) => ({
          productId: product.productId,
          name: product.name,
          categoryName: categoryNameById.get(product.categoryId) ?? "—",
          quantitySold: product.quantitySold,
          revenue: product.revenue,
        }));

  // KPI Mini chart series: real daily aggregated data
  const { points: dailyPoints } = current.kpiTrends;
  const salesMiniData = dailyPoints.map((p) => ({ date: p.date, value: p.netSales }));
  const ordersMiniData = dailyPoints.map((p) => ({ date: p.date, value: p.totalOrders }));
  const aovMiniData = dailyPoints.map((p) => ({ date: p.date, value: p.aov }));
  const itemsMiniData = dailyPoints.map((p) => ({ date: p.date, value: p.itemsSold }));

  return (
    <PageContainer title="Sales Analytics" description="Understand restaurant revenue and order behaviour">
      {/* KPI Overview (Concept A: 4 Primary Cards + Compact Financial Summary) */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <MetricCard
            label="Total Sales"
            value={inr(netSales)}
            delta={deltas?.netSales.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            rightSlot={
              <KpiMiniChart
                data={salesMiniData}
                type="area-line"
                label="Total Sales"
                valueType="currency"
                className="h-10 w-full"
              />
            }
            gradient="deep-green"
          />
          <MetricCard
            label="Total Orders"
            value={num(totalOrdersCount)}
            delta={deltas?.orderCount.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            rightSlot={
              <KpiMiniChart
                data={ordersMiniData}
                type="bar"
                label="Total Orders"
                valueType="orders"
                className="h-10 w-full"
              />
            }
            gradient="royal-violet"
          />
          <MetricCard
            label="Average Order Value"
            value={inr(aov)}
            delta={deltas?.aov.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            rightSlot={
              <KpiMiniChart
                data={aovMiniData}
                type="line"
                label="Average Order Value"
                valueType="currency"
                className="h-10 w-full"
              />
            }
            gradient="ocean-blue"
          />
          <MetricCard
            label="Items Sold"
            value={num(itemQuantitySold)}
            delta={deltas?.itemQuantitySold.percentageChange ?? undefined}
            comparisonLabel={comparisonLabel}
            rightSlot={
              <KpiMiniChart
                data={itemsMiniData}
                type="bar"
                label="Items Sold"
                valueType="items"
                className="h-10 w-full"
              />
            }
            gradient="teal"
          />
        </div>

        {/* Secondary Financial Summary (Discount & Tax) */}
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-3 border text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
                <BadgePercent className="h-4 w-4" />
              </span>
              <div>
                <span className="text-muted-foreground text-xs font-medium">Discount</span>
                <div className="flex items-center gap-2">
                  <span className="num font-semibold text-foreground">{inr(totalDiscount)}</span>
                  {typeof deltas?.totalDiscount.percentageChange === "number" ? (
                    <DeltaBadge
                      value={deltas.totalDiscount.percentageChange}
                      invert
                      label={comparisonLabel}
                      className="text-[11px]"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-border hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div>
                <span className="text-muted-foreground text-xs font-medium">Tax (GST)</span>
                <div className="flex items-center gap-2">
                  <span className="num font-semibold text-foreground">{inr(totalTax)}</span>
                  {typeof deltas?.totalTax.percentageChange === "number" ? (
                    <DeltaBadge
                      value={deltas.totalTax.percentageChange}
                      label={comparisonLabel}
                      className="text-[11px]"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="text-muted-foreground text-[11px]">
            Financial deductions & taxes included in gross sales
          </div>
        </div>
      </div>

      {/* Sales/Orders trend (Net Sales + Orders toggle, full width with ECharts) */}
      <div className="grid grid-cols-1 gap-4">
        <RevenueOrderTrendChart
          data={trendData}
          comparisonData={comparisonTrendData}
          granularity={resolveTrendGranularity(range)}
          comparisonLabel={comparisonLabel}
        />
      </div>

      {/* Hourly sales + Order type */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <HourlySalesChart data={current.hourlySales} />
        <OrderTypeChart data={current.byOrderType} />
      </div>

      {/* Top-selling items + category performance */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TopSellingItemsChart data={current.itemRankings} />
        <CategoryPerformanceChart data={categoryPerformanceData} />
      </div>

      {/* Order Health & Fulfillment Breakdown */}
      <OrderHealthSection metrics={current.orderHealth} />

      {/* Product performance table */}
      <ProductPerformanceTable rows={productRows} />
    </PageContainer>
  );
}
