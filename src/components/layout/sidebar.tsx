"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-2">
      <span className="bg-primary text-primary-foreground grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
        <span className="font-display text-sm font-bold">AG</span>
      </span>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="font-display truncate text-sm leading-4 font-extrabold">
            ASHIRVAD
            <br />
            GULMOHAR
          </p>
          <p className="text-muted-foreground mt-1 truncate text-[11px]">
            Restaurant Analytics
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sidebar content — brand, collapse toggle, nav, and a footer note about
 * data coverage. Rendered both inside the desktop `<aside>` and inside the
 * mobile nav `Sheet` (see AppShell), so it takes no opinion on its own
 * container/positioning.
 */
export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 py-5">
      <div className="flex items-center justify-between gap-2 px-2">
        <Brand collapsed={collapsed} />
        {onToggle ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label="Toggle sidebar"
            className="hover:bg-sidebar-accent hover:text-foreground text-muted-foreground hidden h-8 w-8 shrink-0 rounded-lg lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      {!collapsed ? (
        <div className="bg-secondary mx-4 rounded-2xl p-4">
          <p className="text-xs font-semibold">Data coverage</p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            Preparation and wastage analytics cover tracked preparation items only. One year of
            history is available.
          </p>
        </div>
      ) : null}
    </div>
  );
}
