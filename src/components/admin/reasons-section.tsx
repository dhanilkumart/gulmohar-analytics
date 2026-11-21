"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, CheckCircle2, XCircle, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ReasonRecord {
  id: string;
  code: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

export function ReasonsSection() {
  const [activeType, setActiveType] = useState<"wastage" | "breakage">("wastage");
  const [wastageReasons, setWastageReasons] = useState<ReasonRecord[]>([]);
  const [breakageReasons, setBreakageReasons] = useState<ReasonRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<ReasonRecord | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchReasons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/reasons?type=all&isActive=all");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setWastageReasons(json.wastageReasons || []);
          setBreakageReasons(json.breakageReasons || []);
        }
      } else {
        toast.error("Failed to load reason master data");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading reasons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReasons();
  }, [fetchReasons]);

  const currentReasons = activeType === "wastage" ? wastageReasons : breakageReasons;

  const handleOpenCreate = () => {
    setEditingReason(null);
    setFormData({
      code: "",
      label: "",
      description: "",
      displayOrder: currentReasons.length + 1,
      isActive: true,
    });
    setError("");
    setFormOpen(true);
  };

  const handleOpenEdit = (reason: ReasonRecord) => {
    setEditingReason(reason);
    setFormData({
      code: reason.code,
      label: reason.label,
      description: reason.description || "",
      displayOrder: reason.displayOrder,
      isActive: reason.isActive,
    });
    setError("");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.code.trim() || !formData.label.trim()) {
      setError("Reason code and label are required");
      return;
    }

    try {
      setIsSubmitting(true);
      const url = "/api/admin/reasons";
      const method = editingReason ? "PUT" : "POST";
      const payload: any = {
        type: activeType,
        code: formData.code.trim().toUpperCase(),
        label: formData.label.trim(),
        description: formData.description.trim() || undefined,
        displayOrder: Number(formData.displayOrder) || 0,
        isActive: formData.isActive,
      };

      if (editingReason) {
        payload.id = editingReason.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to save reason");
        return;
      }

      toast.success(editingReason ? "Reason updated" : "Reason created");
      setFormOpen(false);
      fetchReasons();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (reason: ReasonRecord) => {
    try {
      const res = await fetch("/api/admin/reasons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeType,
          id: reason.id,
          isActive: !reason.isActive,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update reason status");
      }

      toast.success(`${reason.label} is now ${!reason.isActive ? "Active" : "Inactive"}`);
      fetchReasons();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<ReasonRecord>[] = [
    {
      key: "code",
      header: "Code",
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.code}</span>,
      sortValue: (row) => row.code,
    },
    {
      key: "label",
      header: "Reason Label",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{row.label}</span>
        </div>
      ),
      sortValue: (row) => row.label,
    },
    {
      key: "description",
      header: "Description / Guidance",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.description || "—"}</span>
      ),
      sortValue: (row) => row.description || "",
    },
    {
      key: "order",
      header: "Order",
      cell: (row) => <span className="text-muted-foreground">{row.displayOrder}</span>,
      sortValue: (row) => row.displayOrder,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge tone={row.isActive ? "positive" : "neutral"}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
      sortValue: (row) => (row.isActive ? 1 : 0),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)} title="Edit reason">
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleActive(row)}
            title={row.isActive ? "Deactivate" : "Activate"}
            className={row.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}
          >
            {row.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="surface-card p-6">
      <SectionHeader
        title="Standard Operational Reasons"
        description="Standardized reason classifications for kitchen food wastage and dining breakage."
        action={
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Reason</span>
          </Button>
        }
      />

      <div className="mt-4 flex gap-2 border-b pb-3">
        <Button
          variant={activeType === "wastage" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveType("wastage")}
        >
          Wastage Reasons ({wastageReasons.length})
        </Button>
        <Button
          variant={activeType === "breakage" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveType("breakage")}
        >
          Breakage Reasons ({breakageReasons.length})
        </Button>
      </div>

      <div className="mt-4">
        <DataTable
          rows={currentReasons}
          columns={columns}
          searchKeys={(row) => `${row.code} ${row.label} ${row.description || ""}`}
          pageSize={10}
          loading={loading}
          emptyMessage={`No ${activeType} reasons configured yet.`}
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReason ? `Edit ${activeType === "wastage" ? "Wastage" : "Breakage"} Reason` : `Create ${activeType === "wastage" ? "Wastage" : "Breakage"} Reason`}
            </DialogTitle>
            <DialogDescription>
              Standard reason options available in staff and management logging forms.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel>Reason Code *</FieldLabel>
                <Input
                  placeholder={activeType === "wastage" ? "e.g. WR-01" : "e.g. BR-01"}
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Display Order</FieldLabel>
                <Input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData((p) => ({ ...p, displayOrder: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Reason Label *</FieldLabel>
              <Input
                placeholder={
                  activeType === "wastage"
                    ? "e.g. Overproduction, Spoilage, Quality Issue"
                    : "e.g. Dropped, Cracked, Handling damage"
                }
                value={formData.label}
                onChange={(e) => setFormData((p) => ({ ...p, label: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Description / Usage Guidance (Optional)</FieldLabel>
              <Textarea
                placeholder="Clarification of when staff should select this reason..."
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="reasonActive"
                checked={formData.isActive}
                onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="reasonActive" className="text-sm font-medium">
                Active for dropdown selection
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingReason ? "Save Changes" : "Create Reason"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

