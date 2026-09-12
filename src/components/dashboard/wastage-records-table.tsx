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
import { WastageFormDialog } from "@/components/dashboard/wastage-form-dialog";
import { inr, num } from "@/lib/format";

export interface TrackedProductOption {
  productId: string;
  name: string;
  foodCost: number;
}

/**
 * A locally-added wastage record — this is V1 prototype UI state only.
 * It is never written to `mock_data/`, never affects the analytics
 * fetched by the server page, and disappears on refresh. See the
 * "analytics vs. local CRUD boundary" note in
 * `src/app/dashboard/wastage/page.tsx`.
 */
export interface LocalWastageRecord {
  id: string;
  date: string;
  productId: string;
  productName: string;
  preparedQuantity: number;
  wastedQuantity: number;
  reason: string;
  notes: string;
  /** wastedQuantity × the product's real food cost — never user-entered. */
  estimatedCost: number;
}

/**
 * Local-only Add/Edit/View/Delete workflow for wastage records, adapted
 * from the Lovable UI's Wastage route (the `useState<WastageRecord[]>`
 * + `WastageFormDialog`/`RecordDetailDialog`/`ConfirmDialog` composition
 * in gulmohar-analytics-ui/src/routes/wastage.tsx).
 *
 * Deliberately starts with an EMPTY record list rather than Lovable's
 * fabricated seed rows — this project's data layer only has real
 * `wastage.json` rows (already shown, read-only, in the charts/tables
 * above); inventing plausible-looking "example" local records here would
 * blur the line between real and prototype data, which the task
 * explicitly rules out ("do not fabricate preparation/wastage records").
 *
 * No database/API/localStorage — `records` is plain `useState`, lost on
 * refresh, exactly as intended for a V1 prototype.
 */
export function WastageRecordsSection({
  trackedProducts,
  reasons,
}: {
  trackedProducts: TrackedProductOption[];
  reasons: string[];
}) {
  const [records, setRecords] = useState<LocalWastageRecord[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalWastageRecord | null>(null);
  const [viewing, setViewing] = useState<LocalWastageRecord | null>(null);
  const [deleting, setDeleting] = useState<LocalWastageRecord | null>(null);

  const saveRecord = (record: LocalWastageRecord) => {
    const isUpdate = records.some((item) => item.id === record.id);
    setRecords((current) => (isUpdate ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]));
    setEditing(null);
    toast.success(isUpdate ? "Wastage record updated (local prototype only)" : "Wastage record added (local prototype only)");
  };

  const columns: Column<LocalWastageRecord>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="num">{r.date}</span> },
    {
      key: "product",
      header: "Product",
      sortValue: (r) => r.productName,
      cell: (r) => <span className="font-medium">{r.productName}</span>,
    },
    {
      key: "prepared",
      header: "Prepared Qty",
      align: "right",
      sortValue: (r) => r.preparedQuantity,
      cell: (r) => num(r.preparedQuantity),
    },
    {
      key: "wasted",
      header: "Wasted Qty",
      align: "right",
      sortValue: (r) => r.wastedQuantity,
      cell: (r) => num(r.wastedQuantity),
    },
    {
      key: "reason",
      header: "Reason",
      sortValue: (r) => r.reason,
      cell: (r) => <StatusBadge tone="warning">{r.reason}</StatusBadge>,
    },
    {
      key: "cost",
      header: "Estimated Cost",
      align: "right",
      sortValue: (r) => r.estimatedCost,
      cell: (r) => <span className="font-semibold">{inr(r.estimatedCost)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <RecordActions
          label={r.productName}
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
        title="Wastage Records (Local Prototype)"
        description="Manually recorded wastage entries for this session only — not persisted, and not reflected in the analytics above."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-xl"
          >
            <Plus /> Add Wastage
          </Button>
        }
      />
      <div className="mt-4">
        <DataTable
          rows={records}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.id}
          searchKeys={(row) => `${row.productName} ${row.reason} ${row.notes}`}
          filters={[
            {
              key: "reason",
              label: "Reason",
              options: [...new Set(records.map((row) => row.reason))],
              match: (row, value) => row.reason === value,
            },
          ]}
          emptyMessage="No local wastage records yet. Use “Add Wastage” to record one for this session."
        />
      </div>

      <WastageFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        initial={editing}
        trackedProducts={trackedProducts}
        reasons={reasons}
        onSave={saveRecord}
      />

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.productName ?? "Wastage record"}
        description="Local prototype wastage record — not persisted."
        fields={
          viewing
            ? [
                { label: "Date", value: viewing.date },
                { label: "Prepared Quantity", value: num(viewing.preparedQuantity) },
                { label: "Wasted Quantity", value: num(viewing.wastedQuantity) },
                { label: "Reason", value: viewing.reason },
                { label: "Estimated Cost", value: inr(viewing.estimatedCost) },
                { label: "Notes", value: viewing.notes },
              ]
            : []
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this wastage record?"
        description="This removes the record from the current prototype session only."
        confirmLabel="Delete Wastage"
        onConfirm={() => {
          if (!deleting) return;
          setRecords((current) => current.filter((row) => row.id !== deleting.id));
          setDeleting(null);
          toast.success("Wastage record deleted (local prototype only)");
        }}
      />
    </section>
  );
}
