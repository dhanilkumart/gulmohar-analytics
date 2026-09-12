import Link from "next/link";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { num, pct } from "@/lib/format";
import type { AttendanceSummary, DepartmentManpower } from "@/lib/analytics";

/**
 * "Manpower Overview". Two data sources with different date-range
 * behavior, called out explicitly in the UI copy rather than blended:
 * - `attendance` (`getAttendanceSummary` over the selected range) IS
 *   range-aware.
 * - `departments` (`getDepartmentManpower()`) has NO date-range
 *   parameter in the existing analytics layer — it reflects the current
 *   active-employee snapshot regardless of the selected range. Not
 *   faked as range-aware here.
 */
export function ManpowerOverview({
  attendance,
  departments,
}: {
  attendance: AttendanceSummary;
  departments: DepartmentManpower[];
}) {
  const totalEmployees = departments.reduce((sum, d) => sum + d.actualHeadcount, 0);
  const totalBenchmark = departments.reduce((sum, d) => sum + d.benchmarkHeadcount, 0);
  const variance = totalEmployees - totalBenchmark;

  const stats = [
    { label: "Total Employees", value: num(totalEmployees) },
    { label: "Present (period)", value: num(attendance.presentCount) },
    { label: "Absent (period)", value: num(attendance.absentCount) },
    { label: "Leave (period)", value: num(attendance.leaveCount) },
    { label: "Attendance % (period)", value: pct(attendance.attendanceRate) },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Manpower Overview"
        description="Attendance for the selected period; staffing is a current snapshot."
        action={
          <Link href="/dashboard/manpower" className="text-primary text-xs font-semibold hover:underline">
            Details
          </Link>
        }
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-2">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-secondary rounded-xl p-3">
            <p className="text-muted-foreground text-[11px]">{stat.label}</p>
            <p className="num mt-1 text-base font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="border-border mt-4 flex items-center justify-between rounded-xl border p-3 text-sm">
        <span className="text-muted-foreground">Actual vs Benchmark (current)</span>
        <span className="num font-semibold">
          {totalEmployees} / {totalBenchmark}
          <StatusBadge tone={variance > 0 ? "warning" : "positive"} className="ml-2">
            {variance >= 0 ? "+" : ""}
            {variance}
          </StatusBadge>
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {departments.slice(0, 4).map((dept) => (
          <div key={dept.departmentId} className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground min-w-0 flex-1 truncate">{dept.name}</span>
            <span className="num w-16 text-right">
              {dept.actualHeadcount}/{dept.benchmarkHeadcount}
            </span>
            <StatusBadge
              tone={dept.variance > 0 ? "warning" : dept.variance < 0 ? "negative" : "positive"}
              className="w-12 justify-center"
            >
              {dept.variance >= 0 ? "+" : ""}
              {dept.variance}
            </StatusBadge>
          </div>
        ))}
      </div>
    </section>
  );
}
