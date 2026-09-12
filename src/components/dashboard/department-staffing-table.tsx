"use client";

import { DataTable, type Column } from "@/components/dashboard/data-table";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";
import type { DepartmentManpower } from "@/lib/analytics";

/**
 * "Department Detail" staffing table, adapted from the Lovable UI's
 * manpower route. Columns are limited to fields `DepartmentManpower`
 * actually exposes (departmentId, name, benchmarkHeadcount,
 * actualHeadcount, variance, monthlyLaborCost) — no per-department
 * Present/Absent/Leave/Attendance% columns, since MAIN's
 * `Attendance` records only link to `employee_id`, not `department_id`;
 * Lovable's per-department attendance breakdown is fabricated data with
 * no backing analytics function and is intentionally not ported.
 *
 * The "Staffing Status" badge is a zero-based read of the existing
 * `variance` field (above / below / at benchmark) — not a new numeric
 * threshold.
 */
export function DepartmentStaffingTable({ data }: { data: DepartmentManpower[] }) {
  const columns: Column<DepartmentManpower>[] = [
    {
      key: "name",
      header: "Department",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "actualHeadcount",
      header: "Current Headcount",
      align: "right",
      sortValue: (r) => r.actualHeadcount,
      cell: (r) => num(r.actualHeadcount),
    },
    {
      key: "benchmarkHeadcount",
      header: "Benchmark",
      align: "right",
      sortValue: (r) => r.benchmarkHeadcount,
      cell: (r) => num(r.benchmarkHeadcount),
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      sortValue: (r) => r.variance,
      cell: (r) => (
        <StatusBadge tone={r.variance > 0 ? "warning" : r.variance < 0 ? "negative" : "positive"}>
          {r.variance > 0 ? `+${r.variance} above` : r.variance < 0 ? `${r.variance} below` : "At benchmark"}
        </StatusBadge>
      ),
    },
    {
      key: "monthlyLaborCost",
      header: "Monthly Labor Cost",
      align: "right",
      sortValue: (r) => r.monthlyLaborCost,
      cell: (r) => inr(r.monthlyLaborCost),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Department Detail"
        description="Current staffing and monthly labor cost by department (snapshot, not date-range filtered)."
      />
      <div className="mt-4">
        <DataTable
          rows={data}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.departmentId}
          searchKeys={(row) => row.name}
          emptyMessage="No departments match your filters."
        />
      </div>
    </section>
  );
}
