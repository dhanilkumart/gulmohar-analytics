"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { RecordActions } from "@/components/dashboard/record-actions";
import { RecordDetailDialog } from "@/components/dashboard/record-detail-dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { BreakageFormDialog } from "@/components/dashboard/breakage-form-dialog";
import { inr, num } from "@/lib/format";

export interface DepartmentOption {
  departmentId: string;
  name: string;
}

/**
 * A locally-added breakage record — V1 prototype UI state only. Never
 * written to `mock_data/`, never affects the analytics fetched by the
 * server page, and disappears on refresh. See the "analytics vs. local
 * CRUD boundary" note in `src/app/dashboard/breakage/page.tsx`. Mirrors
 * `LocalWastageRecord` from Step 8.
 */
export interface LocalBreakageRecord {
  id: string;
  date: string;
  departmentId: string;
  departmentName: string;
  item: string;
  quantity: number;
  cost: number;
  reason: string;
}

/**
 * Local-only Add/Edit/View/Delete workflow for breakage records, adapted
 * from the Lovable UI's Breakage route and reusing the shared
 * `RecordActions`/`RecordDetailDialog`/`ConfirmDialog` pieces first built
 * for Wastage in Step 8.
 *
 * Deliberately starts with an EMPTY record list rather than Lovable's
 * fabricated seed rows — this project's data layer only has real
 * `breakage.json` rows (already shown, read-only, in `BreakageDetailTable`
 * above); inventing plausible-looking "example" local records here would
 * blur the line between real and prototype data.
 *
 * No database/API/localStorage — `records` is plain `useState`, lost on
 * refresh, exactly as intended for a V1 prototype. The callback/interface
 * shape (`onSave`, `onOpenChange`) is kept identical to Wastage's so a
 * future persistence layer could be wired in without reshaping the UI.
 */
export function BreakageRecordsSection({ departments }: { departments: DepartmentOption[] }) {
  const [records, setRecords] = useState<LocalBreakageRecord[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalBreakageRecord | null>(null);
  const [viewing, setViewing] = useState<LocalBreakageRecord | null>(null);
  const [deleting, setDeleting] = useState<LocalBreakageRecord | null>(null);

  const saveRecord = (record: LocalBreakageRecord) => {
    const isUpdate = records.some((item) => item.id === record.id);
    setRecords((current) => (isUpdate ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]));
    setEditing(null);
    toast.success(isUpdate ? "Breakage record updated (local prototype only)" : "Breakage record added (local prototype only)");
  };

  const columns: Column<LocalBreakageRecord>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="num">{r.date}</span> },
    {
      key: "item",
      header: "Item",
      sortValue: (r) => r.item,
      cell: (r) => <span className="font-medium">{r.item}</span>,
    },
    {
      key: "department",
      header: "Department",
      sortValue: (r) => r.departmentName,
      cell: (r) => <StatusBadge tone="neutral">{r.departmentName}</StatusBadge>,
    },
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
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <RecordActions
          label={r.item}
          onView={() => setViewing(r)}
          onEdit={() => {
            setEditing(r);
            setFormOpen(true);
          }}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Breakage Records (Local Prototype)"
        description="Manually recorded breakage entries for this session only — not persisted, and not reflected in the analytics above."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-xl"
          >
            <Plus /> Add Breakage
          </Button>
        }
      />
      <div className="mt-4">
        <DataTable
          rows={records}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.id}
          searchKeys={(row) => `${row.item} ${row.departmentName} ${row.reason}`}
          filters={[
            {
              key: "department",
              label: "Department",
              options: [...new Set(records.map((row) => row.departmentName))],
              match: (row, value) => row.departmentName === value,
            },
          ]}
          emptyMessage="No local breakage records yet. Use “Add Breakage” to record one for this session."
        />
      </div>

      <BreakageFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        initial={editing}
        departments={departments}
        onSave={saveRecord}
      />

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.item ?? "Breakage record"}
        description="Local prototype breakage record — not persisted."
        fields={
          viewing
            ? [
                { label: "Date", value: viewing.date },
                { label: "Department", value: viewing.departmentName },
                { label: "Quantity", value: num(viewing.quantity) },
                { label: "Cost", value: inr(viewing.cost) },
                { label: "Reason / Notes", value: viewing.reason },
              ]
            : []
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this breakage record?"
        description="This removes the record from the current prototype session only."
        confirmLabel="Delete Breakage"
        onConfirm={() => {
          if (!deleting) return;
          setRecords((current) => current.filter((row) => row.id !== deleting.id));
          setDeleting(null);
          toast.success("Breakage record deleted (local prototype only)");
        }}
      />
    </section>
  );
}
