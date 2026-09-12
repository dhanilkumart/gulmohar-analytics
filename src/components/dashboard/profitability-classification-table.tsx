"use client";

import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { inr, num, pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";

/**
 * One ranked/classified product list block — reused for "Most Profitable
 * Products", "High Sales / Low Margin", "Loss-Making Products", and "Low
 * Sales / Low Margin" (Lovable's profitability route renders all four
 * from one shared column/table definition; adapted the same way here).
 *
 * `rows` must already be the exact result of the corresponding existing
 * analytics function (`getHighProfitProducts`, `getHighSalesLowMarginProducts`,
 * `getLossMakingProducts`, `getLowSalesLowMarginProducts`) — this
 * component does no filtering/classification of its own.
 *
 * The margin-% badge tone is based on the sign of `grossMargin` (matches
 * `getLossMakingProducts`' own `grossMargin < 0` definition exactly) —
 * not the arbitrary 55%/35% bands Lovable's original used, which don't
 * exist anywhere in the analytics layer.
 */
export function ProfitabilityClassificationTable({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: ProductProfitability[];
  emptyMessage: string;
}) {
  const columns: Column<ProductProfitability>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "qty",
      header: "Qty Sold",
      align: "right",
      sortValue: (r) => r.quantitySold,
      cell: (r) => num(r.quantitySold),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (r) => r.revenue,
      cell: (r) => inr(r.revenue),
    },
    {
      key: "foodCost",
      header: "Food Cost",
      align: "right",
      sortValue: (r) => r.foodCost,
      cell: (r) => inr(r.foodCost),
    },
    {
      key: "grossMargin",
      header: "Gross Food Margin",
      align: "right",
      sortValue: (r) => r.grossMargin,
      cell: (r) => <span className="font-semibold">{inr(r.grossMargin)}</span>,
    },
    {
      key: "marginPct",
      header: "Margin %",
      align: "right",
      sortValue: (r) => r.marginPercentage,
      cell: (r) => (
        <StatusBadge tone={r.grossMargin < 0 ? "negative" : "positive"}>
          {pct(r.marginPercentage, 1)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader title={title} description={description} />
      <div className="mt-4">
        <DataTable rows={rows} columns={columns} pageSize={6} rowKey={(r) => r.productId} emptyMessage={emptyMessage} />
      </div>
    </section>
  );
}
