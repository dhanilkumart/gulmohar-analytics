export interface DashboardRouteMeta {
  title: string;
  description: string;
}

export const DASHBOARD_ROUTES_META: Record<string, DashboardRouteMeta> = {
  "/orders": {
    title: "Orders",
    description: "Database orders and read-only Petpooja response inspection",
  },
  "/dashboard": {
    title: "Executive Dashboard",
    description: "Restaurant performance overview and management analytics",
  },
  "/dashboard/sales": {
    title: "Sales Analytics",
    description: "Understand restaurant revenue and order behaviour",
  },
  "/dashboard/profitability": {
    title: "Profitability",
    description: "Product margins based on product-level food cost",
  },
  "/dashboard/wastage": {
    title: "Wastage & Preparation",
    description: "Track kitchen batch preparation, validate available stock, and analyze operational food waste",
  },
  "/dashboard/manpower": {
    title: "Manpower",
    description: "Attendance, department headcount vs. benchmark, and labor-cost estimates.",
  },
  "/dashboard/breakage": {
    title: "Breakage",
    description: "Manual breakage cost by item, reason and department.",
  },
  "/dashboard/reports": {
    title: "Reports",
    description: "Consolidated management report — sales, profitability, wastage, breakage and attendance for the selected period.",
  },
  "/dashboard/master-data": {
    title: "Master Data Management",
    description: "Admin Master Data Management for Departments, Products, Ingredients, Recipes, Breakage Items, and Reasons",
  },
  "/dashboard/users": {
    title: "User Management",
    description: "Manage application accounts, system roles, and outlet floor access for your organization.",
  },
  "/dashboard/documentation": {
    title: "User Documentation",
    description: "Standard Operating Procedures and User Guide for Wastage & Preparation.",
  },
};

export function getDashboardRouteMeta(pathname: string): DashboardRouteMeta {
  // Direct match
  if (DASHBOARD_ROUTES_META[pathname]) {
    return DASHBOARD_ROUTES_META[pathname];
  }

  // Prefix match (for nested subroutes if any)
  for (const [route, meta] of Object.entries(DASHBOARD_ROUTES_META)) {
    if (route !== "/dashboard" && pathname.startsWith(route)) {
      return meta;
    }
  }

  return {
    title: "Dashboard",
    description: "Gulmohar Restaurant Analytics & Operations Management",
  };
}

