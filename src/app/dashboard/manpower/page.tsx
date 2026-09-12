import { CalendarX2, IndianRupee, Percent, UserCheck, UserMinus, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { MetricCard } from "@/components/dashboard/ui-kit";
import { AttendanceTrendChart } from "@/components/dashboard/attendance-trend-chart";
import { DepartmentHeadcountChart } from "@/components/dashboard/department-headcount-chart";
import { ActualVsBenchmarkChart } from "@/components/dashboard/actual-vs-benchmark-chart";
import { DepartmentStaffingTable } from "@/components/dashboard/department-staffing-table";
import { num, pct, inr } from "@/lib/format";
import { parseGlobalRangeParams, type RawSearchParams } from "@/lib/date-range-params";
import {
  getAttendanceInRange,
  getAttendanceSummary,
  getAttendanceTrend,
  getDepartmentManpower,
  getTotalMonthlyLaborCost,
  comparePeriodValues,
} from "@/lib/analytics";

export default async function ManpowerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const resolvedRange = parseGlobalRangeParams(await searchParams);
  const { range, comparison, previousRange } = resolvedRange;

  // getDepartmentManpower() and getTotalMonthlyLaborCost() are CURRENT
  // SNAPSHOT functions (active employees right now) — they take no
  // DateRange argument and are fetched once, independent of `range`.
  const [attendanceInRange, attendanceTrend, departments, monthlyLaborCost] = await Promise.all([
    getAttendanceInRange(range),
    getAttendanceTrend(range),
    getDepartmentManpower(),
    getTotalMonthlyLaborCost(),
  ]);

  const summary = getAttendanceSummary(attendanceInRange);
  const totalEmployees = departments.reduce((sum, d) => sum + d.actualHeadcount, 0);

  // Only range-aware attendance metrics support previous-period
  // comparison. Department headcount/benchmark and labor cost are
  // current snapshots with no historical series to compare against.
  let previousSummary: ReturnType<typeof getAttendanceSummary> | null = null;
  if (comparison === "previous" && previousRange) {
    const previousAttendance = await getAttendanceInRange(previousRange);
    previousSummary = getAttendanceSummary(previousAttendance);
  }
  const deltas = previousSummary
    ? {
        present: comparePeriodValues(summary.presentCount, previousSummary.presentCount),
        absent: comparePeriodValues(summary.absentCount, previousSummary.absentCount),
        leave: comparePeriodValues(summary.leaveCount, previousSummary.leaveCount),
        attendanceRate: comparePeriodValues(summary.attendanceRate, previousSummary.attendanceRate),
      }
    : null;
  const comparisonLabel = deltas ? "vs previous period" : undefined;

  return (
    <PageContainer
      title="Manpower"
      description="Attendance, department headcount vs. benchmark, and labor-cost estimates."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Total Employees"
          value={num(totalEmployees)}
          sub="Current headcount"
          icon={Users}
          highlight
        />
        <MetricCard
          label="Present"
          value={num(summary.presentCount)}
          delta={deltas?.present.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={UserCheck}
          tone="positive"
        />
        <MetricCard
          label="Absent"
          value={num(summary.absentCount)}
          delta={deltas?.absent.percentageChange ?? undefined}
          deltaInvert
          comparisonLabel={comparisonLabel}
          icon={UserMinus}
          tone="negative"
        />
        <MetricCard
          label="Leave"
          value={num(summary.leaveCount)}
          delta={deltas?.leave.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={CalendarX2}
          tone="warning"
        />
        <MetricCard
          label="Attendance %"
          value={pct(summary.attendanceRate)}
          delta={deltas?.attendanceRate.percentageChange ?? undefined}
          comparisonLabel={comparisonLabel}
          icon={Percent}
          tone="accent"
        />
        <MetricCard
          label="Monthly Labor Cost"
          value={inr(monthlyLaborCost)}
          sub="Monthly figure — not date-range filtered"
          icon={IndianRupee}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AttendanceTrendChart data={attendanceTrend} />
        <DepartmentHeadcountChart data={departments} />
      </div>

      <ActualVsBenchmarkChart data={departments} />

      <DepartmentStaffingTable data={departments} />
    </PageContainer>
  );
}
