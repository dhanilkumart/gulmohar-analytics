import { ArrowDownCircle, ArrowUpCircle, ChefHat, IndianRupee, Percent, Scale } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import {
  ProfitabilityMatrixChart,
  type ProfitabilityClassification,
  type ProfitabilityMatrixPoint,
} from "@/components/dashboard/profitability-matrix-chart";
import { ProfitabilityClassificationTable } from "@/components/dashboard/profitability-classification-table";
import { ProductProfitabilityTable, type ProductProfitabilityRow } from "@/components/dashboard/product-profitability-table";
import { inr, num, pct } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import { getCategories } from "@/lib/data";
import {
  getProductProfitability,
  getHighProfitProducts,
  getHighSalesLowMarginProducts,
  getLossMakingProducts,
  getLowSalesLowMarginProducts,
  getGrossFoodMargin,
  comparePeriodValues,
  type DateRange,
  type ProductProfitability,
} from "@/lib/analytics";

/**
 * All server-side data for the Profitability page, for a single
 * concrete range. Every field comes from the existing
 * `src/lib/analytics/profitability.ts` — nothing is computed from raw
 * JSON here.
 */
async function getProfitabilityPageData(range: DateRange) {
  const [productProfitability, categories] = await Promise.all([
    getProductProfitability(range),
    getCategories(),
  ]);

  const revenue = productProfitability.reduce((sum, p) => sum + p.revenue, 0);
  const foodCost = productProfitability.reduce((sum, p) => sum + p.foodCost, 0);
  const grossMargin = getGrossFoodMargin(revenue, foodCost);

  return { productProfitability, categories, revenue, foodCost, grossMargin };
}

/**
 * Classifies a product against the existing, unmodified classification
 * functions (no new thresholds) — used to color the Profitability
 * Matrix and to label the full Product Profitability table. Precedence
 * (a product can satisfy more than one filter, e.g. loss-making AND
 * high-sales/low-margin, since margin < 0 also satisfies "<= 25%"):
 * Loss-Making > High Sales/Low Margin > Low Sales/Low Margin > Other.
 */
function classifyProducts(productProfitability: ProductProfitability[]) {
  const lossMaking = getLossMakingProducts(productProfitability);
  const highSalesLowMargin = getHighSalesLowMarginProducts(productProfitability);
  const lowSalesLowMargin = getLowSalesLowMarginProducts(productProfitability);

  const lossMakingIds = new Set(lossMaking.map((p) => p.productId));
  const highSalesLowMarginIds = new Set(highSalesLowMargin.map((p) => p.productId));
  const lowSalesLowMarginIds = new Set(lowSalesLowMargin.map((p) => p.productId));

  const classificationById = new Map<string, ProfitabilityClassification>();
  for (const product of productProfitability) {
    if (lossMakingIds.has(product.productId)) {
      classificationById.set(product.productId, "Loss-Making");
    } else if (highSalesLowMarginIds.has(product.productId)) {
      classificationById.set(product.productId, "High Sales / Low Margin");
    } else if (lowSalesLowMarginIds.has(product.productId)) {
      classificationById.set(product.productId, "Low Sales / Low Margin");
    } else {
      classificationById.set(product.productId, "Other");
    }
  }

  return { lossMaking, highSalesLowMargin, lowSalesLowMargin, classificationById };
}

export default async function ProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  const [current, previous] = await Promise.all([
    getProfitabilityPageData(range),
    comparison === "previous" && previousRange ? getProfitabilityPageData(previousRange) : Promise.resolve(null),
  ]);

  const deltas = previous
    ? {
        revenue: comparePeriodValues(current.revenue, previous.revenue),
        foodCost: comparePeriodValues(current.foodCost, previous.foodCost),
        grossMargin: comparePeriodValues(current.grossMargin, previous.grossMargin),
      }
    : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  const marginPercentage = current.revenue > 0 ? (current.grossMargin / current.revenue) * 100 : 0;

  const { lossMaking, highSalesLowMargin, lowSalesLowMargin, classificationById } = classifyProducts(
    current.productProfitability
  );
  const mostProfitable = getHighProfitProducts(current.productProfitability, 6);

  const categoryNameById = new Map(current.categories.map((c) => [c.category_id, c.name]));
  const matrixData: ProfitabilityMatrixPoint[] = current.productProfitability.map((product) => ({
    product,
    classification: classificationById.get(product.productId) ?? "Other",
  }));
  const tableRows: ProductProfitabilityRow[] = current.productProfitability.map((product) => ({
    product,
    categoryName: categoryNameById.get(product.categoryId) ?? product.categoryId,
    classification: classificationById.get(product.productId) ?? "Other",
  }));

  return (
    <PageContainer title="Profitability" description="Product margins based on product-level food cost">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Revenue"
          value={inr(current.revenue)}
          delta={deltas?.revenue.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={IndianRupee}
          highlight
        />
        <MetricCard
          label="Food Cost"
          value={inr(current.foodCost)}
          delta={deltas?.foodCost.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={ChefHat}
          tone="warning"
        />
        <MetricCard
          label="Gross Food Margin"
          value={inr(current.grossMargin)}
          delta={deltas?.grossMargin.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={Scale}
          tone="positive"
        />
        <MetricCard label="Margin %" value={pct(marginPercentage)} icon={Percent} tone="accent" />
        <MetricCard
          label="Loss-Making Products"
          value={num(lossMaking.length)}
          sub="Negative gross food margin"
          icon={ArrowDownCircle}
          tone="negative"
        />
        <MetricCard
          label="High Sales / Low Margin"
          value={num(highSalesLowMargin.length)}
          sub="Existing classification"
          icon={ArrowUpCircle}
          tone="warning"
        />
      </div>

      <ProfitabilityMatrixChart data={matrixData} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ProfitabilityClassificationTable
          title="Most Profitable Products"
          description="Highest gross food margin."
          rows={mostProfitable}
          emptyMessage="No products sold in the selected period."
        />
        <ProfitabilityClassificationTable
          title="High Sales / Low Margin"
          description="Strong volume, weak margin (existing classification)."
          rows={highSalesLowMargin}
          emptyMessage="No products match this classification for the selected period."
        />
        <ProfitabilityClassificationTable
          title="Loss-Making Products"
          description="Negative gross food margin."
          rows={lossMaking}
          emptyMessage="No loss-making products for the selected period."
        />
        <ProfitabilityClassificationTable
          title="Low Sales / Low Margin"
          description="Low volume and weak margin (existing classification)."
          rows={lowSalesLowMargin}
          emptyMessage="No products match this classification for the selected period."
        />
      </div>

      <ProductProfitabilityTable rows={tableRows} />
    </PageContainer>
  );
}
