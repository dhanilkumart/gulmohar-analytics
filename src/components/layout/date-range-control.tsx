"use client";

import { useState, useTransition } from "react";
import { CalendarDays, ChevronDown, Calendar as CalendarIcon, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  resolveDateRange,
  type DateRangePreset,
  type DateRangeSelection,
} from "@/lib/analytics/date-range";
import { presetLabel, type ResolvedGlobalRange } from "@/lib/date-range-params";
import { useGlobalRange } from "./use-global-range";

/**
 * Visual presets list for the left sidebar inside the modal.
 */
const MODAL_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7Days", label: "Last 7 Days" },
  { value: "last30Days", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

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
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Temporary local state inside modal
  const [tempPreset, setTempPreset] = useState<DateRangePreset>(resolved.selection.preset);
  const [tempRange, setTempRange] = useState<DayPickerRange | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>(undefined);

  // Initialize temporary state whenever modal opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      const preset = resolved.selection.preset;
      setTempPreset(preset);

      let initialFrom: Date;
      let initialTo: Date;

      if (preset === "custom" && resolved.selection.custom) {
        initialFrom = parseISODateLocal(resolved.selection.custom.from);
        initialTo = parseISODateLocal(resolved.selection.custom.to);
      } else {
        initialFrom = parseISODateLocal(resolved.range.from);
        initialTo = parseISODateLocal(resolved.range.to);
      }

      setTempRange({ from: initialFrom, to: initialTo });
      setCalendarMonth(initialFrom);
    }
    setIsOpen(open);
  };

  // Handle preset click in left sidebar
  const handleSelectPreset = (preset: DateRangePreset) => {
    setTempPreset(preset);

    if (preset === "custom") {
      // Keep existing tempRange or leave for user selection
      return;
    }

    // Compute concrete date range for this preset
    const resolvedPreset = resolveDateRange({ preset });
    const fromDate = parseISODateLocal(resolvedPreset.from);
    const toDate = parseISODateLocal(resolvedPreset.to);

    setTempRange({ from: fromDate, to: toDate });
    setCalendarMonth(fromDate);
  };

  // Handle manual calendar date selection
  const handleCalendarSelect = (range: DayPickerRange | undefined) => {
    setTempPreset("custom");
    setTempRange(range);
  };

  // Apply changes to dashboard
  const handleApply = () => {
    if (!tempRange?.from) return;

    startTransition(() => {
      let finalSelection: DateRangeSelection;

      if (tempPreset === "custom") {
        const fromStr = toISODateLocal(tempRange.from!);
        const toStr = tempRange.to ? toISODateLocal(tempRange.to) : fromStr;
        finalSelection = {
          preset: "custom",
          custom: { from: fromStr, to: toStr },
        };
      } else {
        finalSelection = {
          preset: tempPreset,
        };
      }

      setSelection(finalSelection);
      setIsOpen(false);
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const isApplyDisabled = isPending || !tempRange?.from;

  // Formatted date values for start and end inputs
  const startFormatted = tempRange?.from ? format(tempRange.from, "dd MMM yyyy") : "";
  const endFormatted = tempRange?.to
    ? format(tempRange.to, "dd MMM yyyy")
    : tempRange?.from
    ? format(tempRange.from, "dd MMM yyyy")
    : "";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-card h-9 rounded-xl px-3 shadow-xs transition-all hover:bg-secondary">
          <CalendarDays className="text-muted-foreground mr-1 h-4 w-4" />
          <span className="max-w-[12rem] truncate text-xs font-medium sm:text-sm">{formatRangeLabel(resolved)}</span>
          <ChevronDown className="text-muted-foreground ml-1 h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-[95vw] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl rounded-2xl border-border bg-card shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground">Date Range</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select a date range for your dashboard.
          </DialogDescription>
        </DialogHeader>

        {/* Modal Body: Left Sidebar + Right Dual Calendar */}
        <div className="flex flex-col md:flex-row">
          {/* Left Preset Menu */}
          <div className="border-b border-border p-3 md:w-48 md:border-b-0 md:border-r md:p-4 bg-secondary/30">
            <div className="grid grid-cols-2 gap-1 md:flex md:flex-col">
              {MODAL_PRESETS.map((preset) => {
                const isActive = tempPreset === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleSelectPreset(preset.value)}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors text-left",
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <span>{preset.label}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/90 ml-2 hidden md:inline-block" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Calendar Section */}
          <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
            {/* Date display inputs */}
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Start:</span>
                <span className="font-semibold text-foreground">{startFormatted || "Select date"}</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 hidden sm:inline-block" />
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">End:</span>
                <span className="font-semibold text-foreground">{endFormatted || "Select date"}</span>
              </div>
              {tempPreset !== "custom" && (
                <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {presetLabel(tempPreset)}
                </span>
              )}
            </div>

            {/* Calendars: Two months side by side on desktop */}
            <div className="flex justify-center overflow-x-auto py-1">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={tempRange}
                onSelect={handleCalendarSelect}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                className="p-0 border-0"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border bg-secondary/20 px-5 py-3.5 sm:px-6 flex flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground truncate">
            {startFormatted ? (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                {startFormatted} {tempRange?.to && tempRange.to !== tempRange.from ? `– ${endFormatted}` : ""}
              </span>
            ) : (
              "No dates selected"
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="rounded-xl px-4 text-xs font-semibold">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isApplyDisabled}
              onClick={handleApply}
              className="rounded-xl px-5 text-xs font-semibold shadow-xs"
            >
              {isPending ? "Applying..." : "Apply Range"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
