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
  cost: z.number({ error: "Enter a valid number" }).positive("Cost must be greater than zero"),
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
  cost: 0,
  reason: "",
};

export function BreakageFormDialog({
  open,
  onOpenChange,
  initial,
  departments,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LocalBreakageRecord | null;
  departments: DepartmentOption[];
  onSave: (record: LocalBreakageRecord) => void;
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BreakageFormValues>({ resolver: zodResolver(breakageFormSchema), defaultValues: emptyDefaults });

  useEffect(() => {
    reset(
      initial
        ? {
            date: initial.date,
            departmentId: initial.departmentId,
            item: initial.item,
            quantity: initial.quantity,
            cost: initial.cost,
            reason: initial.reason,
          }
        : emptyDefaults
    );
  }, [initial, open, reset]);

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
      cost: values.cost,
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

            <Field className="sm:col-span-2" data-invalid={!!errors.item}>
              <FieldLabel htmlFor="breakage-item">Item *</FieldLabel>
              <Input id="breakage-item" placeholder="e.g. Dinner Plate or Glass Tumbler" {...register("item")} />
              <FieldError errors={[errors.item]} />
            </Field>

            <Field data-invalid={!!errors.quantity}>
              <FieldLabel htmlFor="breakage-quantity">Quantity *</FieldLabel>
              <Input
                id="breakage-quantity"
                type="number"
                min="0"
                step="1"
                {...register("quantity", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.quantity]} />
            </Field>

            <Field data-invalid={!!errors.cost}>
              <FieldLabel htmlFor="breakage-cost">Cost *</FieldLabel>
              <Input id="breakage-cost" type="number" min="0" step="1" {...register("cost", { valueAsNumber: true })} />
              <FieldError errors={[errors.cost]} />
            </Field>

            <Field className="sm:col-span-2" data-invalid={!!errors.reason}>
              <FieldLabel htmlFor="breakage-reason">Reason / Notes *</FieldLabel>
              <Textarea
                id="breakage-reason"
                placeholder="Describe the breakage event"
                className="min-h-24"
                {...register("reason")}
              />
              <FieldError errors={[errors.reason]} />
            </Field>
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
      </DialogContent>
    </Dialog>
  );
}
