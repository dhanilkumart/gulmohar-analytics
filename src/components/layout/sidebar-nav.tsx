"use client";

import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav-items";
import { NavLink } from "./nav-link";

/**
 * Filter navigation groups based on the user's active role.
 *
 * Rules:
 * - Admin: Full navigation (Main, Operations, Reports).
 * - Manager: Operations only (Wastage & Preparation, Breakage).
 * - Operator: Dedicated Operator Portal only.
 */
export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const [role, setRole] = useState<string>("admin");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data.user?.role) {
          setRole(data.user.role);
        }
      })
      .catch(() => {});
  }, []);

  // Filter groups according to role
  const visibleGroups = NAV_GROUPS.map((group) => {
    if (role === "admin") return group;

    if (role === "manager") {
      if (group.label === "Operations") {
        return {
          ...group,
          // Manager can access wastage and breakage only (no manpower)
          items: group.items.filter(
            (item) => item.href === "/dashboard/wastage" || item.href === "/dashboard/breakage"
          ),
        };
      }
      return null;
    }

    if (role === "operator") {
      // Operator portal handled on dedicated screen
      return null;
    }

    return null;
  }).filter(Boolean) as typeof NAV_GROUPS;

  return (
    <nav className="flex flex-col gap-6 px-2">
      {visibleGroups.map((group) => (
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
