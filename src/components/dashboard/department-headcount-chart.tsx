"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, CoverageNote, EmptyState } from "@/components/dashboard/ui-kit";
import { num } from "@/lib/format";
import type { DepartmentManpower } from "@/lib/analytics";

/**
 * "Department Headcount" — adapted from the Lovable UI's manpower route.
 * `getDepartmentManpower()` is a CURRENT SNAPSHOT (active employees right
 * now), not filtered by the selected date range — see the `CoverageNote`
 * below and the equivalent note on the KPI row.
 */
export function DepartmentHeadcountChart({ data }: { data: DepartmentManpower[] }) {
  return (
    <ChartCard
      title="Department Headcount"
      description="Current active employees per department."
      footer={<CoverageNote>Current snapshot — not affected by the selected date range.</CoverageNote>}
    >
      {data.length > 0 ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} />
              <YAxis type="category" dataKey="name" {...AXIS} width={116} />
              <Tooltip content={<ChartTooltip formatter={(v) => num(v)} />} cursor={{ fill: "var(--color-secondary)" }} />
              <Bar dataKey="actualHeadcount" name="Employees" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No department data available." />
      )}
    </ChartCard>
  );
}
