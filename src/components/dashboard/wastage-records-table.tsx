"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { RecordActions } from "@/components/dashboard/record-actions";
import { RecordDetailDialog } from "@/components/dashboard/record-detail-dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { WastageFormDialog, type PreparationItemOption, type DepartmentOption, type ReasonOption } from "@/components/dashboard/wastage-form-dialog";
import { inr, num } from "@/lib/format";

export interface WastageRecordItem {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  wastedQuantity: number;
  unitCost: number | null;
  estimatedCost: number | null;
  reason: string;
  notes: string;
  outletId: string;
  outletCode: string;
  departmentId: string | null;
  departmentName: string | null;
  recordedBy: string;
}

export function WastageRecordsSection({
  preparationItems,
  departments,
  reasons = [],
  onRecordChange,
}: {
  preparationItems: PreparationItemOption[];
  departments: DepartmentOption[];
  reasons?: ReasonOption[];
  onRecordChange?: () => void;
}) {

  const [records, setRecords] = useState<WastageRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WastageRecordItem | null>(null);
  const [viewing, setViewing] = useState<WastageRecordItem | null>(null);
  const [deleting, setDeleting] = useState<WastageRecordItem | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/wastage`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.records)) {
          setRecords(json.records);
        }
      }
    } catch (err) {
      console.error("Failed to fetch wastage records:", err);
      toast.error("Failed to load records from database");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSave = () => {
    toast.success(editing ? "Wastage record updated" : "Wastage record saved");
    fetchRecords();
    onRecordChange?.();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/dashboard/wastage?id=${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to delete record");
        return;
      }
      toast.success("Wastage record deleted");
      fetchRecords();
      onRecordChange?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record");
    } finally {
      setDeleting(null);
    }
  };

  const columns: Column<WastageRecordItem>[] = [
    {
      key: "date",
      header: "Date",
      cell: (r) => <span className="font-medium text-foreground">{r.date}</span>,
      sortValue: (r) => r.date,
    },
    {
      key: "item",
      header: "Preparation Item",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.itemName}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">({r.itemCode})</span>
        </div>
      ),
      sortValue: (r) => r.itemName,
    },
    {
      key: "quantity",
      header: "Wasted Qty",
      cell: (r) => (
        <span className="font-semibold text-foreground">
          {num(r.wastedQuantity)} <span className="text-xs text-muted-foreground">{r.unit}</span>
        </span>
      ),
      sortValue: (r) => r.wastedQuantity,
    },
    {
      key: "reason",
      header: "Reason",
      cell: (r) => <StatusBadge tone={r.reason === "Over-preparation" ? "warning" : "neutral"}>{r.reason}</StatusBadge>,
      sortValue: (r) => r.reason,
    },
    {
      key: "cost",
      header: "Estimated Cost",
      cell: (r) => (
        <span className="text-foreground">
          {r.estimatedCost !== null ? inr(r.estimatedCost) : <span className="text-muted-foreground text-xs">—</span>}
        </span>
      ),
      sortValue: (r) => r.estimatedCost ?? -1,
    },
    {
      key: "section",
      header: "Section",
      cell: (r) => <span className="text-muted-foreground">{r.departmentName || "Kitchen"}</span>,
    },
    {
      key: "recordedBy",
      header: "Recorded By",
      cell: (r) => <span className="text-muted-foreground">{r.recordedBy}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (r) => (
        <RecordActions
          label={r.itemName}
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
    <div className="space-y-4 pt-4">
      <SectionHeader
        title="Wastage Records"
        description="Recorded kitchen waste batches validated against available prepared stock."
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Record Wastage
          </Button>
        }
      />

      <DataTable
        rows={records}
        columns={columns}
        searchKeys={(r: WastageRecordItem) =>
          `${r.itemName} ${r.itemCode} ${r.reason} ${r.date} ${r.departmentName || ""}`
        }
        loading={loading}
        emptyMessage="No wastage records logged for this outlet and period."
      />

      <WastageFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        preparationItems={preparationItems}
        departments={departments}
        reasons={reasons}
        onSave={handleSave}
      />

      {viewing && (
        <RecordDetailDialog
          open={Boolean(viewing)}
          onOpenChange={(open) => !open && setViewing(null)}
          title="Wastage Record Details"
          description={`Recorded on ${viewing.date}`}
          fields={[
            { label: "Date", value: viewing.date },
            { label: "Preparation Item", value: `${viewing.itemName} (${viewing.itemCode})` },
            { label: "Wasted Quantity", value: `${num(viewing.wastedQuantity)} ${viewing.unit}` },
            { label: "Unit Cost", value: viewing.unitCost !== null ? inr(viewing.unitCost) : "Unconfigured" },
            { label: "Estimated Total Cost", value: viewing.estimatedCost !== null ? inr(viewing.estimatedCost) : "Uncalculated" },
            { label: "Reason", value: viewing.reason },
            { label: "Section / Department", value: viewing.departmentName || "Kitchen" },
            { label: "Recorded By", value: viewing.recordedBy },
            { label: "Notes", value: viewing.notes || "None" },
          ]}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete Wastage Record"
          description={`Are you sure you want to delete the record of ${deleting.wastedQuantity} ${deleting.unit} wasted of ${deleting.itemName}?`}
          confirmLabel="Delete Record"
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
