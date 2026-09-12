"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr, num, pct } from "@/lib/format";

export interface ProductSalesRow {
  productId: string;
  name: string;
  categoryName: string;
  quantitySold: number;
  revenue: number;
}

interface ProductSalesRowWithShare extends ProductSalesRow {
  averageSellingPrice: number;
  sharePercentage: number;
}

/**
 * "Product Performance" table — sales performance only (quantity,
 * revenue, average selling price, share of sales), not profitability.
 * Food cost/margin intentionally excluded — that analysis belongs on the
 * Profitability page. `rows` come from the existing
 * `getProductProfitability(range)`, with only its sales-relevant fields
 * used here.
 *
 * Adapted from the Lovable UI's Sales page `DataTable` usage. Its
 * "Order Type" column filter is not ported: it matched every row
 * unconditionally in the original (`match: () => true`) since a
 * product-aggregated row has no single order type, and no existing
 * analytics function breaks sales down by both product and order type —
 * porting it as a decoration with no real filtering would be misleading.
 */
export function ProductPerformanceTable({ rows }: { rows: ProductSalesRow[] }) {
  const [selected, setSelected] = useState<ProductSalesRowWithShare | null>(null);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  const rowsWithShare: ProductSalesRowWithShare[] = rows.map((row) => ({
    ...row,
    averageSellingPrice: row.quantitySold > 0 ? row.revenue / row.quantitySold : 0,
    sharePercentage: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
  }));

  const columns: Column<ProductSalesRowWithShare>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
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
      sortValue: (r) => r.quantitySold,
      cell: (r) => num(r.quantitySold),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortValue: (r) => r.revenue,
      cell: (r) => <span className="font-semibold">{inr(r.revenue)}</span>,
    },
    {
      key: "asp",
      header: "Avg Selling Price",
      align: "right",
      sortValue: (r) => r.averageSellingPrice,
      cell: (r) => inr(r.averageSellingPrice),
    },
    {
      key: "share",
      header: "% of Sales",
      align: "right",
      sortValue: (r) => r.sharePercentage,
      cell: (r) => pct(r.sharePercentage),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Product Performance"
        description="Search, filter and sort every product sold in the selected period."
      />
      <div className="mt-4">
        <DataTable
          rows={rowsWithShare}
          columns={columns}
          pageSize={8}
          rowKey={(r) => r.productId}
          searchKeys={(r) => `${r.name} ${r.categoryName}`}
          filters={[
            {
              key: "category",
              label: "Category",
              options: [...new Set(rows.map((r) => r.categoryName))].sort(),
              match: (r, v) => r.categoryName === v,
            },
          ]}
          onRowClick={(r) => setSelected(r)}
          emptyMessage="No products match your filters."
        />
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>{selected?.categoryName}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="space-y-3 px-4 pb-6">
              {[
                { label: "Quantity Sold", value: num(selected.quantitySold) },
                { label: "Revenue", value: inr(selected.revenue) },
                { label: "Average Selling Price", value: inr(selected.averageSellingPrice) },
                { label: "% of Sales", value: pct(selected.sharePercentage) },
              ].map((row) => (
                <div
                  key={row.label}
                  className="bg-secondary flex items-center justify-between rounded-xl px-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="num font-semibold">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
