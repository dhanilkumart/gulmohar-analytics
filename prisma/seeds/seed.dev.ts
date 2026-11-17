import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

// 1. Production safety guard
if (process.env.NODE_ENV === "production") {
  console.error("FATAL: Development seed script cannot run in production (NODE_ENV=production).");
  process.exit(1);
}

// 2. Strict environment variable requirements: no fallback passwords allowed
const adminPassword = process.env.DEV_ADMIN_PASSWORD;
const managerPassword = process.env.DEV_MANAGER_PASSWORD;
const operatorPassword = process.env.DEV_OPERATOR_PASSWORD;

if (!adminPassword || !managerPassword || !operatorPassword) {
  console.error("FATAL: Missing required development account passwords.");
  console.error("The following environment variables must be explicitly defined:");
  console.error("  - DEV_ADMIN_PASSWORD");
  console.error("  - DEV_MANAGER_PASSWORD");
  console.error("  - DEV_OPERATOR_PASSWORD");
  console.error("Fallback passwords have been permanently removed for security.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: 2, // argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function main() {
  console.log("🌱 Starting development seed for Ashirvad Gulmohar...");

  // 1. Create or ensure Root Organization
  const org = await prisma.organization.upsert({
    where: { code: "AG" },
    update: {},
    create: {
      code: "AG",
      name: "Ashirvad Gulmohar Restaurant",
    },
  });
  console.log(`✅ Organization ready: ${org.name} (${org.code})`);

  // 2. Create Outlets (KOZ-001 primary, KOZ-002 development test outlet)
  const outletKoz1 = await prisma.outlet.upsert({
    where: { code: "KOZ-001" },
    update: {},
    create: {
      organizationId: org.id,
      code: "KOZ-001",
      name: "Ashirvad Gulmohar - Kozhikode 1",
      city: "Kozhikode",
      address: "Mavoor Road, Kozhikode, Kerala",
      isActive: true,
    },
  });

  const outletKoz2 = await prisma.outlet.upsert({
    where: { code: "KOZ-002" },
    update: {},
    create: {
      organizationId: org.id,
      code: "KOZ-002",
      name: "Ashirvad Gulmohar - Kozhikode 2",
      city: "Kozhikode",
      address: "Palayam, Kozhikode, Kerala",
      isActive: true,
    },
  });
  console.log(`✅ Outlets ready: ${outletKoz1.code}, ${outletKoz2.code}`);

  // 3. Create Departments for KOZ-001
  const kitchenDept = await prisma.department.upsert({
    where: {
      outletId_departmentCode: {
        outletId: outletKoz1.id,
        departmentCode: "D01",
      },
    },
    update: {},
    create: {
      outletId: outletKoz1.id,
      departmentCode: "D01",
      name: "Kitchen",
      benchmarkHeadcount: 16,
    },
  });

  const serviceDept = await prisma.department.upsert({
    where: {
      outletId_departmentCode: {
        outletId: outletKoz1.id,
        departmentCode: "D02",
      },
    },
    update: {},
    create: {
      outletId: outletKoz1.id,
      departmentCode: "D02",
      name: "Service",
      benchmarkHeadcount: 18,
    },
  });
  console.log(`✅ Departments ready for ${outletKoz1.code}: ${kitchenDept.name}, ${serviceDept.name}`);

  // 4. Create Development Test Accounts with Argon2id Password Hashing
  const adminHash = await hashPassword(adminPassword!);
  const managerHash = await hashPassword(managerPassword!);
  const operatorHash = await hashPassword(operatorPassword!);

  // A. Admin Account (Organization-wide access)
  await prisma.userAccount.upsert({
    where: { username: "admin" },
    update: { passwordHash: adminHash, role: "ADMIN", isActive: true },
    create: {
      organizationId: org.id,
      username: "admin",
      displayName: "Ramesh Varma (Admin)",
      passwordHash: adminHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  // B. Manager Account (Assigned to KOZ-001 and KOZ-002)
  const managerUser = await prisma.userAccount.upsert({
    where: { username: "manager" },
    update: { passwordHash: managerHash, role: "MANAGER", isActive: true },
    create: {
      organizationId: org.id,
      username: "manager",
      displayName: "Suresh Menon (Manager)",
      passwordHash: managerHash,
      role: "MANAGER",
      isActive: true,
    },
  });

  // Manager Outlet Assignments
  await prisma.userOutletAssignment.upsert({
    where: {
      userId_outletId: {
        userId: managerUser.id,
        outletId: outletKoz1.id,
      },
    },
    update: { isDefault: true },
    create: {
      userId: managerUser.id,
      outletId: outletKoz1.id,
      isDefault: true,
    },
  });

  await prisma.userOutletAssignment.upsert({
    where: {
      userId_outletId: {
        userId: managerUser.id,
        outletId: outletKoz2.id,
      },
    },
    update: { isDefault: false },
    create: {
      userId: managerUser.id,
      outletId: outletKoz2.id,
      isDefault: false,
    },
  });

  // C. Operator Account (Assigned strictly to KOZ-001)
  const operatorUser = await prisma.userAccount.upsert({
    where: { username: "operator" },
    update: { passwordHash: operatorHash, role: "OPERATOR", isActive: true },
    create: {
      organizationId: org.id,
      username: "operator",
      displayName: "Kozhikode Floor Terminal",
      passwordHash: operatorHash,
      role: "OPERATOR",
      isActive: true,
    },
  });

  await prisma.userOutletAssignment.upsert({
    where: {
      userId_outletId: {
        userId: operatorUser.id,
        outletId: outletKoz1.id,
      },
    },
    update: { isDefault: true },
    create: {
      userId: operatorUser.id,
      outletId: outletKoz1.id,
      isDefault: true,
    },
  });

  console.log("✅ Development test accounts ready:");
  console.log("   - admin    (Role: ADMIN, Scope: Organization-wide)");
  console.log("   - manager  (Role: MANAGER, Scope: KOZ-001 [Default], KOZ-002)");
  console.log("   - operator (Role: OPERATOR, Scope: KOZ-001 only)");
  console.log("🌱 Development seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
