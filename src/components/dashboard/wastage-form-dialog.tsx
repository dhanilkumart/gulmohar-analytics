"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inr } from "@/lib/format";
import type { LocalWastageRecord, TrackedProductOption } from "./wastage-records-table";

/**
 * Add/Edit Wastage form, adapted from the Lovable UI's
 * `WastageFormDialog` (src/components/app/management-forms.tsx) —
 * rebuilt on the MAIN project's `Field`/`FieldLabel`/`FieldError`
 * primitive (Lovable's classic `Form`/`FormField`/`FormItem`/
 * `FormMessage` abstraction does not exist in this project's shadcn
 * registry — see docs/architecture notes from Step 3) with
 * react-hook-form's `register`/`Controller` directly.
 *
 * Three real-data corrections vs. Lovable's original:
 * - `productId` options come from `trackedProducts` (real preparation-
 *   tracked products from the MAIN data layer), not a fabricated
 *   `PREP_ITEMS` list.
 * - `reason` options come from `reasons` (real distinct `Wastage.reason`
 *   values), not an invented list including "Spoilage"/"Quality Issue"/
 *   "Kitchen Error"/"Other".
 * - Estimated cost = `wastedQuantity × product.food_cost` (the real
 *   business rule), not Lovable's fabricated per-unit-rate derivation.
 */

const wastageFormSchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    productId: z.string().min(1, "Preparation item is required"),
    preparedQuantity: z
      .number({ error: "Enter a valid number" })
      .positive("Prepared quantity must be greater than zero"),
    wastedQuantity: z
      .number({ error: "Enter a valid number" })
      .min(0, "Wasted quantity cannot be negative"),
    reason: z.string().min(1, "Reason is required"),
    notes: z.string().max(300, "Keep notes under 300 characters"),
  })
  .refine((data) => data.wastedQuantity <= data.preparedQuantity, {
    message: "Wasted quantity cannot exceed prepared quantity",
    path: ["wastedQuantity"],
  });

type WastageFormValues = z.infer<typeof wastageFormSchema>;

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const emptyDefaults: WastageFormValues = {
  date: todayIsoDate(),
  productId: "",
  preparedQuantity: 0,
  wastedQuantity: 0,
  reason: "",
  notes: "",
};

export function WastageFormDialog({
  open,
  onOpenChange,
  initial,
  trackedProducts,
  reasons,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: LocalWastageRecord | null;
  trackedProducts: TrackedProductOption[];
  reasons: string[];
  onSave: (record: LocalWastageRecord) => void;
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WastageFormValues>({ resolver: zodResolver(wastageFormSchema), defaultValues: emptyDefaults });

  useEffect(() => {
    reset(
      initial
        ? {
            date: initial.date,
            productId: initial.productId,
            preparedQuantity: initial.preparedQuantity,
            wastedQuantity: initial.wastedQuantity,
            reason: initial.reason,
            notes: initial.notes,
          }
        : emptyDefaults
    );
    setSubmitError("");
  }, [initial, open, reset]);

  const selectedProductId = watch("productId");
  const wastedQuantity = Number(watch("wastedQuantity")) || 0;
  const selectedProduct = useMemo(
    () => trackedProducts.find((p) => p.productId === selectedProductId),
    [trackedProducts, selectedProductId]
  );
  const estimatedCost = selectedProduct ? wastedQuantity * selectedProduct.foodCost : 0;

  const submit = async (values: WastageFormValues) => {
    setSubmitError("");
    const product = trackedProducts.find((p) => p.productId === values.productId);
    if (!product) {
      setSubmitError("Select a valid tracked preparation item.");
      return;
    }
    onSave({
      id: initial?.id ?? `local-wastage-${Date.now()}`,
      date: values.date,
      productId: product.productId,
      productName: product.name,
      preparedQuantity: values.preparedQuantity,
      wastedQuantity: values.wastedQuantity,
      reason: values.reason,
      notes: values.notes,
      estimatedCost: values.wastedQuantity * product.foodCost,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-5 py-5 pr-12">
          <DialogTitle>{initial ? "Edit Wastage" : "Add Wastage"}</DialogTitle>
          <DialogDescription>
            Record wastage for a tracked preparation item. This is a local prototype entry — it is not saved
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
              <FieldLabel htmlFor="wastage-date">Date *</FieldLabel>
              <Input id="wastage-date" type="date" {...register("date")} />
              <FieldError errors={[errors.date]} />
            </Field>

            <Controller
              control={control}
              name="productId"
              render={({ field }) => (
                <Field data-invalid={!!errors.productId}>
                  <FieldLabel htmlFor="wastage-product">Product / Preparation Item *</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="wastage-product">
                      <SelectValue placeholder="Select tracked item" />
                    </SelectTrigger>
                    <SelectContent>
                      {trackedProducts.map((product) => (
                        <SelectItem key={product.productId} value={product.productId}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[errors.productId]} />
                </Field>
              )}
            />

            <Field data-invalid={!!errors.preparedQuantity}>
              <FieldLabel htmlFor="wastage-prepared">Prepared Quantity *</FieldLabel>
              <Input
                id="wastage-prepared"
                type="number"
                min="0"
                step="0.1"
                {...register("preparedQuantity", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.preparedQuantity]} />
            </Field>

            <Field data-invalid={!!errors.wastedQuantity}>
              <FieldLabel htmlFor="wastage-wasted">Wasted Quantity *</FieldLabel>
              <Input
                id="wastage-wasted"
                type="number"
                min="0"
                step="0.1"
                {...register("wastedQuantity", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.wastedQuantity]} />
            </Field>

            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Field className="sm:col-span-2" data-invalid={!!errors.reason}>
                  <FieldLabel htmlFor="wastage-reason">Reason *</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="wastage-reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[errors.reason]} />
                </Field>
              )}
            />

            <Field className="sm:col-span-2" data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="wastage-notes">Notes</FieldLabel>
              <Textarea
                id="wastage-notes"
                placeholder="Add relevant kitchen or service context"
                className="min-h-24"
                {...register("notes")}
              />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>

          <div className="bg-secondary flex items-center justify-between rounded-xl px-4 py-3">
            <span className="text-muted-foreground text-sm">Estimated Wastage Cost</span>
            <strong className="num text-lg">{inr(estimatedCost)}</strong>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="animate-spin" /> : null} Save Wastage
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
