"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/dashboard/ui-kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";

interface ProductOption {
  id: string;
  productCode: string;
  name: string;
  unit: string;
  foodCost: number | null;
}

interface RecipeItemDetail {
  id: string;
  ingredientId: string;
  ingredientCode: string;
  ingredientName: string;
  ingredientUnit: string;
  quantityPerUnit: number;
  defaultCost: number;
}

interface AvailableIngredient {
  id: string;
  ingredientCode: string;
  name: string;
  unit: string;
  defaultCost: number;
}

export function RecipesSection() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [recipeItems, setRecipeItems] = useState<RecipeItemDetail[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<AvailableIngredient[]>([]);
  const [loading, setLoading] = useState(false);

  // Add component modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch products
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch("/api/admin/products");
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.products)) {
            setProducts(json.products);
            if (json.products.length > 0 && !selectedProductId) {
              setSelectedProductId(json.products[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load products for recipe mapping:", err);
      }
    }
    loadProducts();
  }, [selectedProductId]);

  const loadRecipeDetails = useCallback(async (prodId: string) => {
    if (!prodId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/recipes?productId=${encodeURIComponent(prodId)}`);
      if (res.ok) {
        const json = await res.json();
        setRecipeItems(json.recipes || []);
        setAvailableIngredients(json.availableIngredients || []);
      } else {
        toast.error("Failed to load recipe components");
      }
    } catch {
      toast.error("Network error loading recipe");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchRecipe() {
      if (!selectedProductId) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/recipes?productId=${encodeURIComponent(selectedProductId)}`);
        if (res.ok && !ignore) {
          const json = await res.json();
          setRecipeItems(json.recipes || []);
          setAvailableIngredients(json.availableIngredients || []);
        }
      } catch {
        if (!ignore) toast.error("Network error loading recipe");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchRecipe();
    return () => {
      ignore = true;
    };
  }, [selectedProductId]);

  const handleOpenAdd = () => {
    setSelectedIngredientId(availableIngredients[0]?.id || "");
    setQuantity("");
    setModalOpen(true);
  };

  const handleSaveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedIngredientId) return;

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          ingredientId: selectedIngredientId,
          quantityPerUnit: qty,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save recipe item");

      toast.success("Ingredient added to recipe");
      setModalOpen(false);
      loadRecipeDetails(selectedProductId);
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComponent = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/admin/recipes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Removed ${name} from recipe`);
        loadRecipeDetails(selectedProductId);
      } else {
        toast.error("Failed to remove recipe item");
      }
    } catch {
      toast.error("Network error removing item");
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Recipe & Ingredient Mapping"
        description="Map raw ingredient components and quantities per unit portion of menu dishes."
      />

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-80">
          <label htmlFor="recipeProductSelect" className="text-muted-foreground mb-1 block text-xs font-medium">
            Select Menu Dish
          </label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger id="recipeProductSelect">
              <SelectValue placeholder="Select Product" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.productCode} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProductId && (
          <Button onClick={handleOpenAdd} className="rounded-xl self-end sm:self-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Ingredient to Recipe
          </Button>
        )}
      </div>

      <div className="mt-6">
        {selectedProduct && (
          <div className="bg-muted/40 mb-4 rounded-xl p-4 text-sm">
            <span className="font-semibold">{selectedProduct.name}</span>
            <span className="text-muted-foreground ml-2">
              (Standard Unit: {selectedProduct.unit} | Catalog Food Cost:{" "}
              {selectedProduct.foodCost !== null ? inr(selectedProduct.foodCost) : "NULL"}
              )
            </span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading recipe components...</div>
        ) : recipeItems.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed py-12 text-center">
            <BookOpen className="text-muted-foreground/40 mx-auto h-8 w-8" />
            <p className="mt-2 text-sm font-medium">No recipe mapped for this product yet.</p>
            <p className="text-muted-foreground text-xs">
              Click “Add Ingredient to Recipe” to map ingredients and portion quantities.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Ingredient</th>
                  <th className="px-4 py-3 text-right">Quantity / Unit</th>
                  <th className="px-4 py-3 text-right">Unit Rate</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {recipeItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="font-mono text-xs px-4 py-3">{item.ingredientCode}</td>
                    <td className="px-4 py-3 font-medium">{item.ingredientName}</td>
                    <td className="px-4 py-3 text-right">
                      {item.quantityPerUnit} {item.ingredientUnit}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {inr(item.defaultCost)} / {item.ingredientUnit}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteComponent(item.id, item.ingredientName)}
                        className="text-danger hover:text-danger h-8 w-8 p-0"
                        title="Remove ingredient from recipe"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Ingredient to Recipe</DialogTitle>
            <DialogDescription>
              Map a raw ingredient and required portion quantity for {selectedProduct?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveComponent} className="space-y-4 py-2">
            <Field>
              <FieldLabel htmlFor="ingredientSelect">Ingredient *</FieldLabel>
              <Select value={selectedIngredientId} onValueChange={setSelectedIngredientId}>
                <SelectTrigger id="ingredientSelect">
                  <SelectValue placeholder="Select Ingredient" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {availableIngredients.map((ing) => (
                    <SelectItem key={ing.id} value={ing.id}>
                      {ing.ingredientCode} — {ing.name} ({ing.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="quantity">Quantity per Portion / Unit *</FieldLabel>
              <Input
                id="quantity"
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="e.g. 0.150"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Save to Recipe
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
