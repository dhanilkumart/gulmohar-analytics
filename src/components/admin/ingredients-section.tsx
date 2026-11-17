"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/format";

interface IngredientItem {
  id: string;
  ingredientCode: string;
  name: string;
  unit: string;
  defaultCost: number;
  isActive: boolean;
  recipeCount: number;
}

export function IngredientsSection() {
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<IngredientItem | null>(null);
  const [formData, setFormData] = useState({
    ingredientCode: "",
    name: "",
    unit: "kg",
    defaultCost: "",
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchIngredients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/ingredients");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.ingredients)) {
          setIngredients(json.ingredients);
        }
      } else {
        toast.error("Failed to load ingredients");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error loading ingredients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/ingredients");
        if (res.ok && !ignore) {
          const json = await res.json();
          if (json.success && Array.isArray(json.ingredients)) {
            setIngredients(json.ingredients);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          toast.error("Network error loading ingredients");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingIng(null);
    setFormData({
      ingredientCode: "",
      name: "",
      unit: "kg",
      defaultCost: "",
      isActive: true,
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (ing: IngredientItem) => {
    setEditingIng(ing);
    setFormData({
      ingredientCode: ing.ingredientCode,
      name: ing.name,
      unit: ing.unit,
      defaultCost: String(ing.defaultCost),
      isActive: ing.isActive,
    });
    setFormOpen(true);
  };

  const handleToggleStatus = async (ing: IngredientItem) => {
    try {
      const res = await fetch("/api/admin/ingredients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ing.id,
          isActive: !ing.isActive,
        }),
      });
      if (res.ok) {
        toast.success(`Ingredient ${!ing.isActive ? "activated" : "deactivated"} successfully`);
        fetchIngredients();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update ingredient status");
      }
    } catch {
      toast.error("Failed to toggle ingredient status");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingIng) {
        const res = await fetch("/api/admin/ingredients", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingIng.id,
            name: formData.name,
            unit: formData.unit,
            defaultCost: formData.defaultCost,
            isActive: formData.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update ingredient");
        toast.success("Ingredient updated successfully");
      } else {
        const res = await fetch("/api/admin/ingredients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredientCode: formData.ingredientCode,
            name: formData.name,
            unit: formData.unit,
            defaultCost: formData.defaultCost,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create ingredient");
        toast.success("Ingredient created successfully");
      }
      setFormOpen(false);
      fetchIngredients();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<IngredientItem>[] = [
    {
      key: "code",
      header: "Code",
      sortValue: (r) => r.ingredientCode,
      cell: (r) => <span className="font-mono text-xs">{r.ingredientCode}</span>,
    },
    {
      key: "name",
      header: "Ingredient Name",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "unit",
      header: "Unit",
      sortValue: (r) => r.unit,
      cell: (r) => <span className="text-muted-foreground">{r.unit}</span>,
    },
    {
      key: "cost",
      header: "Standard Cost / Unit",
      align: "right",
      sortValue: (r) => r.defaultCost,
      cell: (r) => <span className="font-semibold">{inr(r.defaultCost)}</span>,
    },
    {
      key: "recipeCount",
      header: "Used in Recipes",
      align: "right",
      sortValue: (r) => r.recipeCount,
      cell: (r) => <span>{r.recipeCount}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => (r.isActive ? 1 : 0),
      cell: (r) => (
        <StatusBadge tone={r.isActive ? "positive" : "neutral"}>
          {r.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenEdit(r)}
            className="h-8 w-8 p-0"
            title="Edit Ingredient"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleToggleStatus(r)}
            className={`h-8 w-8 p-0 ${r.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
            title={r.isActive ? "Deactivate Ingredient" : "Activate Ingredient"}
          >
            {r.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Raw Ingredients Directory"
        description="Master ingredients, units of measurement, and default cost rates."
        action={
          <Button onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Add Ingredient
          </Button>
        }
      />

      <div className="mt-4">
        <DataTable
          rows={ingredients}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.id}
          searchKeys={(row) => `${row.name} ${row.ingredientCode}`}
          filters={[
            {
              key: "unit",
              label: "Unit",
              options: [...new Set(ingredients.map((i) => i.unit))],
              match: (row, value) => row.unit === value,
            },
            {
              key: "status",
              label: "Status",
              options: ["Active", "Inactive"],
              match: (row, value) => (value === "Active" ? row.isActive : !row.isActive),
            },
          ]}
          emptyMessage={loading ? "Loading ingredients from database..." : "No ingredients found."}
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIng ? "Edit Ingredient" : "Add New Ingredient"}</DialogTitle>
            <DialogDescription>
              {editingIng
                ? "Update ingredient unit or standard cost."
                : "Create a new raw ingredient in the organization master."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {!editingIng && (
              <Field>
                <FieldLabel htmlFor="ingredientCode">Ingredient Code *</FieldLabel>
                <Input
                  id="ingredientCode"
                  placeholder="e.g. I001, RICE, GHEE"
                  value={formData.ingredientCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ingredientCode: e.target.value }))}
                  required
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="name">Ingredient Name *</FieldLabel>
              <Input
                id="name"
                placeholder="e.g. Basmati Rice, Refined Oil"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="unit">Unit of Measure *</FieldLabel>
                <Input
                  id="unit"
                  placeholder="kg, liter, packet"
                  value={formData.unit}
                  onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="defaultCost">Standard Cost (₹) *</FieldLabel>
                <Input
                  id="defaultCost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.defaultCost}
                  onChange={(e) => setFormData((prev) => ({ ...prev, defaultCost: e.target.value }))}
                  required
                />
              </Field>
            </div>

            {editingIng && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ingIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="ingIsActive" className="text-sm font-medium">
                  Active Ingredient
                </label>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {editingIng ? "Save Changes" : "Create Ingredient"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
