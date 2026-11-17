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
import { WastageFormDialog } from "@/components/dashboard/wastage-form-dialog";
import { inr, num } from "@/lib/format";

export interface TrackedProductOption {
  productId: string;
  name: string;
  foodCost: number;
}

export interface WastageRecordItem {
  id: string;
  date: string;
  productId: string;
  productName: string;
  preparedQuantity: number;
  wastedQuantity: number;
  reason: string;
  notes: string;
  estimatedCost: number | null;
  outletCode?: string;
  recordedBy?: string;
}

export type LocalWastageRecord = WastageRecordItem;

export function WastageRecordsSection({
  trackedProducts,
  reasons,
}: {
  trackedProducts: TrackedProductOption[];
  reasons: string[];
}) {
  const searchParams = useSearchParams();
  const currentOutletId = searchParams.get("outletId");

  const [records, setRecords] = useState<WastageRecordItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WastageRecordItem | null>(null);
  const [viewing, setViewing] = useState<WastageRecordItem | null>(null);
  const [deleting, setDeleting] = useState<WastageRecordItem | null>(null);

  // Fetch real records from PostgreSQL API
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const query = currentOutletId ? `?outletId=${encodeURIComponent(currentOutletId)}` : "";
      const res = await fetch(`/api/dashboard/wastage${query}`);
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
  }, [currentOutletId]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const query = currentOutletId ? `?outletId=${encodeURIComponent(currentOutletId)}` : "";
        const res = await fetch(`/api/dashboard/wastage${query}`);
        if (res.ok && !ignore) {
          const json = await res.json();
          if (json.success && Array.isArray(json.records)) {
            setRecords(json.records);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to fetch wastage records:", err);
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

  const saveRecord = async (formRecord: WastageRecordItem) => {
    const isUpdate = Boolean(editing?.id);
    try {
      const method = isUpdate ? "PUT" : "POST";
      const payload = isUpdate
        ? {
            id: editing?.id,
            preparedQuantity: formRecord.preparedQuantity,
            wastedQuantity: formRecord.wastedQuantity,
            reason: formRecord.reason,
            notes: formRecord.notes,
          }
        : {
            outletId: currentOutletId || undefined,
            productId: formRecord.productId,
            dish: formRecord.productName,
            date: formRecord.date,
            preparedQuantity: formRecord.preparedQuantity,
            wastedQuantity: formRecord.wastedQuantity,
            reason: formRecord.reason,
            notes: formRecord.notes,
          };

      const res = await fetch("/api/dashboard/wastage", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save record");
      }

      toast.success(isUpdate ? "Wastage record updated in database" : "Wastage record saved to database");
      setEditing(null);
      setFormOpen(false);
      fetchRecords();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to save wastage record");
    }
  };

  const deleteRecord = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/dashboard/wastage?id=${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete record");
      }

      toast.success("Wastage record deleted from database");
      setDeleting(null);
      fetchRecords();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to delete wastage record");
    }
  };

  const columns: Column<WastageRecordItem>[] = [
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
      sortValue: (r) => r.estimatedCost ?? 0,
      cell: (r) => (
        <span className="font-semibold">
          {r.estimatedCost !== null ? inr(r.estimatedCost) : "—"}
        </span>
      ),
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
        title="Wastage Records (PostgreSQL Database)"
        description="Active food wastage records persisted in PostgreSQL for your authorized outlet scope."
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
          emptyMessage={
            loading
              ? "Loading database records..."
              : "No wastage records found for this outlet. Use “Add Wastage” to record one."
          }
        />
      </div>

      <WastageFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        initial={
          editing
            ? {
                ...editing,
                estimatedCost: editing.estimatedCost ?? 0,
              }
            : null
        }
        trackedProducts={trackedProducts}
        reasons={reasons}
        onSave={saveRecord}
      />

      <RecordDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.productName ?? "Wastage record"}
        description="Database wastage record details."
        fields={
          viewing
            ? [
                { label: "Date", value: viewing.date },
                { label: "Product", value: viewing.productName },
                { label: "Prepared Quantity", value: num(viewing.preparedQuantity) },
                { label: "Wasted Quantity", value: num(viewing.wastedQuantity) },
                { label: "Reason", value: viewing.reason },
                {
                  label: "Estimated Cost",
                  value: viewing.estimatedCost !== null ? inr(viewing.estimatedCost) : "Unknown (Cost Pending)",
                },
                { label: "Outlet", value: viewing.outletCode ?? "—" },
                { label: "Recorded By", value: viewing.recordedBy ?? "—" },
                { label: "Notes", value: viewing.notes || "None" },
              ]
            : []
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this wastage record?"
        description="This action deletes the record permanently from the PostgreSQL database."
        confirmLabel="Delete Wastage"
        onConfirm={deleteRecord}
      />
    </section>
  );
}
