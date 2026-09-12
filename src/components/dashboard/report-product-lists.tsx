"use client";

import { EmptyState, StatusBadge } from "@/components/dashboard/ui-kit";
import { inr, pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";

interface ProductListBlock {
  title: string;
  description: string;
  rows: ProductProfitability[];
  tone: "positive" | "negative" | "warning";
}

/**
 * "Product Performance" lists — Top Products, Problem (Loss-Making)
 * Products, and High Sales / Low Margin Products. Every row comes
 * straight from the existing `getHighProfitProducts`/`getLossMakingProducts`/
 * `getHighSalesLowMarginProducts` classification functions (already used
 * on the Profitability and Executive Dashboard pages) — no new
 * classification logic or thresholds are introduced here.
 */
export function ReportProductLists({
  topProducts,
  problemProducts,
  highSalesLowMarginProducts,
}: {
  topProducts: ProductProfitability[];
  problemProducts: ProductProfitability[];
  highSalesLowMarginProducts: ProductProfitability[];
}) {
  const blocks: ProductListBlock[] = [
    {
      title: "Top Products",
      description: "Highest gross margin (getHighProfitProducts).",
      rows: topProducts,
      tone: "positive",
    },
    {
      title: "Problem Products",
      description: "Negative gross margin in this period (getLossMakingProducts).",
      rows: problemProducts,
      tone: "negative",
    },
    {
      title: "High Sales / Low Margin",
      description: "High volume with comparatively low margin % (getHighSalesLowMarginProducts).",
      rows: highSalesLowMarginProducts,
      tone: "warning",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {blocks.map((block) => (
        <div key={block.title} className="surface-card p-5">
          <p className="text-sm font-semibold">{block.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{block.description}</p>
          {block.rows.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {block.rows.slice(0, 5).map((product) => (
                <li key={product.productId} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  <span className="num text-muted-foreground">{inr(product.grossMargin, { compact: true })}</span>
                  <StatusBadge tone={block.tone}>{pct(product.marginPercentage, 0)}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <EmptyState message="No products match this classification for the selected period." />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
