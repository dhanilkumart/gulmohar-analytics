"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, CheckCircle2, XCircle, Wine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";

export interface BreakageItemRecord {
  id: string;
  code: string;
  name: string;
  category: string;
  replacementCost: number | null;
  isActive: boolean;
}

const CATEGORIES = ["Tableware", "Glassware", "Cutlery", "Kitchenware", "Equipment"];

export function BreakageItemsSection() {
  const [items, setItems] = useState<BreakageItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BreakageItemRecord | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    category: "Tableware",
    replacementCost: "",
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/breakage-items");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.items)) {
          setItems(json.items);
        }
      } else {
        toast.error("Failed to load breakage items catalog");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading breakage items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      code: "",
      name: "",
      category: "Tableware",
      replacementCost: "",
      isActive: true,
    });
    setError("");
    setFormOpen(true);
  };

  const handleOpenEdit = (item: BreakageItemRecord) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      category: item.category,
      replacementCost: item.replacementCost !== null ? String(item.replacementCost) : "",
      isActive: item.isActive,
    });
    setError("");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.code.trim() || !formData.name.trim()) {
      setError("Item code and name are required");
      return;
    }

    try {
      setIsSubmitting(true);
      const url = "/api/admin/breakage-items";
      const method = editingItem ? "PUT" : "POST";
      const payload: any = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        category: formData.category,
        replacementCost: formData.replacementCost.trim() ? parseFloat(formData.replacementCost) : null,
        isActive: formData.isActive,
      };

      if (editingItem) {
        payload.id = editingItem.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to save item");
        return;
      }

      toast.success(editingItem ? "Breakage item updated" : "Breakage item created");
      setFormOpen(false);
      fetchItems();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (item: BreakageItemRecord) => {
    try {
      const res = await fetch("/api/admin/breakage-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          isActive: !item.isActive,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update item status");
      }

      toast.success(`${item.name} is now ${!item.isActive ? "Active" : "Inactive"}`);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const columns: Column<BreakageItemRecord>[] = [
    {
      key: "code",
      header: "Item Code",
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.code}</span>,
      sortValue: (row) => row.code,
    },
    {
      key: "name",
      header: "Item Name",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Wine className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.name}</span>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => <span className="text-muted-foreground">{row.category}</span>,
      sortValue: (row) => row.category,
    },
    {
      key: "cost",
      header: "Standard Replacement Cost",
      cell: (row) => (
        <span>
          {row.replacementCost !== null ? inr(row.replacementCost) : <span className="text-xs text-muted-foreground">—</span>}
        </span>
      ),
      sortValue: (row) => row.replacementCost ?? -1,
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
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)} title="Edit item">
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
        title="Breakage Master Items"
        description="Catalog of trackable crockery, glassware, cutlery, and kitchenware with baseline replacement costs."
        action={
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Breakage Item</span>
          </Button>
        }
      />

      <div className="mt-4">
        <DataTable
          rows={items}
          columns={columns}
          searchKeys={(row) => `${row.code} ${row.name} ${row.category}`}
          pageSize={10}
          loading={loading}
          emptyMessage="No breakage items configured yet."
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Breakage Item" : "Create Breakage Item"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update item details or standard replacement cost."
                : "Add a new trackable item to the central master catalog."}
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
                <FieldLabel>Item Code *</FieldLabel>
                <Input
                  placeholder="e.g. BRK-001"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Category</FieldLabel>
                <Select
                  value={formData.category}
                  onValueChange={(val) => setFormData((p) => ({ ...p, category: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Item Name *</FieldLabel>
              <Input
                placeholder="e.g. Dinner Plate, Water Glass, Tea Cup"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Replacement Cost (₹) (Optional)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 150.00"
                value={formData.replacementCost}
                onChange={(e) => setFormData((p) => ({ ...p, replacementCost: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                When staff log breakage, this cost will be used automatically unless left blank.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="itemActive"
                checked={formData.isActive}
                onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="itemActive" className="text-sm font-medium">
                Active for operational logging
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingItem ? "Save Changes" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
