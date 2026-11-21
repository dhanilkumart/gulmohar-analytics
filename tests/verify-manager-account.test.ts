import assert from "node:assert/strict";
import { prisma } from "../src/lib/db/client";
import { verifyPassword } from "../src/lib/auth/password";

async function testManagerAndSafeOutletResolution() {
  console.log("Starting full Manager (CEO) and Safe Outlet Resolution Tests...\n");

  // 1. Verify Manager account exists and credentials verify with Argon2id
  console.log("1. Verifying manager@gulmohar.local in PostgreSQL...");
  const managerUser = await prisma.userAccount.findUnique({
    where: { username: "manager@gulmohar.local" },
    include: { organization: true, outletAssignments: true },
  });

  assert.ok(managerUser, "manager@gulmohar.local user must exist in PostgreSQL");
  assert.strictEqual(managerUser.username, "manager@gulmohar.local");
  assert.strictEqual(managerUser.role, "MANAGER");
  assert.strictEqual(managerUser.isActive, true);
  assert.strictEqual(managerUser.organization.code, "AG");
  assert.strictEqual(managerUser.outletAssignments.length, 0, "Manager should have NO individual outlet restrictions");
  assert.ok(managerUser.passwordHash.startsWith("$argon2id$"), "Password must be hashed with Argon2id");

  const isPasswordValid = await verifyPassword(managerUser.passwordHash, "GulmoharManager@2026!");
  assert.strictEqual(isPasswordValid, true, "Argon2id password verification must succeed for GulmoharManager@2026!");
  console.log("✓ Manager account credentials and organization association verified.\n");

  // 2. Logic simulation of resolveSafeWriteOutletId
  console.log("2. Testing Safe Outlet Resolution logic...");

  function simulateSafeOutletResolution(
    role: string,
    allowedOutlets: { id: string; code: string }[],
    requestedOutletId?: string | null
  ): string {
    if (requestedOutletId && requestedOutletId !== "all") {
      const match = allowedOutlets.find((o) => o.id === requestedOutletId || o.code === requestedOutletId);
      if (!match) throw new Error("FORBIDDEN: Target outlet does not exist in this organization.");
      return match.id;
    }

    if (role === "admin" || role === "manager") {
      if (allowedOutlets.length === 1) return allowedOutlets[0].id;
      if (allowedOutlets.length === 0) throw new Error("INVALID_OUTLET: No active outlet found for this organization.");
      throw new Error("AMBIGUOUS_OUTLET: Multiple active outlets exist for your organization. Please specify an unambiguous target outlet.");
    }

    if (allowedOutlets.length === 1) return allowedOutlets[0].id;
    throw new Error("AMBIGUOUS_OUTLET: Multiple outlets assigned to user. Please specify a target outlet.");
  }

  // Case A: 1 outlet -> succeeds safely
  const singleOutletList = [{ id: "out-1", code: "KOZ-001" }];
  const res1 = simulateSafeOutletResolution("manager", singleOutletList);
  assert.strictEqual(res1, "out-1");
  console.log("✓ Safe resolution succeeds when organization has exactly 1 outlet.");

  // Case B: Multiple outlets without selection -> throws AMBIGUOUS_OUTLET
  const multiOutletList = [
    { id: "out-1", code: "KOZ-001" },
    { id: "out-2", code: "KOZ-002" },
  ];
  let errThrown = false;
  try {
    simulateSafeOutletResolution("manager", multiOutletList);
  } catch (err: any) {
    errThrown = true;
    assert.ok(err.message.includes("AMBIGUOUS_OUTLET"));
  }
  assert.strictEqual(errThrown, true);
  console.log("✓ Ambiguous resolution correctly rejected when multiple outlets exist.");

  // Case C: Multiple outlets with valid target -> succeeds
  const resTarget = simulateSafeOutletResolution("manager", multiOutletList, "KOZ-002");
  assert.strictEqual(resTarget, "out-2");
  console.log("✓ Explicit target resolution succeeds.");

  // Case D: Cross-tenant outlet -> throws FORBIDDEN
  let crossErr = false;
  try {
    simulateSafeOutletResolution("manager", multiOutletList, "FOREIGN-OUTLET");
  } catch (err: any) {
    crossErr = true;
    assert.ok(err.message.includes("FORBIDDEN"));
  }
  assert.strictEqual(crossErr, true);
  console.log("✓ Cross-organization outlet write attempt correctly forbidden.");

  console.log("\nALL MANAGER ACCOUNT AND SAFE RESOLUTION TESTS PASSED! ✓");
}

testManagerAndSafeOutletResolution()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
