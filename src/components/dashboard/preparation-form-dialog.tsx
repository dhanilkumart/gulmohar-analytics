"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";
import type { PreparationItemOption, DepartmentOption } from "./wastage-form-dialog";

export function PreparationFormDialog({
  open,
  onOpenChange,
  initial,
  preparationItems,
  departments,
  currentOutletId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: any | null;
  preparationItems: PreparationItemOption[];
  departments: DepartmentOption[];
  currentOutletId?: string | null;
  onSave: (record: any) => void;
}) {
  const [date, setDate] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      if (initial) {
        setDate(initial.date);
        setItemId(initial.itemId);
        setQuantity(String(initial.quantity));
        setDepartmentId(initial.departmentId || "");
        setNotes(initial.notes || "");
      } else {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
        setItemId(preparationItems[0]?.id || "");
        setQuantity("");
        setDepartmentId(departments[0]?.id || "");
        setNotes("");
      }
    }
  }, [open, initial, preparationItems, departments]);

  const selectedItem = useMemo(() => {
    return preparationItems.find((i) => i.id === itemId);
  }, [preparationItems, itemId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive prepared quantity.");
      return;
    }

    try {
      setSubmitting(true);
      const url = "/api/dashboard/preparation";
      const method = initial ? "PUT" : "POST";
      const payload: any = {
        outletId: currentOutletId,
        itemId,
        date,
        quantity: qty,
        departmentId: departmentId || undefined,
        notes,
      };

      if (initial) {
        payload.id = initial.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save preparation record");
        return;
      }

      onSave(json.record);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to submit preparation log");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Preparation Record" : "Log Batch Preparation"}</DialogTitle>
          <DialogDescription>
            Record cooked or prepped kitchen batches. This establishes the available stock for daily operations and waste validation.
          </DialogDescription>
        </DialogHeader>

        {preparationItems.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">No active preparation items configured.</p>
            <p className="mt-1 text-xs">
              An administrator must configure active Preparation Items in Master Data Management before kitchen batches can be logged.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel>Date</FieldLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={Boolean(initial)}
                required
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Preparation Item</FieldLabel>
              <Select
                value={itemId}
                onValueChange={setItemId}
                disabled={Boolean(initial)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select preparation item" />
                </SelectTrigger>
                <SelectContent>
                  {preparationItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.code}) — {item.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Code: <span className="font-medium text-foreground">{selectedItem.code}</span> • Unit:{" "}
                  <span className="font-medium text-foreground">{selectedItem.unit}</span>
                  {selectedItem.standardCost !== null && (
                    <> • Standard Cost: <span className="font-medium text-foreground">{inr(selectedItem.standardCost)}/{selectedItem.unit}</span></>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <FieldLabel>Prepared Quantity ({selectedItem?.unit || "units"})</FieldLabel>
              <Input
                type="number"
                step="any"
                min="0.001"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            {departments.length > 0 && (
              <div className="space-y-2">
                <FieldLabel>Department / Section (Optional)</FieldLabel>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select kitchen department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel>Notes (Optional)</FieldLabel>
              <Textarea
                placeholder="Morning batch, special lunch catering, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : initial ? "Save Changes" : "Log Preparation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

