"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Read-only record detail dialog, adapted from the Lovable UI's
 * src/components/app/record-detail.tsx. Reusable for any local CRUD
 * "View" action (first used here for Wastage records).
 */
export function RecordDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fields: { label: string; value: string }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="bg-secondary rounded-xl px-4 py-3">
              <dt className="text-muted-foreground text-[11px]">{field.label}</dt>
              <dd className="mt-1 text-sm font-semibold whitespace-pre-wrap">{field.value || "—"}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
