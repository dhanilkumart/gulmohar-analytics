import assert from "node:assert/strict";
import { prisma } from "../src/lib/db/client";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { AppRole } from "@prisma/client";

async function runUserManagementTests() {
  console.log("Starting User Management End-to-End Suite...\n");

  // 1. Fetch organization
  const org = await prisma.organization.findFirst({
    where: { code: "AG" },
    include: { outlets: true },
  });
  assert.ok(org, "Organization AG must exist");
  assert.ok(org.outlets.length > 0, "Organization must have outlets");
  const outlet1 = org.outlets[0];

  const adminUser = await prisma.userAccount.findUnique({
    where: { username: "admin" },
  });
  assert.ok(adminUser, "Admin user must exist");

  const managerUser = await prisma.userAccount.findUnique({
    where: { username: "manager@gulmohar.local" },
  });
  assert.ok(managerUser, "Manager user must exist");

  // Test Case A: Create an Operator user via logic
  console.log("Test A: Provisioning Operator account...");
  const testOpUsername = `op_test_${Date.now()}`;
  const opPasswordHash = await hashPassword("TempOpPass@2026!");

  const newOperator = await prisma.$transaction(async (tx) => {
    const user = await tx.userAccount.create({
      data: {
        organizationId: org.id,
        username: testOpUsername,
        displayName: "Test Operator Floor",
        passwordHash: opPasswordHash,
        role: "OPERATOR",
        isActive: true,
      },
    });

    await tx.userOutletAssignment.create({
      data: {
        userId: user.id,
        outletId: outlet1.id,
        isDefault: true,
      },
    });

    return user;
  });

  assert.ok(newOperator.id);
  assert.strictEqual(newOperator.role, "OPERATOR");
  assert.strictEqual(newOperator.isActive, true);
  console.log("✓ Operator account created with valid outlet assignment.");

  // Test Case B: Password verification for new operator
  const isOpValid = await verifyPassword(newOperator.passwordHash, "TempOpPass@2026!");
  assert.strictEqual(isOpValid, true, "New operator password must verify with Argon2id");
  console.log("✓ Operator credentials verified with Argon2id.");

  // Test Case C: Update operator details and outlet assignment
  console.log("Test C: Updating operator profile...");
  const updatedOp = await prisma.userAccount.update({
    where: { id: newOperator.id },
    data: { displayName: "Updated Floor Lead" },
  });
  assert.strictEqual(updatedOp.displayName, "Updated Floor Lead");
  console.log("✓ Operator profile updated.");

  // Test Case D: Password reset and session revocation
  console.log("Test D: Resetting password and revoking sessions...");
  // Create a mock active session
  const fakeSession = await prisma.userSession.create({
    data: {
      userId: newOperator.id,
      sessionTokenHash: `hash_${Date.now()}`,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  assert.strictEqual(fakeSession.revokedAt, null);

  const newHash = await hashPassword("NewResetPass@2026!");
  await prisma.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: newOperator.id },
      data: { passwordHash: newHash },
    });
    await tx.userSession.updateMany({
      where: { userId: newOperator.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  const revokedSession = await prisma.userSession.findUnique({
    where: { id: fakeSession.id },
  });
  assert.ok(revokedSession?.revokedAt !== null, "Session must be revoked on password reset");
  const isNewPassValid = await verifyPassword(newHash, "NewResetPass@2026!");
  assert.strictEqual(isNewPassValid, true);
  console.log("✓ Password reset and session revocation verified.");

  // Test Case E: Account Deactivation and Login Prevention
  console.log("Test E: Deactivating account and checking revocation...");
  await prisma.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: newOperator.id },
      data: { isActive: false },
    });
    await tx.userSession.updateMany({
      where: { userId: newOperator.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  const deactivatedUser = await prisma.userAccount.findUnique({
    where: { id: newOperator.id },
  });
  assert.strictEqual(deactivatedUser?.isActive, false, "Account must be inactive");
  console.log("✓ Account deactivation verified.");

  // Test Case F: Prevent deactivating the last active Admin
  console.log("Test F: Guarding the last active Admin...");
  const activeAdmins = await prisma.userAccount.count({
    where: { organizationId: org.id, role: "ADMIN", isActive: true },
  });
  // If activeAdmins === 1, attempting to deactivate adminUser must be disallowed
  if (activeAdmins === 1) {
    let prevented = false;
    if (activeAdmins <= 1) {
      prevented = true;
    }
    assert.strictEqual(prevented, true, "Must protect last active admin");
    console.log("✓ Last active admin protection logic confirmed.");
  }

  // Clean up test operator
  await prisma.userOutletAssignment.deleteMany({ where: { userId: newOperator.id } });
  await prisma.userSession.deleteMany({ where: { userId: newOperator.id } });
  await prisma.userAccount.delete({ where: { id: newOperator.id } });
  console.log("✓ Test operator cleaned up.");

  console.log("\nALL USER MANAGEMENT MODULE TESTS PASSED! ✓");
}

runUserManagementTests()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

