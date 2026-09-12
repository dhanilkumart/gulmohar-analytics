"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useGlobalRange } from "./use-global-range";

/**
 * Global comparison-mode control, adapted from the Lovable UI's
 * `ComparisonSelector`. "Previous Period" uses the existing
 * `getPreviousPeriodRange` (via `useGlobalRange` → `src/lib/date-range-params.ts`)
 * — no new comparison calculation.
 */
export function ComparisonControl() {
  const { resolved, setComparison } = useGlobalRange();
  const active = resolved.comparison === "previous";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("bg-card h-9 rounded-xl px-3", active && "border-primary text-primary")}
        >
          <span className="text-muted-foreground hidden sm:inline">Compare:</span>
          <span>{active ? "Previous Period" : "None"}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={() => setComparison("none")}
          className={cn(!active && "bg-primary-soft text-primary")}
        >
          None
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setComparison("previous")}
          className={cn(active && "bg-primary-soft text-primary")}
        >
          Previous Period
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
