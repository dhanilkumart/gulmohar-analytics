import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { SectionHeader, StatusBadge, EmptyState } from "@/components/dashboard/ui-kit";
import { pct } from "@/lib/format";
import type { DepartmentManpower, ProductProfitability } from "@/lib/analytics";

/**
 * "Management Attention" — the two approved, threshold-free V1 insights
 * (see docs/ui-integration-contract.md §6): high-sales/low-margin
 * products (`getHighSalesLowMarginProducts()`) and departments over
 * benchmark headcount (`DepartmentManpower.variance > 0`). No other
 * insights (wastage %, sell-through %, etc.) are included — those need a
 * business-defined threshold that doesn't exist yet.
 *
 * This is the page-level rendering of the same concept the global
 * `NotificationCenter` (in the header) exposes via its `AttentionItem[]`
 * prop — see docs/architecture note in `src/app/dashboard/page.tsx` for
 * why this data isn't also pushed into that global component yet.
 */
export function ManagementAttention({
  highSalesLowMarginProducts,
  departmentsOverBenchmark,
}: {
  highSalesLowMarginProducts: ProductProfitability[];
  departmentsOverBenchmark: DepartmentManpower[];
}) {
  const hasItems = highSalesLowMarginProducts.length > 0 || departmentsOverBenchmark.length > 0;

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Management Attention"
        description="Rule-based signals derived from product margin and department benchmarks."
      />
      {hasItems ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {highSalesLowMarginProducts.slice(0, 3).map((product) => (
            <Link
              key={product.productId}
              href="/dashboard/profitability"
              className="border-warning/40 bg-warning-soft/50 hover:bg-warning-soft rounded-2xl border p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{product.name}</p>
                  <p className="text-muted-foreground text-xs">High Sales / Low Margin</p>
                </div>
                <PackageCheck className="text-warning h-4 w-4 shrink-0" />
              </div>
              <p className="num mt-3 text-lg font-bold">{pct(product.marginPercentage, 0)} margin</p>
            </Link>
          ))}
          {departmentsOverBenchmark.map((dept) => (
            <Link
              key={dept.departmentId}
              href="/dashboard/manpower"
              className="border-border hover:bg-secondary/70 rounded-2xl border p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{dept.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {dept.actualHeadcount} employees · Benchmark {dept.benchmarkHeadcount}
                  </p>
                </div>
                <StatusBadge tone="warning">+{dept.variance} above</StatusBadge>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">Department above benchmark</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState title="Nothing needs attention" message="No signals for the selected period." />
        </div>
      )}
    </section>
  );
}
