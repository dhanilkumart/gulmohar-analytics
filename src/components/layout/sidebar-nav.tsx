"use client";

import { NAV_ITEMS } from "./nav-items";
import { NavLink } from "./nav-link";

/** The actual nav-item list, shared between the desktop sidebar and the mobile drawer. */
export function SidebarNav() {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </nav>
  );
}
