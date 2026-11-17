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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";

interface CategoryOption {
  id: string;
  categoryCode: string;
  name: string;
}

interface ProductItem {
  id: string;
  productCode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  defaultSellingPrice: number;
  foodCost: number | null;
  unit: string;
  preparationType: string;
  isActive: boolean;
  recipeCount: number;
  usageCount: number;
}

export function ProductsSection() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [formData, setFormData] = useState({
    productCode: "",
    name: "",
    categoryId: "",
    defaultSellingPrice: "",
    foodCost: "",
    unit: "portion",
    preparationType: "batch",
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/products");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setProducts(json.products || []);
          setCategories(json.categories || []);
        }
      } else {
        toast.error("Failed to load products");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error loading products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/products");
        if (res.ok && !ignore) {
          const json = await res.json();
          if (json.success) {
            setProducts(json.products || []);
            setCategories(json.categories || []);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          toast.error("Network error loading products");
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
    setEditingProduct(null);
    setFormData({
      productCode: "",
      name: "",
      categoryId: categories[0]?.id || "",
      defaultSellingPrice: "",
      foodCost: "",
      unit: "portion",
      preparationType: "batch",
      isActive: true,
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setFormData({
      productCode: p.productCode,
      name: p.name,
      categoryId: p.categoryId,
      defaultSellingPrice: String(p.defaultSellingPrice),
      foodCost: p.foodCost !== null ? String(p.foodCost) : "",
      unit: p.unit,
      preparationType: p.preparationType.toLowerCase(),
      isActive: p.isActive,
    });
    setFormOpen(true);
  };

  const handleToggleStatus = async (p: ProductItem) => {
    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          isActive: !p.isActive,
        }),
      });
      if (res.ok) {
        toast.success(`Product ${!p.isActive ? "activated" : "deactivated"} successfully`);
        fetchProducts();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update product status");
      }
    } catch {
      toast.error("Failed to toggle product status");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingProduct) {
        const res = await fetch("/api/admin/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProduct.id,
            name: formData.name,
            categoryId: formData.categoryId,
            defaultSellingPrice: formData.defaultSellingPrice,
            foodCost: formData.foodCost.trim() === "" ? null : formData.foodCost,
            unit: formData.unit,
            preparationType: formData.preparationType,
            isActive: formData.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update product");
        toast.success("Product updated successfully");
      } else {
        const res = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productCode: formData.productCode,
            name: formData.name,
            categoryId: formData.categoryId,
            defaultSellingPrice: formData.defaultSellingPrice,
            foodCost: formData.foodCost.trim() === "" ? null : formData.foodCost,
            unit: formData.unit,
            preparationType: formData.preparationType,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create product");
        toast.success("Product created successfully");
      }
      setFormOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<ProductItem>[] = [
    {
      key: "code",
      header: "Code",
      sortValue: (r) => r.productCode,
      cell: (r) => <span className="font-mono text-xs">{r.productCode}</span>,
    },
    {
      key: "name",
      header: "Product Name",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (r) => r.categoryName,
      cell: (r) => <StatusBadge tone="neutral">{r.categoryName}</StatusBadge>,
    },
    {
      key: "sellingPrice",
      header: "Selling Price",
      align: "right",
      sortValue: (r) => r.defaultSellingPrice,
      cell: (r) => <span className="font-semibold">{inr(r.defaultSellingPrice)}</span>,
    },
    {
      key: "foodCost",
      header: "Food Cost",
      align: "right",
      sortValue: (r) => r.foodCost ?? -1,
      cell: (r) => (
        <span>
          {r.foodCost !== null ? inr(r.foodCost) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Margin %",
      align: "right",
      sortValue: (r) =>
        r.foodCost !== null && r.defaultSellingPrice > 0
          ? ((r.defaultSellingPrice - r.foodCost) / r.defaultSellingPrice) * 100
          : -1,
      cell: (r) => {
        if (r.foodCost === null || r.defaultSellingPrice <= 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const margin = ((r.defaultSellingPrice - r.foodCost) / r.defaultSellingPrice) * 100;
        return (
          <span className={margin < 40 ? "text-amber-600 font-medium" : "text-emerald-600 font-medium"}>
            {margin.toFixed(1)}%
          </span>
        );
      },
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
            title="Edit Product"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleToggleStatus(r)}
            className={`h-8 w-8 p-0 ${r.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
            title={r.isActive ? "Deactivate Product" : "Activate Product"}
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
        title="Menu & Product Master"
        description="Shared organization catalog, default selling prices, food costs, and active status."
        action={
          <Button onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        }
      />

      <div className="mt-4">
        <DataTable
          rows={products}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.id}
          searchKeys={(row) => `${row.name} ${row.productCode} ${row.categoryName}`}
          filters={[
            {
              key: "category",
              label: "Category",
              options: [...new Set(products.map((p) => p.categoryName))],
              match: (row, value) => row.categoryName === value,
            },
            {
              key: "status",
              label: "Status",
              options: ["Active", "Inactive"],
              match: (row, value) => (value === "Active" ? row.isActive : !row.isActive),
            },
          ]}
          emptyMessage={loading ? "Loading products from database..." : "No products found."}
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Update product catalog details, category, or pricing."
                : "Create a new product in the organization master catalog."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              {!editingProduct && (
                <Field>
                  <FieldLabel htmlFor="productCode">Product Code *</FieldLabel>
                  <Input
                    id="productCode"
                    placeholder="e.g. P001, BIRYANI"
                    value={formData.productCode}
                    onChange={(e) => setFormData((prev) => ({ ...prev, productCode: e.target.value }))}
                    required
                  />
                </Field>
              )}

              <Field className={editingProduct ? "col-span-2" : ""}>
                <FieldLabel htmlFor="name">Product Name *</FieldLabel>
                <Input
                  id="name"
                  placeholder="e.g. Malabar Chicken Dum Biryani"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="categoryId">Category *</FieldLabel>
                <Select
                  value={formData.categoryId}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, categoryId: val }))}
                >
                  <SelectTrigger id="categoryId">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="unit">Unit</FieldLabel>
                <Input
                  id="unit"
                  placeholder="portion, plate, glass"
                  value={formData.unit}
                  onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="defaultSellingPrice">Selling Price (₹) *</FieldLabel>
                <Input
                  id="defaultSellingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.defaultSellingPrice}
                  onChange={(e) => setFormData((prev) => ({ ...prev, defaultSellingPrice: e.target.value }))}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="foodCost">Food Cost (₹) (Optional)</FieldLabel>
                <Input
                  id="foodCost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Leave empty for NULL"
                  value={formData.foodCost}
                  onChange={(e) => setFormData((prev) => ({ ...prev, foodCost: e.target.value }))}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="preparationType">Preparation Type</FieldLabel>
              <Select
                value={formData.preparationType}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, preparationType: val }))}
              >
                <SelectTrigger id="preparationType">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch Preparation</SelectItem>
                  <SelectItem value="fresh_daily">Fresh Daily</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {editingProduct && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="pIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="pIsActive" className="text-sm font-medium">
                  Active in Menu
                </label>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {editingProduct ? "Save Changes" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
