"use client";

import { SectionHeader, StatusBadge, type Tone } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { inr, num, pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";
import type { ProfitabilityClassification } from "@/components/dashboard/profitability-matrix-chart";

export interface ProductProfitabilityRow {
  product: ProductProfitability;
  categoryName: string;
  classification: ProfitabilityClassification;
}

const CLASSIFICATION_TONE: Record<ProfitabilityClassification, Tone> = {
  "Loss-Making": "negative",
  "High Sales / Low Margin": "warning",
  "Low Sales / Low Margin": "neutral",
  Other: "positive",
};

/**
 * Full "Product Profitability" table (~60 rows, aggregated server-side —
 * never raw sale-item rows). Fields come directly from the existing
 * `ProductProfitability` result; `classification` is the same
 * server-computed label used to color the Profitability Matrix (not a
 * new calculation, just a shared presentation label over the four
 * existing classification functions' results).
 */
export function ProductProfitabilityTable({ rows }: { rows: ProductProfitabilityRow[] }) {
  const columns: Column<ProductProfitabilityRow>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (r) => r.product.name,
      cell: (r) => <span className="font-medium">{r.product.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (r) => r.categoryName,
      cell: (r) => <span className="text-muted-foreground">{r.categoryName}</span>,
    },
    {
      key: "qty",
      header: "Qty Sold",
      align: "right",
      sortValue: (r) => r.product.quantitySold,
      cell: (r) => num(r.product.quantitySold),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (r) => r.product.revenue,
      cell: (r) => inr(r.product.revenue),
    },
    {
      key: "foodCost",
      header: "Food Cost",
      align: "right",
      sortValue: (r) => r.product.foodCost,
      cell: (r) => inr(r.product.foodCost),
    },
    {
      key: "grossMargin",
      header: "Gross Food Margin",
      align: "right",
      sortValue: (r) => r.product.grossMargin,
      cell: (r) => <span className="font-semibold">{inr(r.product.grossMargin)}</span>,
    },
    {
      key: "marginPct",
      header: "Margin %",
      align: "right",
      sortValue: (r) => r.product.marginPercentage,
      cell: (r) => pct(r.product.marginPercentage, 1),
    },
    {
      key: "classification",
      header: "Classification",
      cell: (r) => <StatusBadge tone={CLASSIFICATION_TONE[r.classification]}>{r.classification}</StatusBadge>,
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Product Profitability"
        description="Search, filter and sort every product's food cost and margin for the selected period."
      />
      <div className="mt-4">
        <DataTable
          rows={rows}
          columns={columns}
          pageSize={8}
          rowKey={(r) => r.product.productId}
          searchKeys={(r) => `${r.product.name} ${r.categoryName}`}
          filters={[
            {
              key: "category",
              label: "Category",
              options: [...new Set(rows.map((r) => r.categoryName))].sort(),
              match: (r, v) => r.categoryName === v,
            },
            {
              key: "classification",
              label: "Classification",
              options: [...new Set(rows.map((r) => r.classification))],
              match: (r, v) => r.classification === v,
            },
          ]}
          emptyMessage="No products match your filters."
        />
      </div>
    </section>
  );
}
