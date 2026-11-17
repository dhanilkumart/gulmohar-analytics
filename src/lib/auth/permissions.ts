export type AppRole = "admin" | "manager" | "operator";

export type AppModule =
  | "executive_dashboard"
  | "sales_analytics"
  | "profitability"
  | "manpower"
  | "reports"
  | "wastage_dashboard"
  | "wastage_entry"
  | "wastage_manage" // edit/delete
  | "breakage_dashboard"
  | "breakage_entry"
  | "breakage_manage" // edit/delete
  | "staff_management"
  | "user_management"
  | "operator_portal";

const ROLE_PERMISSIONS: Record<AppRole, Set<AppModule>> = {
  admin: new Set<AppModule>([
    "executive_dashboard",
    "sales_analytics",
    "profitability",
    "manpower",
    "reports",
    "wastage_dashboard",
    "wastage_entry",
    "wastage_manage",
    "breakage_dashboard",
    "breakage_entry",
    "breakage_manage",
    "staff_management",
    "user_management",
    "operator_portal",
  ]),
  manager: new Set<AppModule>([
    "wastage_dashboard",
    "wastage_entry",
    "wastage_manage",
    "breakage_dashboard",
    "breakage_entry",
    "breakage_manage",
    "operator_portal",
  ]),
  operator: new Set<AppModule>([
    "wastage_entry",
    "breakage_entry",
    "operator_portal",
  ]),
};

/**
 * Checks if a given role has permission to access a specific application module.
 */
export function hasPermission(role: AppRole, module: AppModule): boolean {
  return ROLE_PERMISSIONS[role]?.has(module) ?? false;
}

/**
 * Validates permission, throwing an Error if unauthorized.
 */
export function requirePermission(role: AppRole, module: AppModule): void {
  if (!hasPermission(role, module)) {
    throw new Error(`FORBIDDEN: Role '${role}' lacks permission for '${module}'.`);
  }
}
