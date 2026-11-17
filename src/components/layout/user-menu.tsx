"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck, Store } from "lucide-react";
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

interface UserInfo {
  username: string;
  displayName: string;
  role: "admin" | "manager" | "operator";
  assignedOutlets: {
    id: string;
    code: string;
    name: string;
    city: string;
  }[];
}

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Logged out successfully");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Logout failed. Please try again.");
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "AG";
    const parts = name.split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const roleLabel = user
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "User";

  const outletLabel =
    user?.role === "admin"
      ? "All Outlets (Consolidated)"
      : user?.assignedOutlets?.[0]?.code || "Assigned Outlet";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-card h-auto min-w-0 gap-2.5 rounded-xl py-1.5 pr-2 pl-1.5 sm:pr-3 border-border"
        >
          <span className="bg-primary/10 text-primary grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold">
            {getInitials(user?.displayName)}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-xs font-semibold">
              {user?.displayName || "Account"}
            </span>
            <span className="text-muted-foreground block truncate text-[11px] font-normal">
              {roleLabel}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground hidden sm:block h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel>
          <span className="block text-sm font-semibold">{user?.displayName || "Authenticated"}</span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal mt-0.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Role: <strong className="capitalize">{user?.role || "Staff"}</strong>
          </span>
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-normal mt-0.5">
            <Store className="h-3 w-3" />
            {outletLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
