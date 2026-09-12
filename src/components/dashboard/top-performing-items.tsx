import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader, EmptyState } from "@/components/dashboard/ui-kit";
import { inr, num, pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";

/**
 * "Top Performing Items" — highest-revenue products for the selected
 * range. `items` is `getProductProfitability()`'s result, sorted by
 * `revenue` (a presentation-level sort of an already-computed analytics
 * result — not a new calculation) and capped to a handful for display.
 */
export function TopPerformingItems({
  items,
  categoryNameById,
}: {
  items: ProductProfitability[];
  categoryNameById: Map<string, string>;
}) {
  const topItems = [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return (
    <section className="surface-card xl:col-span-2">
      <div className="p-5">
        <SectionHeader
          title="Top Performing Items"
          description="Highest revenue products for the selected period."
          action={
            <Link
              href="/dashboard/sales"
              className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>
      {topItems.length > 0 ? (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs tracking-wide uppercase">
                <th className="px-2 py-2 text-left font-semibold">Product</th>
                <th className="px-2 py-2 text-right font-semibold">Qty Sold</th>
                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                <th className="px-2 py-2 text-right font-semibold">Food Cost</th>
                <th className="px-2 py-2 text-right font-semibold">Gross Margin</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((product) => (
                <tr
                  key={product.productId}
                  className="border-border/70 hover:bg-secondary/60 border-b transition-colors last:border-0"
                >
                  <td className="px-2 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {categoryNameById.get(product.categoryId) ?? product.categoryId}
                    </p>
                  </td>
                  <td className="num px-2 py-3 text-right">{num(product.quantitySold)}</td>
                  <td className="num px-2 py-3 text-right font-semibold">{inr(product.revenue)}</td>
                  <td className="num text-muted-foreground px-2 py-3 text-right">
                    {inr(product.foodCost)}
                  </td>
                  <td className="num px-2 py-3 text-right">
                    <span className="font-semibold">{inr(product.grossMargin)}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {pct(product.marginPercentage, 0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 pb-5">
          <EmptyState message="No products sold in the selected period." />
        </div>
      )}
    </section>
  );
}
