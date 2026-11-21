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
import { BreakageFormDialog, type BreakageItemOption, type BreakageReasonOption } from "@/components/dashboard/breakage-form-dialog";
import { inr, num } from "@/lib/format";

export interface DepartmentOption {
  departmentId: string;
  name: string;
}

export interface BreakageRecordItem {
  id: string;
  date: string;
  departmentId: string;
  departmentName: string;
  item: string;
  quantity: number;
  cost: number | null;
  unitCost?: number | null;
  reason: string;
  notes?: string;
  outletCode?: string;
  recordedBy?: string;
}

export type LocalBreakageRecord = BreakageRecordItem;

export function BreakageRecordsSection({
  departments,
  breakageItems = [],
  reasons = [],
}: {
  departments: DepartmentOption[];
  breakageItems?: BreakageItemOption[];
  reasons?: BreakageReasonOption[];
}) {
  const searchParams = useSearchParams();
  const currentOutletId = searchParams.get("outletId");

  const [records, setRecords] = useState<BreakageRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BreakageRecordItem | null>(null);
  const [viewing, setViewing] = useState<BreakageRecordItem | null>(null);
  const [deleting, setDeleting] = useState<BreakageRecordItem | null>(null);

  // Fetch real records from PostgreSQL API
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const query = currentOutletId ? `?outletId=${encodeURIComponent(currentOutletId)}` : "";
      const res = await fetch(`/api/dashboard/breakage${query}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.records)) {
          setRecords(json.records);
        }
      }
    } catch (err) {
      console.error("Failed to fetch breakage records:", err);
      toast.error("Failed to load records from database");
    } finally {
      setLoading(false);
    }
  }, [currentOutletId]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const query = currentOutletId ? `?outletId=${encodeURIComponent(currentOutletId)}` : "";
        const res = await fetch(`/api/dashboard/breakage${query}`);
        if (res.ok && !ignore) {
          const json = await res.json();
          if (json.success && Array.isArray(json.records)) {
            setRecords(json.records);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to fetch breakage records:", err);
          toast.error("Failed to load records from database");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [currentOutletId]);

  const saveRecord = async (formRecord: BreakageRecordItem) => {
    const isUpdate = Boolean(editing?.id);
    try {
      const method = isUpdate ? "PUT" : "POST";
      const payload = isUpdate
        ? {
            id: editing?.id,
            departmentId: formRecord.departmentId,
            item: formRecord.item,
            quantity: formRecord.quantity,
            cost: formRecord.cost,
            reason: formRecord.reason,
          }
        : {
            outletId: currentOutletId || undefined,
            departmentId: formRecord.departmentId,
            item: formRecord.item,
            quantity: formRecord.quantity,
            cost: formRecord.cost,
            reason: formRecord.reason,
            date: formRecord.date,
          };

      const res = await fetch("/api/dashboard/breakage", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save breakage record");
      }

      toast.success(isUpdate ? "Breakage record updated in database" : "Breakage record saved to database");
      setEditing(null);
      setFormOpen(false);
      fetchRecords();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to save breakage record");
    }
  };

  const deleteRecord = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/dashboard/breakage?id=${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete record");
      }

      toast.success("Breakage record deleted from database");
      setDeleting(null);
      fetchRecords();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to delete breakage record");
    }
  };

  const columns: Column<BreakageRecordItem>[] = [
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
      sortValue: (r) => r.cost ?? -1,
      cell: (r) => (
        <span className="font-semibold">
          {r.cost !== null && r.cost !== undefined ? inr(r.cost) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
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
        title="Breakage Records (PostgreSQL Database)"
        description="Active tableware breakage records persisted in PostgreSQL for your authorized outlet scope."
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
          emptyMessage={
            loading
              ? "Loading database records..."
              : "No breakage records found for this outlet. Use “Add Breakage” to record one."
          }
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
        breakageItems={breakageItems}
        reasons={reasons}
        onSave={saveRecord}
      />

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.item ?? "Breakage record"}
        description="Database breakage record details."
        fields={
          viewing
            ? [
                { label: "Date", value: viewing.date },
                { label: "Item", value: viewing.item },
                { label: "Department", value: viewing.departmentName },
                { label: "Quantity", value: num(viewing.quantity) },
                { label: "Cost", value: viewing.cost !== null && viewing.cost !== undefined ? inr(viewing.cost) : "—" },
                { label: "Recorded By", value: viewing.recordedBy ?? "—" },
                { label: "Reason / Notes", value: viewing.reason },
              ]
            : []
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this breakage record?"
        description="This action deletes the record permanently from the PostgreSQL database."
        confirmLabel="Delete Breakage"
        onConfirm={deleteRecord}
      />
    </section>
  );
}
