"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PRESET_OPTIONS, presetLabel, type ResolvedGlobalRange } from "@/lib/date-range-params";
import { useGlobalRange } from "./use-global-range";

/**
 * Global date-range control — replaces the inert `DateRangeSlot` placeholder
 * from the shell-integration step. Visually adapted from the Lovable UI's
 * `DateRangePicker` (gulmohar-analytics-ui/src/components/app/filters.tsx),
 * but reads/writes the MAIN project's own URL-based range state
 * (`useGlobalRange`) — Lovable's `range-context.tsx` and its `factor`-based
 * mock scaling were not ported.
 *
 * Calendar-day handling: the mock data and `resolveDateRange` treat dates
 * as plain calendar days (no time-of-day, no timezone), so this component
 * converts between "YYYY-MM-DD" strings and `Date` objects using LOCAL
 * calendar semantics (`getFullYear`/`getMonth`/`getDate` and the
 * `new Date(y, m, d)` constructor) — never `toISOString()`/`Date.UTC`,
 * which would silently shift the selected day by one in timezones behind
 * UTC. This only concerns the picker UI; `resolveDateRange` itself
 * remains UTC-anchored internally, unaffected by this.
 */

function parseISODateLocal(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRangeLabel(resolved: ResolvedGlobalRange): string {
  if (resolved.selection.preset !== "custom") return presetLabel(resolved.selection.preset);
  const from = parseISODateLocal(resolved.range.from);
  const to = parseISODateLocal(resolved.range.to);
  if (resolved.range.from === resolved.range.to) return format(from, "dd MMM yyyy");
  return `${format(from, "dd MMM")} – ${format(to, "dd MMM yyyy")}`;
}

export function DateRangeControl() {
  const { resolved, setSelection } = useGlobalRange();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(undefined);

  const openCustomPicker = (open: boolean) => {
    setPopoverOpen(open);
    if (open) {
      setDraft(
        resolved.selection.preset === "custom" && resolved.selection.custom
          ? {
              from: parseISODateLocal(resolved.selection.custom.from),
              to: parseISODateLocal(resolved.selection.custom.to),
            }
          : undefined
      );
    }
  };

  const applyCustom = () => {
    if (!draft?.from) return;
    const from = draft.from;
    const to = draft.to ?? draft.from;
    setSelection({
      preset: "custom",
      custom: { from: toISODateLocal(from), to: toISODateLocal(to) },
    });
    setPopoverOpen(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="bg-card h-9 rounded-xl px-3">
          <CalendarDays className="text-muted-foreground" />
          <span className="max-w-[10rem] truncate">{formatRangeLabel(resolved)}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Date range</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PRESET_OPTIONS.map((option) =>
          option.value === "custom" ? (
            <Popover key={option.value} open={popoverOpen} onOpenChange={openCustomPicker}>
              <PopoverTrigger asChild>
                <DropdownMenuItem
                  onSelect={(event) => event.preventDefault()}
                  className={cn(
                    resolved.selection.preset === "custom" && "bg-primary-soft text-primary"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-auto p-0">
                <Calendar mode="range" numberOfMonths={2} selected={draft} onSelect={setDraft} />
                <div className="border-border flex items-center justify-between gap-3 border-t px-3 py-2">
                  <span className="text-muted-foreground text-xs">
                    {draft?.from
                      ? `${format(draft.from, "dd MMM yyyy")}${
                          draft.to ? ` – ${format(draft.to, "dd MMM yyyy")}` : ""
                        }`
                      : "Select a start and end date"}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPopoverOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!draft?.from} onClick={applyCustom}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setSelection({ preset: option.value })}
              className={cn(
                resolved.selection.preset === option.value && "bg-primary-soft text-primary"
              )}
            >
              {option.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
