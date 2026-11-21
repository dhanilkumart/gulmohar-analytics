"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit, Check, X, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/field";
import { inr } from "@/lib/format";

interface PreparationItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  standardCost: number | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  isActive: boolean;
  usageCount: number;
}

interface Department {
  id: string;
  name: string;
  departmentCode: string;
}

export function PreparationItemsSection() {
  const [items, setItems] = useState<PreparationItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PreparationItem | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("kg");
  const [standardCost, setStandardCost] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsRes, deptsRes] = await Promise.all([
        fetch("/api/admin/preparation-items"),
        fetch("/api/admin/departments"),
      ]);

      if (itemsRes.ok) {
        const json = await itemsRes.json();
        if (json.success) setItems(json.items || []);
      }
      if (deptsRes.ok) {
        const json = await deptsRes.json();
        if (json.success) setDepartments(json.departments || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load preparation items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingItem(null);
    setName("");
    setCode("");
    setUnit("kg");
    setStandardCost("");
    setDepartmentId(departments[0]?.id || "");
    setIsActive(true);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (item: PreparationItem) => {
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setUnit(item.unit);
    setStandardCost(item.standardCost !== null ? String(item.standardCost) : "");
    setDepartmentId(item.departmentId || "");
    setIsActive(item.isActive);
    setError("");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !code.trim() || !unit.trim()) {
      setError("Name, code, and unit are required.");
      return;
    }

    try {
      setSubmitting(true);
      const url = "/api/admin/preparation-items";
      const method = editingItem ? "PUT" : "POST";
      const payload: any = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        unit: unit.trim().toLowerCase(),
        standardCost: standardCost ? Number(standardCost) : null,
        departmentId: departmentId || null,
        isActive,
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
        setError(json.error || "Failed to save preparation item");
        return;
      }

      toast.success(editingItem ? "Preparation item updated" : "Preparation item created");
      setFormOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save preparation item");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (item: PreparationItem) => {
    try {
      const res = await fetch("/api/admin/preparation-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      });
      if (res.ok) {
        toast.success(`Item '${item.name}' ${item.isActive ? "deactivated" : "activated"}`);
        loadData();
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Kitchen Preparation Items</h2>
          <p className="text-xs text-muted-foreground">
            Master catalog of cooked batches, bases, gravies, and intermediate kitchen preps. Separated from menu items.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Add Preparation Item
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Item Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Standard Cost</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Loading preparation items...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No preparation items configured yet. Click &quot;Add Preparation Item&quot; to define kitchen items (e.g. Sambar, Idli Batter, Rice).
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs font-semibold">{item.code}</TableCell>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.standardCost !== null ? inr(item.standardCost) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.departmentName || "Kitchen"}</TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(item)}
                        className={item.isActive ? "text-destructive hover:bg-destructive/10" : "text-emerald-600 hover:bg-emerald-50"}
                      >
                        {item.isActive ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Preparation Item" : "Add Kitchen Preparation Item"}</DialogTitle>
            <DialogDescription>
              Configure intermediate kitchen batches. Active items appear in the preparation and wastage logging interfaces.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel>Item Name</FieldLabel>
              <Input
                placeholder="e.g. Sambar, Idli Batter, Rice, Coconut Chutney"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel>Item Code</FieldLabel>
                <Input
                  placeholder="e.g. PREP-01"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Unit</FieldLabel>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="litre">litre</SelectItem>
                    <SelectItem value="portion">portion</SelectItem>
                    <SelectItem value="pcs">pcs</SelectItem>
                    <SelectItem value="tray">tray</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Standard Unit Cost (₹) (Optional)</FieldLabel>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Cost per unit for waste valuation (e.g. 45.00)"
                value={standardCost}
                onChange={(e) => setStandardCost(e.target.value)}
              />
            </div>

            {departments.length > 0 && (
              <div className="space-y-2">
                <FieldLabel>Department / Section</FieldLabel>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select kitchen department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.departmentCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="prepIsActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="prepIsActive" className="text-sm font-medium text-foreground cursor-pointer">
                Active item (visible in preparation & wastage logs)
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingItem ? "Update Item" : "Create Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

