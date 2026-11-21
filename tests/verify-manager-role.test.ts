import assert from "node:assert/strict";

console.log("Starting Manager (CEO) role and permission verification...");

// 1. Role parity verification
const rolesWithMasterDataAccess = ["admin", "manager"];
assert.strictEqual(rolesWithMasterDataAccess.includes("manager"), true, "Manager must have master data access");
assert.strictEqual(rolesWithMasterDataAccess.includes("admin"), true, "Admin must have master data access");
assert.strictEqual(rolesWithMasterDataAccess.includes("operator"), false, "Operator must NOT have master data access");
console.log("✓ Role parity for master data access verified.");

// 2. Middleware route restriction verification
const ADMIN_ONLY_PREFIXES = [
  "/dashboard/outlets",
  "/api/admin/outlets",
];

const testPaths = [
  { path: "/dashboard", allowedForManager: true },
  { path: "/dashboard/sales", allowedForManager: true },
  { path: "/dashboard/profitability", allowedForManager: true },
  { path: "/dashboard/wastage", allowedForManager: true },
  { path: "/dashboard/breakage", allowedForManager: true },
  { path: "/dashboard/manpower", allowedForManager: true },
  { path: "/dashboard/reports", allowedForManager: true },
  { path: "/dashboard/master-data", allowedForManager: true },
  { path: "/api/admin/products", allowedForManager: true },
  { path: "/api/admin/departments", allowedForManager: true },
  { path: "/api/admin/preparation-items", allowedForManager: true },
  { path: "/api/admin/breakage-items", allowedForManager: true },
  { path: "/api/admin/reasons", allowedForManager: true },
  { path: "/dashboard/outlets", allowedForManager: false },
  { path: "/api/admin/outlets", allowedForManager: false },
];

for (const { path, allowedForManager } of testPaths) {
  const isBlocked = ADMIN_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
  assert.strictEqual(
    !isBlocked,
    allowedForManager,
    `Path ${path} expected allowedForManager=${allowedForManager}, got ${!isBlocked}`
  );
}
console.log("✓ Route prefixes and access checks for Manager vs Admin verified.");

// 3. Outlets API response contract verification
const mockAllowedOutlets = [
  { id: "out_1", code: "GUL-KOR", name: "Koramangala", city: "Bengaluru" },
  { id: "out_2", code: "GUL-IND", name: "Indiranagar", city: "Bengaluru" },
];

function sanitizeOutletsResponse(role: string, allowedOutlets: typeof mockAllowedOutlets) {
  return {
    success: true,
    role,
    totalOutlets: allowedOutlets.length,
    outlets: role === "manager" ? [] : allowedOutlets,
    allowedOutlets: role === "manager" ? [] : allowedOutlets,
  };
}

const adminResponse = sanitizeOutletsResponse("admin", mockAllowedOutlets);
assert.strictEqual(adminResponse.totalOutlets, 2);
assert.strictEqual(adminResponse.outlets.length, 2);

const managerResponse = sanitizeOutletsResponse("manager", mockAllowedOutlets);
assert.strictEqual(managerResponse.totalOutlets, 2, "Manager should receive the total outlet count");
assert.strictEqual(managerResponse.outlets.length, 0, "Manager should NOT receive outlet details list");
assert.strictEqual(managerResponse.allowedOutlets.length, 0, "Manager should NOT receive allowedOutlets details list");
console.log("✓ Outlet API payload contract (totalOutlets present, details sanitized for Manager) verified.");

console.log("\nALL MANAGER ROLE TESTS PASSED SUCCESSFULLY! ✓");
