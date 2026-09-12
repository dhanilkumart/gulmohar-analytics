import { ChefHat, IndianRupee, Percent, Recycle, Trash2, Utensils } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { PrepVsSoldVsWastedChart, type PrepVsSoldVsWastedPoint } from "@/components/dashboard/prep-vs-sold-vs-wasted-chart";
import { WastageTrendChart } from "@/components/dashboard/wastage-trend-chart";
import { WastagePercentageTrendChart } from "@/components/dashboard/wastage-percentage-trend-chart";
import { WastageByProductChart } from "@/components/dashboard/wastage-by-product-chart";
import { WastageByReasonChart } from "@/components/dashboard/wastage-by-reason-chart";
import { PreparedVsSoldTrendChart } from "@/components/dashboard/prepared-vs-sold-trend-chart";
import { WastageDetailTable, type WastageDetailRow } from "@/components/dashboard/wastage-detail-table";
import { WastageRecordsSection, type TrackedProductOption } from "@/components/dashboard/wastage-records-table";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getPreparation, getProducts, getWastage } from "@/lib/data";
import {
  getPreparationVsSoldVsWasted,
  getPreparationTrend,
  getWastageInRange,
  getWastageCost,
  getWastageTrend,
  getWastagePercentageTrend,
  getWastageByProduct,
  getWastageByReason,
  comparePeriodValues,
  type DateRange,
} from "@/lib/analytics";

/**
 * All server-side data for the Wastage & Preparation page, for a single
 * concrete range. Every field comes from the existing
 * `src/lib/analytics/{preparation,wastage}.ts` — nothing is computed
 * from raw JSON here.
 */
async function getWastagePageData(range: DateRange) {
  const [preparationTotals, wastageInRange, wastageTrend, wastagePercentageTrend, wastageByProduct, wastageByReason, preparationTrend] =
    await Promise.all([
      getPreparationVsSoldVsWasted(range),
      getWastageInRange(range),
      getWastageTrend(range),
      getWastagePercentageTrend(range),
      getWastageByProduct(range),
      getWastageByReason(range),
      getPreparationTrend(range),
    ]);

  const prepared = preparationTotals.reduce((sum, p) => sum + p.preparedQuantity, 0);
  const sold = preparationTotals.reduce((sum, p) => sum + p.soldQuantity, 0);
  const wasted = preparationTotals.reduce((sum, p) => sum + p.wastedQuantity, 0);
  const wastageCost = getWastageCost(wastageInRange);

  return {
    preparationTotals,
    wastageTrend,
    wastagePercentageTrend,
    wastageByProduct,
    wastageByReason,
    preparationTrend,
    prepared,
    sold,
    wasted,
    wastageCost,
  };
}

export default async function WastagePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous, products, allPreparation, allWastage] = await Promise.all([
    getWastagePageData(range),
    comparison === "previous" && previousRange ? getWastagePageData(previousRange) : Promise.resolve(null),
    getProducts(),
    getPreparation(),
    getWastage(),
  ]);

  // Reference/lookup data for the form and product names: derived from
  // the FULL preparation/wastage history (not the currently selected
  // range), so the "tracked items" and "reasons" options never shrink
  // just because a narrow range happens to have less data.
  const productById = new Map(products.map((p) => [p.product_id, p]));
  const trackedProductIds = [...new Set(allPreparation.map((row) => row.product_id))];
  const trackedProducts: TrackedProductOption[] = trackedProductIds
    .map((productId) => {
      const product = productById.get(productId);
      return product ? { productId, name: product.name, foodCost: product.food_cost } : null;
    })
    .filter((p): p is TrackedProductOption => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const reasons = [...new Set(allWastage.map((row) => row.reason))].sort();

  // Only Wasted Quantity and Wastage Cost show a period-over-period
  // delta — matching the Lovable reference UI's own choice not to show
  // comparison on Prepared/Sold Quantity, Wastage %, or Sell-through %.
  const deltas = previous
    ? {
        wasted: comparePeriodValues(current.wasted, previous.wasted),
        wastageCost: comparePeriodValues(current.wastageCost, previous.wastageCost),
      }
    : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const wastagePercentage = current.prepared > 0 ? (current.wasted / current.prepared) * 100 : 0;
  const sellThroughPercentage = current.prepared > 0 ? (current.sold / current.prepared) * 100 : 0;

  const prepChartData: PrepVsSoldVsWastedPoint[] = current.preparationTotals.map((totals) => ({
    productId: totals.productId,
    name: productById.get(totals.productId)?.name ?? totals.productId,
    prepared: totals.preparedQuantity,
    sold: totals.soldQuantity,
    wasted: totals.wastedQuantity,
  }));

  const detailRows: WastageDetailRow[] = current.preparationTotals.map((totals) => {
    const wastageForProduct = current.wastageByProduct.find((w) => w.productId === totals.productId);
    return {
      productId: totals.productId,
      name: productById.get(totals.productId)?.name ?? totals.productId,
      prepared: totals.preparedQuantity,
      sold: totals.soldQuantity,
      wasted: totals.wastedQuantity,
      wastageCost: wastageForProduct?.wastageCost ?? 0,
      wastagePercentage: totals.wastagePercentage,
      sellThroughPercentage: totals.sellThroughPercentage,
    };
  });

  return (
    <PageContainer
      title="Wastage & Preparation"
      description="Preparation, sell-through and wastage for tracked preparation items"
    >
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Prepared Quantity" value={num(current.prepared)} icon={ChefHat} highlight />
        <MetricCard label="Sold Quantity" value={num(current.sold)} icon={Utensils} tone="accent" />
        <MetricCard
          label="Wasted Quantity"
          value={num(current.wasted)}
          delta={deltas?.wasted.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={Trash2}
          tone="negative"
        />
        <MetricCard
          label="Wastage Cost"
          value={inr(current.wastageCost)}
          delta={deltas?.wastageCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={IndianRupee}
          tone="negative"
        />
        <MetricCard label="Wastage %" value={pct(wastagePercentage)} icon={Percent} tone="warning" />
        <MetricCard label="Sell-through %" value={pct(sellThroughPercentage)} icon={Recycle} tone="positive" />
      </div>

      <PrepVsSoldVsWastedChart data={prepChartData} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WastageTrendChart data={current.wastageTrend} />
        <WastagePercentageTrendChart data={current.wastagePercentageTrend} />
        <WastageByProductChart data={current.wastageByProduct} />
        <WastageByReasonChart data={current.wastageByReason} />
      </div>

      <PreparedVsSoldTrendChart data={current.preparationTrend} />

      <WastageDetailTable rows={detailRows} />

      <WastageRecordsSection trackedProducts={trackedProducts} reasons={reasons} />
    </PageContainer>
  );
}
