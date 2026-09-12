"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, EmptyState } from "@/components/dashboard/ui-kit";
import { AXIS, GRID, ChartTooltip, formatPeriodLabel } from "@/components/dashboard/charts";
import { pct } from "@/lib/format";
import type { AttendanceTrendPoint } from "@/lib/analytics";

/**
 * Adapted from the Lovable UI's manpower route "Attendance Trend" chart.
 * Uses the real `getAttendanceTrend(range)` result directly — no
 * regrouping of raw attendance records in the browser.
 */
export function AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] }) {
  const hasData = data.some((point) => point.presentCount + point.absentCount + point.leaveCount > 0);

  return (
    <ChartCard
      className="xl:col-span-2"
      title="Attendance Trend"
      description="Attendance percentage over the selected period."
    >
      {hasData ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="period" tickFormatter={formatPeriodLabel} {...AXIS} />
              <YAxis {...AXIS} width={48} unit="%" domain={[0, 100]} />
              <Tooltip
                content={<ChartTooltip formatter={(v) => pct(v)} />}
                labelFormatter={(label) => formatPeriodLabel(String(label))}
              />
              <Line
                type="monotone"
                dataKey="attendanceRate"
                name="Attendance %"
                stroke="var(--color-chart-1)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState title="No attendance records" message="No attendance was recorded for the selected period." />
      )}
    </ChartCard>
  );
}
