import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  Trash2,
  Users,
  Wrench,
  FileBarChart,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Sales", href: "/dashboard/sales", icon: ReceiptText },
  { label: "Profitability", href: "/dashboard/profitability", icon: TrendingUp },
  { label: "Wastage", href: "/dashboard/wastage", icon: Trash2 },
  { label: "Manpower", href: "/dashboard/manpower", icon: Users },
  { label: "Breakage", href: "/dashboard/breakage", icon: Wrench },
  { label: "Reports", href: "/dashboard/reports", icon: FileBarChart },
];
