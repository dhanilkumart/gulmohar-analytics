"use client";

import { NAV_GROUPS } from "./nav-items";
import { NavLink } from "./nav-link";

/**
 * The grouped nav-item list, shared between the desktop sidebar and the
 * mobile drawer. Active state is resolved per-link from the Next.js
 * pathname (see NavLink) — no client-side routing library involved.
 */
export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-6 px-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed ? (
            <p className="text-muted-foreground mb-2 px-3 text-[10px] font-semibold tracking-widest uppercase">
              {group.label}
            </p>
          ) : (
            <div className="bg-sidebar-border mx-3 mb-2 h-px" />
          )}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
