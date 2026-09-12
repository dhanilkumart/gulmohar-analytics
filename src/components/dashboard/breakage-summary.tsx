import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader, DeltaBadge } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { BreakageByDepartment } from "@/lib/analytics";
import type { PeriodComparison } from "@/lib/analytics/comparison";

/**
 * "Breakage Summary" — total cost, event count, and highest-cost
 * department for the selected range. Uses `getBreakageCost`,
 * `getBreakageInRange().length`, and `getHighestCostBreakageDepartment()`
 * exactly. Breakage trend is explicitly deferred (V1 scope decision) and
 * not included here.
 */
export function BreakageSummary({
  totalCost,
  eventCount,
  highestCostDepartment,
  comparison,
}: {
  totalCost: number;
  eventCount: number;
  highestCostDepartment: BreakageByDepartment | null;
  comparison?: PeriodComparison;
}) {
  return (
    <section className="surface-card p-5">
      <SectionHeader title="Breakage" description="Cost of breakage in the period." />
      <div className="mt-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="num text-2xl font-bold">{inr(totalCost)}</p>
          {comparison && comparison.percentageChange !== null ? (
            <DeltaBadge value={comparison.percentageChange} invert />
          ) : null}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Breakage Events</span>
          <span className="num font-semibold">{num(eventCount)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Highest-Cost Department</span>
          <span className="font-semibold">{highestCostDepartment?.departmentName ?? "—"}</span>
        </div>
        <Link
          href="/dashboard/breakage"
          className="border-border hover:bg-secondary inline-flex w-full items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
        >
          View Breakage <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
