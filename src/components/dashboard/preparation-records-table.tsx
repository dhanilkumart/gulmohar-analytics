"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { RecordActions } from "@/components/dashboard/record-actions";
import { RecordDetailDialog } from "@/components/dashboard/record-detail-dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { PreparationFormDialog } from "@/components/dashboard/preparation-form-dialog";
import type { PreparationItemOption, DepartmentOption } from "@/components/dashboard/wastage-form-dialog";
import { num } from "@/lib/format";

export interface PreparationRecordItem {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  standardCost: number | null;
  notes: string;
  outletId: string;
  outletCode: string;
  departmentId: string | null;
  departmentName: string | null;
  recordedBy: string;
}

export function PreparationRecordsSection({
  preparationItems,
  departments,
  onRecordChange,
}: {
  preparationItems: PreparationItemOption[];
  departments: DepartmentOption[];
  onRecordChange?: () => void;
}) {
  const searchParams = useSearchParams();
  const currentOutletId = searchParams.get("outletId");

  const [records, setRecords] = useState<PreparationRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PreparationRecordItem | null>(null);
  const [viewing, setViewing] = useState<PreparationRecordItem | null>(null);
  const [deleting, setDeleting] = useState<PreparationRecordItem | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const query = currentOutletId ? `?outletId=${encodeURIComponent(currentOutletId)}` : "";
      const res = await fetch(`/api/dashboard/preparation${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.records)) {
          setRecords(json.records);
        }
      }
    } catch (err) {
      console.error("Failed to fetch preparation records:", err);
      toast.error("Failed to load preparation records");
    } finally {
      setLoading(false);
    }
  }, [currentOutletId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSave = (record: any) => {
    toast.success(editing ? "Preparation record updated" : "Preparation logged successfully");
    fetchRecords();
    onRecordChange?.();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/dashboard/preparation?id=${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to delete preparation record");
        return;
      }
      toast.success("Preparation record deleted");
      fetchRecords();
      onRecordChange?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record");
    } finally {
      setDeleting(null);
    }
  };

  const columns: Column<PreparationRecordItem>[] = [
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
      header: "Prepared Qty",
      cell: (r) => (
        <span className="font-semibold text-foreground">
          {num(r.quantity)} <span className="text-xs text-muted-foreground">{r.unit}</span>
        </span>
      ),
      sortValue: (r) => r.quantity,
    },
    {
      key: "section",
      header: "Section",
      cell: (r) => (
        <span className="text-muted-foreground">{r.departmentName || "Kitchen"}</span>
      ),
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
        title="Preparation History"
        description="Daily kitchen batch preparation logs recorded for available operational stock."
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Log Preparation
          </Button>
        }
      />

      <DataTable
        rows={records}
        columns={columns}
        searchKeys={(r: PreparationRecordItem) =>
          `${r.itemName} ${r.itemCode} ${r.date} ${r.departmentName || ""}`
        }
        loading={loading}
        emptyMessage="No preparation batches recorded for this outlet and period."
      />

      <PreparationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        preparationItems={preparationItems}
        departments={departments}
        currentOutletId={currentOutletId}
        onSave={handleSave}
      />

      {viewing && (
        <RecordDetailDialog
          open={Boolean(viewing)}
          onOpenChange={(open) => !open && setViewing(null)}
          title="Preparation Batch Details"
          description={`Prepared on ${viewing.date}`}
          fields={[
            { label: "Date", value: viewing.date },
            { label: "Preparation Item", value: `${viewing.itemName} (${viewing.itemCode})` },
            { label: "Quantity", value: `${num(viewing.quantity)} ${viewing.unit}` },
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
          title="Delete Preparation Batch"
          description={`Are you sure you want to delete this batch of ${viewing?.quantity || deleting.quantity} ${deleting.unit} of ${deleting.itemName}? This will fail if waste has already been recorded against it.`}
          confirmLabel="Delete Batch"
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
