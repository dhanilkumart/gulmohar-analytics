"use client";

import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { PeriodComparison } from "@/lib/analytics";

export interface ComparisonRow {
  label: string;
  comparison: PeriodComparison;
  /** Formats current/previous/difference as currency (true) or a plain count (false). */
  money: boolean;
  /** When true, a negative change is favorable (cost-type metrics) — matches `DeltaBadge`'s `invert`. */
  invert?: boolean;
}

/**
 * "Current vs Previous Period" comparison table — adapted from the
 * Lovable UI's Reports `ComparisonTable`, but every row's
 * current/previous/difference/%change comes from a real
 * `comparePeriodValues` result (see `src/lib/analytics/comparison.ts`),
 * not a fabricated `factor * 0.93` scaling. Only rendered by the page
 * when the global Comparison control is set to "Previous Period" — never
 * shown with an invented previous-period value.
 */
export function ReportComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Comparison"
        description="Current period against the previous period of equal length."
      />
      <div className="mt-4 -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-semibold tracking-wide uppercase">
                Metric
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide uppercase">
                Current
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide uppercase">
                Previous Period
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide uppercase">
                Difference
              </th>
              <th className="text-muted-foreground px-3 py-2.5 text-right text-xs font-semibold tracking-wide uppercase">
                % Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const fmt = (value: number) => (row.money ? inr(value) : num(value));
              const change = row.comparison.percentageChange;
              const favorable = change === null ? null : row.invert ? change <= 0 : change >= 0;
              return (
                <tr key={row.label} className="border-border/70 hover:bg-secondary/60 border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{row.label}</td>
                  <td className="num px-3 py-3 text-right font-semibold">{fmt(row.comparison.current)}</td>
                  <td className="num text-muted-foreground px-3 py-3 text-right">{fmt(row.comparison.previous)}</td>
                  <td className="num px-3 py-3 text-right">{fmt(row.comparison.difference)}</td>
                  <td className="num px-3 py-3 text-right">
                    {change === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <StatusBadge tone={favorable ? "positive" : "negative"}>
                        {change > 0 ? "+" : ""}
                        {change.toFixed(1)}%
                      </StatusBadge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
