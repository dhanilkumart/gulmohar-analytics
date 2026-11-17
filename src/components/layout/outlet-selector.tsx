"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Store, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OutletOption {
  id: string;
  code: string;
  name: string;
  city: string;
}

interface OutletsData {
  role: "admin" | "manager" | "operator";
  activeOutletId: string;
  isConsolidated: boolean;
  allowedOutlets: OutletOption[];
}

export function OutletSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<OutletsData | null>(null);
  const [loading, setLoading] = useState(true);

  const currentOutletParam = searchParams.get("outletId");

  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const query = currentOutletParam ? `?outletId=${encodeURIComponent(currentOutletParam)}` : "";
        const res = await fetch(`/api/dashboard/outlets${query}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load outlet scope:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOutlets();
  }, [currentOutletParam]);

  if (loading || !data || data.role === "operator" || data.allowedOutlets.length === 0) {
    return null;
  }

  // If Manager has only one outlet, show informative static badge without dropdown
  if (data.role === "manager" && data.allowedOutlets.length === 1) {
    const single = data.allowedOutlets[0];
    return (
      <div className="bg-card text-muted-foreground hidden items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs font-medium sm:flex">
        <Store className="h-3.5 w-3.5 text-primary" />
        <span>{single.code} ({single.name})</span>
      </div>
    );
  }

  // Handle switching
  const handleSelect = (outletId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (outletId === "all") {
      params.delete("outletId");
    } else {
      params.set("outletId", outletId);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // Find active label
  let activeLabel = "All Outlets (Consolidated)";
  if (currentOutletParam && currentOutletParam !== "all") {
    const matched = data.allowedOutlets.find(
      (o) => o.id === currentOutletParam || o.code === currentOutletParam
    );
    if (matched) {
      activeLabel = `${matched.code} (${matched.name})`;
    }
  } else if (data.role === "manager") {
    const first = data.allowedOutlets[0];
    activeLabel = `${first.code} (${first.name})`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-card h-9 gap-2 rounded-xl border-border px-3 text-xs font-semibold"
        >
          <Store className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[150px] truncate sm:max-w-[180px]">{activeLabel}</span>
          <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuLabel className="text-xs">Select Outlet Scope</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Admin only option for consolidated all outlets */}
        {data.role === "admin" && (
          <DropdownMenuItem
            className="flex items-center justify-between text-xs cursor-pointer"
            onClick={() => handleSelect("all")}
          >
            <span>All Outlets (Consolidated)</span>
            {(!currentOutletParam || currentOutletParam === "all") && (
              <Check className="h-3.5 w-3.5 text-primary" />
            )}
          </DropdownMenuItem>
        )}

        {data.allowedOutlets.map((outlet) => {
          const isSelected =
            currentOutletParam === outlet.id ||
            currentOutletParam === outlet.code ||
            (data.role === "manager" && !currentOutletParam && outlet.id === data.allowedOutlets[0].id);

          return (
            <DropdownMenuItem
              key={outlet.id}
              className="flex items-center justify-between text-xs cursor-pointer"
              onClick={() => handleSelect(outlet.id)}
            >
              <div className="flex flex-col">
                <span className="font-medium">{outlet.code} — {outlet.name}</span>
                <span className="text-muted-foreground text-[10px]">{outlet.city}</span>
              </div>
              {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
