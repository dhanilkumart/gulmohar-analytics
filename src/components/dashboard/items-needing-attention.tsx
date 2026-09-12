import Link from "next/link";
import { SectionHeader, StatusBadge, EmptyState } from "@/components/dashboard/ui-kit";
import { pct } from "@/lib/format";
import type { ProductProfitability } from "@/lib/analytics";

export interface AttentionProduct {
  product: ProductProfitability;
  classification: "Loss-Making Product" | "High Sales / Low Margin";
}

/**
 * "Items Needing Attention" — combines the two approved, threshold-free
 * V1 classifications from `src/lib/analytics/profitability.ts`:
 * `getLossMakingProducts()` (margin < 0) and
 * `getHighSalesLowMarginProducts()` (documented volume/margin defaults).
 * No additional thresholds are introduced here.
 */
export function ItemsNeedingAttention({ items }: { items: AttentionProduct[] }) {
  const visible = items.slice(0, 4);

  return (
    <section className="surface-card border-warning/40 p-5">
      <SectionHeader
        title="Items Needing Attention"
        description="Loss-making and high-sales/low-margin products for the selected period."
      />
      {visible.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {visible.map(({ product, classification }) => {
            const lossMaking = classification === "Loss-Making Product";
            return (
              <li key={product.productId}>
                <Link
                  href="/dashboard/profitability"
                  className="border-border hover:bg-secondary/70 flex items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <span
                    className={"h-9 w-1.5 shrink-0 rounded-full " + (lossMaking ? "bg-danger" : "bg-warning")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{classification}</p>
                  </div>
                  <StatusBadge tone={lossMaking ? "negative" : "warning"}>
                    {pct(product.marginPercentage, 0)} margin
                  </StatusBadge>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No items need attention"
            message="No loss-making or high-sales/low-margin products for the selected period."
          />
        </div>
      )}
    </section>
  );
}
