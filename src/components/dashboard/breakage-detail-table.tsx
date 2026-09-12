"use client";

import { DataTable, type Column } from "@/components/dashboard/data-table";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { inr, num } from "@/lib/format";

export interface BreakageDetailRow {
  breakageId: string;
  date: string;
  departmentName: string;
  item: string;
  quantity: number;
  cost: number;
  reason: string;
}

/**
 * Real, read-only breakage events for the selected range — one row per
 * `Breakage` record (each row is exactly one "Breakage Event", matching
 * the KPI count). Distinct from `BreakageRecordsSection` below, which is
 * a local-only Add/Edit/View/Delete prototype and never affects this
 * table.
 */
export function BreakageDetailTable({ rows }: { rows: BreakageDetailRow[] }) {
  const departmentOptions = [...new Set(rows.map((row) => row.departmentName))].sort();

  const columns: Column<BreakageDetailRow>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="num">{r.date}</span> },
    {
      key: "department",
      header: "Department",
      sortValue: (r) => r.departmentName,
      cell: (r) => <StatusBadge tone="neutral">{r.departmentName}</StatusBadge>,
    },
    { key: "item", header: "Item", sortValue: (r) => r.item, cell: (r) => <span className="font-medium">{r.item}</span> },
    { key: "quantity", header: "Quantity", align: "right", sortValue: (r) => r.quantity, cell: (r) => num(r.quantity) },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      sortValue: (r) => r.cost,
      cell: (r) => <span className="font-semibold">{inr(r.cost)}</span>,
    },
    {
      key: "reason",
      header: "Reason / Notes",
      sortValue: (r) => r.reason,
      cell: (r) => <span className="text-muted-foreground">{r.reason}</span>,
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Breakage Detail"
        description="Every recorded breakage event for the selected period."
      />
      <div className="mt-4">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.breakageId}
          pageSize={8}
          searchKeys={(r) => `${r.item} ${r.departmentName} ${r.reason}`}
          filters={[
            {
              key: "department",
              label: "Department",
              options: departmentOptions,
              match: (r, v) => r.departmentName === v,
            },
          ]}
          emptyMessage="No breakage events for the selected period."
        />
      </div>
    </section>
  );
}
