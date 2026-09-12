"use client";

import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * User/profile menu, adapted from the Lovable UI shell's `UserMenu`.
 * UI-only for this integration step — no authentication/backend behavior.
 * Profile/Settings/Logout are placeholders until real account handling
 * is wired up in a later step.
 */
export function UserMenu() {
  const placeholder = (label: string) =>
    toast(`${label} is ready for integration`, {
      description: "This account control is currently a frontend preview.",
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-card h-auto min-w-0 gap-2.5 rounded-xl py-1.5 pr-2 pl-1.5 sm:pr-3"
        >
          <span className="bg-primary-soft text-primary grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold">
            RV
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-xs font-semibold">Ramesh Varma</span>
            <span className="text-muted-foreground block truncate text-[11px] font-normal">
              Owner
            </span>
          </span>
          <ChevronDown className="text-muted-foreground hidden sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl">
        <DropdownMenuLabel>
          <span className="block text-sm">Ramesh Varma</span>
          <span className="text-muted-foreground block text-xs font-normal">
            Restaurant Owner
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => placeholder("Profile")}>
          <UserRound /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => placeholder("Settings")}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => placeholder("Logout")}
          className="text-danger focus:text-danger"
        >
          <LogOut /> Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
