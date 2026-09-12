"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, CoverageNote, EmptyState } from "@/components/dashboard/ui-kit";
import { num } from "@/lib/format";
import type { DepartmentManpower } from "@/lib/analytics";

/**
 * "Actual vs Benchmark" — adapted from the Lovable UI's manpower route.
 * Uses `actualHeadcount`/`benchmarkHeadcount` straight from
 * `getDepartmentManpower()` — no invented thresholds, no client-side
 * status classification beyond what the data itself expresses.
 */
export function ActualVsBenchmarkChart({ data }: { data: DepartmentManpower[] }) {
  return (
    <ChartCard
      title="Actual vs Benchmark"
      description="Current headcount against each department's configured benchmark."
      footer={<CoverageNote>Current snapshot — benchmark headcount is not date-range aware.</CoverageNote>}
    >
      {data.length > 0 ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} interval={0} height={40} />
              <YAxis {...AXIS} width={40} />
              <Tooltip content={<ChartTooltip formatter={(v) => num(v)} />} cursor={{ fill: "var(--color-secondary)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="actualHeadcount" name="Actual" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="benchmarkHeadcount" name="Benchmark" fill="var(--color-chart-5)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No department data available." />
      )}
    </ChartCard>
  );
}
