import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  TrendingUp,
  HandCoins,
  Trash2,
  Users,
  GaugeCircle,
  FileBarChart2,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped sidebar navigation, adapted from the Lovable UI shell's
 * `NAV_GROUPS` (gulmohar-analytics-ui/src/components/app/app-shell.tsx).
 * Routes point at the existing Next.js App Router paths under
 * `/dashboard` — the route structure itself is unchanged.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Executive Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Sales Analytics", href: "/dashboard/sales", icon: TrendingUp },
      { label: "Profitability", href: "/dashboard/profitability", icon: HandCoins },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Wastage & Preparation", href: "/dashboard/wastage", icon: Trash2 },
      { label: "Manpower", href: "/dashboard/manpower", icon: Users },
      { label: "Breakage", href: "/dashboard/breakage", icon: GaugeCircle },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Reports", href: "/dashboard/reports", icon: FileBarChart2 }],
  },
];
