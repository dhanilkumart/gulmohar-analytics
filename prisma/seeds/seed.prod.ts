/**
 * Production Database Bootstrap Script for Gulmohar Analytics
 *
 * PROVISIONING SCOPE:
 * 1. Root Organization: "Ashirvad Gulmohar" (code: "AG")
 * 2. Primary Production Outlet: "Ashirvad Gulmohar - Kozhikode 1" (code: "KOZ-001", petpooja_rest_id: "9780nusx")
 *    - EXCLUSIVITY: KOZ-002 is strictly a development/testing outlet and is NEVER created here.
 * 3. Initial Core Operational Departments for KOZ-001:
 *    - D01: Kitchen (benchmarkHeadcount: 16)
 *    - D02: Service (benchmarkHeadcount: 18)
 * 4. Initial Production Administrator Account:
 *    - Username: "admin" (or PROD_ADMIN_USERNAME if customized)
 *    - Role: ADMIN
 *    - Password: Read strictly from PROD_ADMIN_PASSWORD environment variable, hashed with Argon2id.
 *    - IDEMPOTENCY: If the admin user already exists, its password is NEVER overwritten.
 * 5. Admin Outlet Assignment: Maps admin to KOZ-001 with isDefault: true.
 *
 * SAFETY GUARDS:
 * - Refuses execution if PROD_ADMIN_PASSWORD is empty or shorter than 12 characters.
 * - Validates DATABASE_URL presence without logging it.
 * - Validates that no dev accounts or mock fixtures are created.
 * - Executes in an atomic Prisma transaction.
 *
 * USAGE:
 *   PROD_ADMIN_PASSWORD="<secure-high-entropy-password>" npx tsx prisma/seeds/seed.prod.ts
 *   or via package.json:
 *   npm run db:bootstrap
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

// -----------------------------------------------------------------------------
// 1. Environment Loading (Safe fallback if .env not pre-exported in VPS shell)
// -----------------------------------------------------------------------------
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

// Strictly load .env.production. Never load development .env files.
const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (fs.existsSync(prodEnvPath)) {
  loadEnvFile(prodEnvPath);
}

// Strictly allowlisted production database names and hostnames
export const ALLOWED_PROD_DATABASES = ["gulmohar_analytics"];
export const ALLOWED_PROD_HOSTS = ["shared-postgres", "127.0.0.1", "localhost"];

export function validateProductionBootstrapConfig() {
  const adminPassword = process.env.PROD_ADMIN_PASSWORD?.trim();
  const adminUsername = (process.env.PROD_ADMIN_USERNAME || "admin").trim();
  const adminDisplayName = (process.env.PROD_ADMIN_NAME || "Administrator").trim();
  const confirmTarget = process.env.CONFIRM_PRODUCTION_BOOTSTRAP?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim();

  // 1. Explicit production target confirmation guard
  if (confirmTarget !== "YES") {
    throw new Error(
      "Safety guard: CONFIRM_PRODUCTION_BOOTSTRAP must be explicitly set to 'YES' to initialize the production database."
    );
  }

  // 2. Admin password validation
  if (!adminPassword) {
    throw new Error(
      "Missing required environment variable: PROD_ADMIN_PASSWORD. A secure, high-entropy password must be provided."
    );
  }

  if (adminPassword.length < 12) {
    throw new Error("PROD_ADMIN_PASSWORD must be at least 12 characters long for production security.");
  }

  // 3. Database URL validation & explicit allowlist check
  if (!dbUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  // Parse database name and hostname safely without logging connection string credentials
  let targetDbName = "";
  let targetHostname = "";
  try {
    const parsed = new URL(dbUrl);
    targetHostname = parsed.hostname.trim().toLowerCase();
    targetDbName = parsed.pathname.replace(/^\//, "").split("?")[0].trim();
  } catch {
    const match = dbUrl.match(/@([^:/]+)(?::\d+)?\/([a-zA-Z0-9_-]+)(?:\?|$)/);
    if (match) {
      targetHostname = match[1].trim().toLowerCase();
      targetDbName = match[2].trim();
    }
  }

  if (!targetDbName) {
    throw new Error("Safety guard: Unable to extract target database name from DATABASE_URL.");
  }

  // Strictly verify database name against explicit allowlist
  if (!ALLOWED_PROD_DATABASES.includes(targetDbName)) {
    throw new Error(
      `Safety guard: Target database '${targetDbName}' is not in the production allowlist [${ALLOWED_PROD_DATABASES.join(
        ", "
      )}]. Production bootstrap refused.`
    );
  }

  // Validate hostname against allowed production hosts (shared-postgres or localhost/127.0.0.1 tunnel)
  if (targetHostname && !ALLOWED_PROD_HOSTS.includes(targetHostname)) {
    throw new Error(
      `Safety guard: Target host '${targetHostname}' is not in the production host allowlist [${ALLOWED_PROD_HOSTS.join(
        ", "
      )}]. Production bootstrap refused.`
    );
  }

  // Refuse execution if target is obviously a local development/test database or contains dev indicators
  const lowerUrl = dbUrl.toLowerCase();
  if (
    lowerUrl.includes("gulmohar_dev") ||
    lowerUrl.includes("gulmohar_test") ||
    lowerUrl.includes("dev_user") ||
    lowerUrl.includes(":5432/gulmohar_dev")
  ) {
    throw new Error(
      "Safety guard: Target DATABASE_URL appears to be a development/test database. Production bootstrap refused."
    );
  }

  return {
    adminPassword,
    adminUsername,
    adminDisplayName,
    targetDbName,
  };
}

// -----------------------------------------------------------------------------
// 2. Production Constants
// -----------------------------------------------------------------------------
const PROD_ORG_CODE = "AG";
const PROD_ORG_NAME = "Ashirvad Gulmohar";

const PROD_OUTLET_CODE = "KOZ-001";
const PROD_OUTLET_NAME = "Ashirvad Gulmohar - Kozhikode 1";
const PROD_OUTLET_CITY = "Kozhikode";
const PROD_OUTLET_ADDRESS = "Mavoor Road, Kozhikode, Kerala";
const PROD_OUTLET_PETPOOJA_ID = "9780nusx";

const INITIAL_DEPARTMENTS = [
  { code: "D01", name: "Kitchen", benchmarkHeadcount: 16 },
  { code: "D02", name: "Service", benchmarkHeadcount: 18 },
];

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: 2, // argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

// -----------------------------------------------------------------------------
// 3. Main Bootstrap Procedure (Atomic Transaction)
// -----------------------------------------------------------------------------
export async function bootstrapProductionDatabase(client: PrismaClient = prisma) {
  const { adminPassword, adminUsername, adminDisplayName } = validateProductionBootstrapConfig();

  console.log("==================================================================");
  console.log("🚀 GULMOHAR ANALYTICS — PRODUCTION DATABASE BOOTSTRAP");
  console.log("==================================================================");

  return await client.$transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // Step 1: Root Organization
    // -------------------------------------------------------------------------
    console.log(`\n[1/4] Ensuring Organization '${PROD_ORG_CODE}'...`);
    const org = await tx.organization.upsert({
      where: { code: PROD_ORG_CODE },
      update: {
        name: PROD_ORG_NAME,
      },
      create: {
        code: PROD_ORG_CODE,
        name: PROD_ORG_NAME,
      },
    });
    console.log(`  ✅ Organization ready: ${org.name} (${org.code}) [ID: ${org.id}]`);

    // -------------------------------------------------------------------------
    // Step 2: Production Outlet (Strictly KOZ-001 only)
    // -------------------------------------------------------------------------
    console.log(`\n[2/4] Ensuring Production Outlet '${PROD_OUTLET_CODE}'...`);

    // Verify no conflicting outlet has petpoojaRestId = 9780nusx
    const conflictingOutlet = await tx.outlet.findFirst({
      where: {
        petpoojaRestId: PROD_OUTLET_PETPOOJA_ID,
        code: { not: PROD_OUTLET_CODE },
      },
      select: { code: true, name: true },
    });

    if (conflictingOutlet) {
      throw new Error(
        `Database conflict: Petpooja Restaurant ID '${PROD_OUTLET_PETPOOJA_ID}' is already assigned to another outlet: '${conflictingOutlet.code}' (${conflictingOutlet.name}). Aborting bootstrap.`
      );
    }

    const outlet = await tx.outlet.upsert({
      where: { code: PROD_OUTLET_CODE },
      update: {
        name: PROD_OUTLET_NAME,
        city: PROD_OUTLET_CITY,
        address: PROD_OUTLET_ADDRESS,
        petpoojaRestId: PROD_OUTLET_PETPOOJA_ID,
        isActive: true,
      },
      create: {
        organizationId: org.id,
        code: PROD_OUTLET_CODE,
        name: PROD_OUTLET_NAME,
        city: PROD_OUTLET_CITY,
        address: PROD_OUTLET_ADDRESS,
        timezone: "Asia/Kolkata",
        petpoojaRestId: PROD_OUTLET_PETPOOJA_ID,
        isActive: true,
      },
    });
    console.log(`  ✅ Outlet ready: ${outlet.name} (${outlet.code}) [Petpooja restID: ${outlet.petpoojaRestId}]`);

    // -------------------------------------------------------------------------
    // Step 3: Core Operating Departments for KOZ-001
    // -------------------------------------------------------------------------
    console.log(`\n[3/4] Ensuring Core Departments for '${outlet.code}'...`);
    for (const deptDef of INITIAL_DEPARTMENTS) {
      const dept = await tx.department.upsert({
        where: {
          outletId_departmentCode: {
            outletId: outlet.id,
            departmentCode: deptDef.code,
          },
        },
        update: {
          name: deptDef.name,
          benchmarkHeadcount: deptDef.benchmarkHeadcount,
        },
        create: {
          outletId: outlet.id,
          departmentCode: deptDef.code,
          name: deptDef.name,
          benchmarkHeadcount: deptDef.benchmarkHeadcount,
        },
      });
      console.log(`  ✅ Department ready: ${dept.departmentCode} — ${dept.name} (Benchmark: ${dept.benchmarkHeadcount})`);
    }

    // -------------------------------------------------------------------------
    // Step 4: Initial Administrator Account
    // -------------------------------------------------------------------------
    console.log(`\n[4/4] Ensuring Initial Administrator Account ('${adminUsername}')...`);
    const existingAdmin = await tx.userAccount.findUnique({
      where: { username: adminUsername },
      select: { id: true, username: true, role: true, isActive: true },
    });

    let adminUserId: string;

    if (existingAdmin) {
      adminUserId = existingAdmin.id;
      // NEVER overwrite password on subsequent runs
      console.log(`  ℹ️ Admin user '${adminUsername}' already exists. Preserving existing password hash and credentials.`);
      await tx.userAccount.update({
        where: { id: existingAdmin.id },
        data: {
          isActive: true,
          role: "ADMIN",
        },
      });
    } else {
      console.log(`  🔑 Provisioning new Admin account '${adminUsername}' with Argon2id hash...`);
      const passwordHash = await hashPassword(adminPassword);
      const newAdmin = await tx.userAccount.create({
        data: {
          organizationId: org.id,
          username: adminUsername,
          displayName: adminDisplayName,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      });
      adminUserId = newAdmin.id;
      console.log(`  ✅ Admin user '${adminUsername}' created successfully.`);
    }

    // Assign Admin to KOZ-001
    await tx.userOutletAssignment.upsert({
      where: {
        userId_outletId: {
          userId: adminUserId,
          outletId: outlet.id,
        },
      },
      update: {
        isDefault: true,
      },
      create: {
        userId: adminUserId,
        outletId: outlet.id,
        isDefault: true,
      },
    });
    console.log(`  ✅ Outlet assignment verified: User '${adminUsername}' -> Outlet '${outlet.code}' (Default)`);

    console.log("==================================================================");
    console.log("✨ Production bootstrap finished successfully. Zero mock records imported.");
    console.log("==================================================================\n");

    return {
      organizationId: org.id,
      outletId: outlet.id,
      adminUserId,
    };
  });
}

// -----------------------------------------------------------------------------
// 4. Standalone CLI Invocation
// -----------------------------------------------------------------------------
const isDirectExecution =
  (typeof require !== "undefined" && require.main === module) ||
  (typeof process !== "undefined" &&
    process.argv[1] &&
    process.argv[1].replace(/\\/g, "/").includes("prisma/seeds/seed.prod.ts"));

if (isDirectExecution) {
  bootstrapProductionDatabase()
    .catch((err) => {
      console.error("\n❌ Production bootstrap failed:", err.message || err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

