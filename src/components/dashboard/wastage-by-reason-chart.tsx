"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, ChartTooltip } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { WastageByReason } from "@/lib/analytics";

/**
 * "Wastage by Reason" — from the existing `getWastageByReason(range)`.
 * Groups are exactly whatever reasons appear in `wastage.json`
 * (currently "Over-preparation" | "End-of-day unsold") — none are
 * hard-coded here.
 */
export function WastageByReasonChart({ data }: { data: WastageByReason[] }) {
  const sorted = [...data].sort((a, b) => b.wastageCost - a.wastageCost);

  return (
    <ChartCard title="Wastage by Reason" description="Recorded wastage reasons.">
      {sorted.length > 0 ? (
        <>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="wastageCost"
                  nameKey="reason"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={3}
                  stroke="none"
                >
                  {sorted.map((entry, i) => (
                    <Cell key={entry.reason} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => inr(v)} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2">
            {sorted.map((entry, i) => (
              <li key={entry.reason} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-muted-foreground min-w-0 flex-1 truncate">{entry.reason}</span>
                <span className="num font-semibold">{inr(entry.wastageCost)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState message="No wastage recorded for the selected period." />
      )}
    </ChartCard>
  );
}
