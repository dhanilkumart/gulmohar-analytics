"use client";

import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { inr, num, pct } from "@/lib/format";

export interface WastageDetailRow {
  productId: string;
  name: string;
  prepared: number;
  sold: number;
  wasted: number;
  wastageCost: number;
  wastagePercentage: number;
  sellThroughPercentage: number;
}

/**
 * "Preparation & Wastage Detail" — one row per tracked preparation
 * product, joining `getPreparationVsSoldVsWasted()` (prepared/sold/
 * wasted/wastage %/sell-through %) with `getWastageByProduct()`
 * (wastage cost). No "Date" or "Reason" column: this is a per-product
 * aggregate over the whole selected range, and neither field exists at
 * that granularity in the underlying analytics result — adding them
 * would mean fabricating data the result doesn't support.
 */
export function WastageDetailTable({ rows }: { rows: WastageDetailRow[] }) {
  const columns: Column<WastageDetailRow>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "prepared", header: "Prepared", align: "right", sortValue: (r) => r.prepared, cell: (r) => num(r.prepared) },
    { key: "sold", header: "Sold", align: "right", sortValue: (r) => r.sold, cell: (r) => num(r.sold) },
    { key: "wasted", header: "Wasted", align: "right", sortValue: (r) => r.wasted, cell: (r) => num(r.wasted) },
    {
      key: "cost",
      header: "Wastage Cost",
      align: "right",
      sortValue: (r) => r.wastageCost,
      cell: (r) => inr(r.wastageCost),
    },
    {
      key: "wastagePct",
      header: "Wastage %",
      align: "right",
      sortValue: (r) => r.wastagePercentage,
      cell: (r) => (
        <StatusBadge tone={r.wastagePercentage > 0 ? "negative" : "positive"}>{pct(r.wastagePercentage)}</StatusBadge>
      ),
    },
    {
      key: "sellThrough",
      header: "Sell-through %",
      align: "right",
      sortValue: (r) => r.sellThroughPercentage,
      cell: (r) => pct(r.sellThroughPercentage),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader title="Preparation & Wastage Detail" description="Product-level preparation, wastage cost and sell-through." />
      <div className="mt-4">
        <DataTable
          rows={rows}
          columns={columns}
          pageSize={8}
          rowKey={(r) => r.productId}
          searchKeys={(r) => r.name}
          emptyMessage="No tracked preparation items match your filters."
        />
      </div>
    </section>
  );
}
