"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type AttentionSeverity = "info" | "warning" | "danger";

/**
 * One management-attention item. This is the interface the real
 * analytics layer will eventually supply (e.g. from the approved
 * threshold-free insights — high-sales/low-margin products,
 * departments over benchmark headcount). Nothing here computes
 * analytics; it only defines the shape a caller must provide.
 */
export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  severity: AttentionSeverity;
  /** Existing app route this item should link to, e.g. "/dashboard/profitability". */
  href: string;
  time?: string;
  read?: boolean;
}

const severityDot: Record<AttentionSeverity, string> = {
  info: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Placeholder demo content only — presentational, not derived from any
 * analytics function. Replace via the `items` prop once the real
 * dashboard analytics can supply management-attention data.
 */
const DEFAULT_DEMO_ITEMS: AttentionItem[] = [
  {
    id: "demo-high-sales-low-margin",
    title: "High Sales / Low Margin",
    description: "Products matching this classification will appear here.",
    severity: "warning",
    href: "/dashboard/profitability",
    time: "Today",
    read: false,
  },
  {
    id: "demo-wastage",
    title: "Wastage Attention",
    description: "Highest tracked wastage cost items will appear here.",
    severity: "danger",
    href: "/dashboard/wastage",
    time: "Today",
    read: false,
  },
  {
    id: "demo-manpower",
    title: "Manpower",
    description: "Departments above benchmark headcount will appear here.",
    severity: "info",
    href: "/dashboard/manpower",
    time: "Yesterday",
    read: true,
  },
];

/**
 * Notification / management-attention control. Adapted from the Lovable
 * UI shell's `NotificationMenu`, ported as a UI-only shell for now: it
 * accepts `items` so a later step can pass real analytics-derived
 * attention items without changing this component. Defaults to
 * presentational demo content (not analytics-derived) so the shell has
 * something to show today.
 */
export function NotificationCenter({ items: initialItems = DEFAULT_DEMO_ITEMS }: { items?: AttentionItem[] }) {
  const [items, setItems] = useState(initialItems);
  const unreadCount = items.filter((item) => !item.read).length;

  const markAllRead = () => setItems((current) => current.map((item) => ({ ...item, read: true })));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`${unreadCount} unread attention items`}
          className="bg-card relative rounded-xl"
        >
          <Bell />
          {unreadCount > 0 ? (
            <span className="bg-danger text-danger-foreground absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold">
              {unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-xl p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Management attention</p>
            <p className="text-muted-foreground text-xs">Representative dashboard signals</p>
          </div>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Mark read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-xs">
              No attention items right now.
            </p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                asChild
                className={cn("items-start rounded-lg p-3", !item.read && "bg-primary-soft/60")}
              >
                <Link
                  href={item.href}
                  onClick={() =>
                    setItems((current) =>
                      current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry))
                    )
                  }
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", severityDot[item.severity])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{item.title}</span>
                      {item.time ? (
                        <span className="text-muted-foreground text-[10px]">{item.time}</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                      {item.description}
                    </span>
                    <span className="text-primary mt-1.5 block text-xs font-semibold">View details</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
