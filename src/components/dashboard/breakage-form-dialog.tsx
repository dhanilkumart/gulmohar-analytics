"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LocalBreakageRecord, DepartmentOption } from "./breakage-records-table";

/**
 * Add/Edit Breakage form, adapted from the Lovable UI's
 * `BreakageFormDialog` (src/components/app/management-forms.tsx) —
 * rebuilt on MAIN's `Field`/`FieldLabel`/`FieldError`/`FieldGroup`
 * primitives with react-hook-form's `register`/`Controller`, same
 * pattern established for `WastageFormDialog` in Step 8.
 *
 * Unlike Wastage, `Breakage.estimated_cost` has no linked
 * product/food-cost relationship in the real data model — it is a
 * directly recorded figure, not derived from a quantity × rate formula.
 * So there is no auto-computed cost preview here; Cost is a plain,
 * directly entered field, matching the real `Breakage` type.
 */

const breakageFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  departmentId: z.string().min(1, "Department is required"),
  item: z.string().trim().min(1, "Item is required"),
  quantity: z.number({ error: "Enter a valid number" }).positive("Quantity must be greater than zero"),
  cost: z.number({ error: "Enter a valid number" }).min(0, "Cost cannot be negative").optional(),
  reason: z.string().trim().min(1, "Reason or notes are required").max(300, "Keep notes under 300 characters"),
});

type BreakageFormValues = z.infer<typeof breakageFormSchema>;

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const emptyDefaults: BreakageFormValues = {
  date: todayIsoDate(),
  departmentId: "",
  item: "",
  quantity: 0,
  reason: "",
};

export interface BreakageItemOption {
  id: string;
  code: string;
  name: string;
  category: string;
  replacementCost: number | null;
}

export interface BreakageReasonOption {
  id: string;
  code: string;
  label: string;
}

export function BreakageFormDialog({
  open,
  onOpenChange,
  initial,
  departments,
  breakageItems = [],
  reasons = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LocalBreakageRecord | null;
  departments: DepartmentOption[];
  breakageItems?: BreakageItemOption[];
  reasons?: BreakageReasonOption[];
  onSave: (record: LocalBreakageRecord) => void;
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BreakageFormValues>({ resolver: zodResolver(breakageFormSchema), defaultValues: emptyDefaults });

  const selectedItemName = watch("item");
  const matchedItem = breakageItems.find(
    (b) => b.name.toLowerCase() === (selectedItemName || "").toLowerCase()
  );

  useEffect(() => {
    reset(
      initial
        ? {
            date: initial.date,
            departmentId: initial.departmentId,
            item: initial.item,
            quantity: initial.quantity,
            cost: initial.cost ?? undefined,
            reason: initial.reason,
          }
        : {
            ...emptyDefaults,
            item: breakageItems[0]?.name || "",
            reason: reasons[0]?.label || "Handling damage",
            departmentId: departments[0]?.departmentId || "",
          }
    );
  }, [initial, open, reset, breakageItems, reasons, departments]);

  const submit = async (values: BreakageFormValues) => {
    setSubmitError("");
    const department = departments.find((d) => d.departmentId === values.departmentId);
    if (!department) {
      setSubmitError("Select a valid department.");
      return;
    }
    // eslint-disable-next-line react-hooks/purity -- generated only inside this submit handler (never during render), to produce a unique local-prototype id.
    const id = initial?.id ?? `local-breakage-${Date.now()}`;
    onSave({
      id,
      date: values.date,
      departmentId: department.departmentId,
      departmentName: department.name,
      item: values.item,
      quantity: values.quantity,
      cost: initial?.cost ?? null,
      reason: values.reason,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-5 py-5 pr-12">
          <DialogTitle>{initial ? "Edit Breakage" : "Add Breakage"}</DialogTitle>
          <DialogDescription>
            Record a breakage item or event for a department. This is a local prototype entry — it is not saved
            to the underlying dataset and does not affect the analytics shown elsewhere on this page.
          </DialogDescription>
        </DialogHeader>
        {breakageItems.length === 0 ? (
          <div className="p-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">No active breakage items configured.</p>
              <p className="mt-1 text-xs">
                An administrator must configure trackable Breakage Items in Master Data Management before breakage events can be recorded.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} className="space-y-5 px-5 pb-5">
            {submitError ? (
              <div role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2.5 text-sm">
                {submitError}
              </div>
            ) : null}

            <FieldGroup className="grid gap-4 sm:grid-cols-2 sm:gap-4">
              <Field data-invalid={!!errors.date}>
                <FieldLabel htmlFor="breakage-date">Date *</FieldLabel>
                <Input id="breakage-date" type="date" {...register("date")} />
                <FieldError errors={[errors.date]} />
              </Field>

              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <Field data-invalid={!!errors.departmentId}>
                    <FieldLabel htmlFor="breakage-department">Department *</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="breakage-department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((department) => (
                          <SelectItem key={department.departmentId} value={department.departmentId}>
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[errors.departmentId]} />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="item"
                render={({ field }) => (
                  <Field className="sm:col-span-2" data-invalid={!!errors.item}>
                    <FieldLabel htmlFor="breakage-item">Breakage Item *</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="breakage-item">
                        <SelectValue placeholder="Select breakage item" />
                      </SelectTrigger>
                      <SelectContent>
                        {breakageItems.map((item) => (
                          <SelectItem key={item.id} value={item.name}>
                            {item.name} ({item.code}) — {item.category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {matchedItem && matchedItem.replacementCost !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Standard Replacement Cost: <span className="font-medium text-foreground">₹{matchedItem.replacementCost}</span>
                      </p>
                    )}
                    <FieldError errors={[errors.item]} />
                  </Field>
                )}
              />

              <Field className="sm:col-span-2" data-invalid={!!errors.quantity}>
                <FieldLabel htmlFor="breakage-quantity">Damaged Quantity *</FieldLabel>
                <Input
                  id="breakage-quantity"
                  type="number"
                  min="1"
                  step="1"
                  {...register("quantity", { valueAsNumber: true })}
                />
                <FieldError errors={[errors.quantity]} />
              </Field>

              <Controller
                control={control}
                name="reason"
                render={({ field }) => (
                  <Field className="sm:col-span-2" data-invalid={!!errors.reason}>
                    <FieldLabel htmlFor="breakage-reason">Reason *</FieldLabel>
                    {reasons.length > 0 ? (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="breakage-reason">
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
                      <Input
                        id="breakage-reason"
                        placeholder="e.g. Handling damage or Dropped"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                    <FieldError errors={[errors.reason]} />
                  </Field>
                )}
              />
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="animate-spin" /> : null} Save Breakage
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
