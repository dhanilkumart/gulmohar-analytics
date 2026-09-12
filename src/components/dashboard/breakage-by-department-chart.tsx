"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, ChartTooltip, GRID } from "@/components/dashboard/charts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { inr } from "@/lib/format";
import type { BreakageByDepartment } from "@/lib/analytics";

/** "Breakage by Department" — from the existing `getBreakageByDepartment(range)`. */
export function BreakageByDepartmentChart({ data }: { data: BreakageByDepartment[] }) {
  const sorted = [...data].sort((a, b) => b.breakageCost - a.breakageCost);

  return (
    <ChartCard title="Breakage by Department" description="Cost attributed to each department.">
      {sorted.length > 0 ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" tickFormatter={(v: number) => inr(v, { compact: true })} {...AXIS} />
              <YAxis type="category" dataKey="departmentName" {...AXIS} width={130} />
              <Tooltip content={<ChartTooltip formatter={(v) => inr(v)} />} cursor={{ fill: "var(--color-secondary)" }} />
              <Bar dataKey="breakageCost" name="Breakage Cost" fill="var(--color-chart-4)" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No breakage recorded for the selected period." />
      )}
    </ChartCard>
  );
}
