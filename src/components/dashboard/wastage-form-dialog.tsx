"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr } from "@/lib/format";

export interface PreparationItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  standardCost: number | null;
  departmentId: string | null;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface ReasonOption {
  id: string;
  code: string;
  label: string;
}

export function WastageFormDialog({
  open,
  onOpenChange,
  initial,
  preparationItems,
  departments,
  reasons = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: any | null;
  preparationItems: PreparationItemOption[];
  departments: DepartmentOption[];
  reasons?: ReasonOption[];
  onSave: (record: any) => void;
}) {
  const [date, setDate] = useState("");
  const [itemId, setItemId] = useState("");
  const [wastedQty, setWastedQty] = useState("");
  const [reason, setReason] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [availableQty, setAvailableQty] = useState<number | null>(null);
  const [checkingAvailable, setCheckingAvailable] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      if (initial) {
        setDate(initial.date);
        setItemId(initial.itemId);
        setWastedQty(String(initial.wastedQuantity));
        setReason(initial.reason);
        setDepartmentId(initial.departmentId || "");
        setNotes(initial.notes || "");
      } else {
        const today = new Date().toISOString().split("T")[0];
        setDate(today);
        setItemId(preparationItems[0]?.id || "");
        setWastedQty("");
        setReason(reasons[0]?.label || "End-of-day unsold");
        setDepartmentId(departments[0]?.id || "");
        setNotes("");
      }
    }
  }, [open, initial, preparationItems, departments, reasons]);

  const selectedItem = useMemo(() => {
    return preparationItems.find((i) => i.id === itemId);
  }, [preparationItems, itemId]);

  // Query available prepared quantity when item and date change
  useEffect(() => {
    if (!open || !itemId || !date) {
      setAvailableQty(null);
      return;
    }

    let ignore = false;
    async function checkStock() {
      try {
        setCheckingAvailable(true);
        const res = await fetch(`/api/dashboard/preparation?itemId=${encodeURIComponent(itemId)}&startDate=${date}&endDate=${date}`);
        if (res.ok && !ignore) {
          const json = await res.json();
          const totalPrepared = (json.records || []).reduce((sum: number, r: any) => sum + r.quantity, 0);

          // Get existing wastage for that day
          const wasteRes = await fetch(`/api/dashboard/wastage?itemId=${encodeURIComponent(itemId)}&startDate=${date}&endDate=${date}`);
          let totalWasted = 0;
          if (wasteRes.ok) {
            const wasteJson = await wasteRes.json();
            totalWasted = (wasteJson.records || [])
              .filter((r: any) => !initial || r.id !== initial.id)
              .reduce((sum: number, r: any) => sum + r.wastedQuantity, 0);
          }

          setAvailableQty(Math.max(0, totalPrepared - totalWasted));
        }
      } catch (err) {
        // Silently handle check failure
      } finally {
        if (!ignore) setCheckingAvailable(false);
      }
    }

    checkStock();
    return () => {
      ignore = true;
    };
  }, [open, itemId, date, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = Number(wastedQty);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive wastage quantity.");
      return;
    }

    if (availableQty !== null && qty > availableQty) {
      setError(`Wasted quantity (${qty} ${selectedItem?.unit || ""}) exceeds available preparation (${availableQty} ${selectedItem?.unit || ""}).`);
      return;
    }

    try {
      setSubmitting(true);
      const url = "/api/dashboard/wastage";
      const method = initial ? "PUT" : "POST";
      const payload: any = {
        itemId,
        date,
        wastedQuantity: qty,
        reason,
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
        setError(json.error || "Failed to save wastage record");
        return;
      }

      onSave(json.record);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to submit wastage");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Wastage Record" : "Record Kitchen Wastage"}</DialogTitle>
          <DialogDescription>
            Record waste against a prepared kitchen batch. Wastage cannot exceed prepared quantity.
          </DialogDescription>
        </DialogHeader>

        {preparationItems.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">No active preparation items configured.</p>
            <p className="mt-1 text-xs">
              An administrator must configure active Preparation Items in Master Data Management before kitchen wastage can be recorded.
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
                      {item.name} ({item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Unit: <span className="font-medium text-foreground">{selectedItem.unit}</span>
                  {selectedItem.standardCost !== null && (
                    <> • Standard Cost: <span className="font-medium text-foreground">{inr(selectedItem.standardCost)}/{selectedItem.unit}</span></>
                  )}
                </p>
              )}
            </div>

            {itemId && (
              <div className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                {checkingAvailable ? (
                  <span>Checking available preparation stock...</span>
                ) : availableQty !== null ? (
                  <span>
                    Available for waste:{" "}
                    <strong className={availableQty > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-destructive font-semibold"}>
                      {availableQty.toFixed(2)} {selectedItem?.unit}
                    </strong>{" "}
                    prepared on {date}.
                  </span>
                ) : (
                  <span>Enter a date to verify prepared batch availability.</span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <FieldLabel>Wasted Quantity ({selectedItem?.unit || "units"})</FieldLabel>
              <Input
                type="number"
                step="any"
                min="0.001"
                placeholder="0.00"
                value={wastedQty}
                onChange={(e) => setWastedQty(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Reason for Wastage</FieldLabel>
              {reasons.length > 0 ? (
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select standard reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons.map((r) => (
                      <SelectItem key={r.id} value={r.label}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  No active wastage reasons configured. Please configure Reasons in Master Data.
                </div>
              )}
            </div>

            {departments.length > 0 && (
              <div className="space-y-2">
                <FieldLabel>Department (Optional)</FieldLabel>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select kitchen section" />
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
                placeholder="Operational context (e.g. unexpected lunch rain drop)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || (reasons.length > 0 && !reason)}>
                {submitting ? "Saving..." : initial ? "Save Changes" : "Record Wastage"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
