import { BadgePercent, IndianRupee, Package, ReceiptIndianRupee, ShoppingBag, TrendingUp } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { SalesPerformanceChart, type SalesPerformancePoint } from "@/components/dashboard/sales-performance-chart";
import { HourlySalesChart } from "@/components/dashboard/hourly-sales-chart";
import { PaymentMethodChart } from "@/components/dashboard/payment-method-chart";
import { OrderTypeChart } from "@/components/dashboard/order-type-chart";
import { CategoryPerformanceChart, type CategoryPerformancePoint } from "@/components/dashboard/category-performance-chart";
import { ProductPerformanceTable, type ProductSalesRow } from "@/components/dashboard/product-performance-table";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getCategories } from "@/lib/data";
import {
  getSalesSummary,
  getSalesTrend,
  getOrdersTrend,
  getHourlySales,
  getSalesByOrderType,
  getSalesByPaymentMethod,
  getProductProfitability,
  comparePeriodValues,
  type DateRange,
  type SalesSummary,
} from "@/lib/analytics";

/**
 * All server-side data for the Sales Analytics page, for a single
 * concrete range. Every field comes from an existing analytics function
 * — see the data-contract mapping in the integration report.
 */
async function getSalesPageData(range: DateRange) {
  const [salesSummary, salesTrend, ordersTrend, hourlySales, byOrderType, byPaymentMethod, productProfitability, categories] =
    await Promise.all([
      getSalesSummary(range),
      getSalesTrend(range),
      getOrdersTrend(range),
      getHourlySales(range),
      getSalesByOrderType(range),
      getSalesByPaymentMethod(range),
      getProductProfitability(range),
      getCategories(),
    ]);

  return { salesSummary, salesTrend, ordersTrend, hourlySales, byOrderType, byPaymentMethod, productProfitability, categories };
}

function buildSalesKpiComparisons(current: SalesSummary, previous: SalesSummary) {
  const currentAov = current.orderCount > 0 ? current.netSales / current.orderCount : 0;
  const previousAov = previous.orderCount > 0 ? previous.netSales / previous.orderCount : 0;
  return {
    netSales: comparePeriodValues(current.netSales, previous.netSales),
    orderCount: comparePeriodValues(current.orderCount, previous.orderCount),
    aov: comparePeriodValues(currentAov, previousAov),
    itemQuantitySold: comparePeriodValues(current.itemQuantitySold, previous.itemQuantitySold),
    totalDiscount: comparePeriodValues(current.totalDiscount, previous.totalDiscount),
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

  const deltas = previous ? buildSalesKpiComparisons(current.salesSummary, previous.salesSummary) : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const { netSales, orderCount, itemQuantitySold, totalDiscount } = current.salesSummary;
  const aov = orderCount > 0 ? netSales / orderCount : 0;

  // --- Sales/Orders trend: merge getSalesTrend + getOrdersTrend by period (same as Executive Dashboard) ---
  const ordersByPeriod = new Map(current.ordersTrend.map((point) => [point.period, point.orderCount]));
  const trendData: SalesPerformancePoint[] = current.salesTrend.map((point) => ({
    period: point.period,
    netSales: point.netSales,
    orderCount: ordersByPeriod.get(point.period) ?? 0,
  }));

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

  // --- Product Performance table: sales-only fields from getProductProfitability (no food cost/margin) ---
  const productRows: ProductSalesRow[] = current.productProfitability.map((product) => ({
    productId: product.productId,
    name: product.name,
    categoryName: categoryNameById.get(product.categoryId) ?? product.categoryId,
    quantitySold: product.quantitySold,
    revenue: product.revenue,
  }));

  return (
    <PageContainer title="Sales Analytics" description="Understand restaurant revenue and order behaviour">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
          value={num(orderCount)}
          delta={deltas?.orderCount.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={ReceiptIndianRupee}
          tone="accent"
        />
        <MetricCard
          label="Average Order Value"
          value={inr(aov)}
          delta={deltas?.aov.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={ShoppingBag}
        />
        <MetricCard
          label="Items Sold"
          value={num(itemQuantitySold)}
          delta={deltas?.itemQuantitySold.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={Package}
        />
        <MetricCard
          label="Discount"
          value={inr(totalDiscount)}
          delta={deltas?.totalDiscount.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={BadgePercent}
          tone="warning"
        />
        <MetricCard
          label="Sales Growth"
          value={deltas ? pct(deltas.netSales.percentageChange ?? 0) : "—"}
          sub={deltas ? "vs previous period" : "Enable comparison to see growth"}
          icon={TrendingUp}
          tone={deltas ? "positive" : "neutral"}
        />
      </div>

      {/* Sales/Orders trend (Net Sales + Orders toggle, full width) */}
      <div className="grid grid-cols-1 gap-4">
        <SalesPerformanceChart data={trendData} />
      </div>

      {/* Hourly sales + payment method */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <HourlySalesChart data={current.hourlySales} />
        <PaymentMethodChart data={current.byPaymentMethod} />
      </div>

      {/* Order type + category performance */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <OrderTypeChart data={current.byOrderType} />
        <CategoryPerformanceChart data={categoryPerformanceData} />
      </div>

      {/* Product performance table */}
      <ProductPerformanceTable rows={productRows} />
    </PageContainer>
  );
}
