/**
 * Unit Test Suite for Production Database Bootstrap Logic
 *
 * Verifies the safety invariants and idempotency behavior of seed.prod.ts:
 * 1. Requires PROD_ADMIN_PASSWORD with >= 12 characters.
 * 2. Idempotently provisions root organization "AG".
 * 3. Idempotently provisions outlet "KOZ-001" with petpoojaRestId "9780nusx".
 * 4. Ensures "KOZ-002" is NEVER created.
 * 5. Provisions D01 (Kitchen) and D02 (Service) departments for KOZ-001.
 * 6. Creates initial Administrator account with Argon2id hash.
 * 7. Never overwrites existing Admin password on subsequent runs.
 * 8. Detects conflict if another outlet already claims petpoojaRestId "9780nusx".
 *
 * Runs without modifying live databases.
 *
 * Execute with:
 *   npx tsx tests/seed-prod.test.ts
 */

import { verify } from "argon2";
import { bootstrapProductionDatabase } from "../prisma/seeds/seed.prod";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message || err}`);
    if (err.stack) {
      console.error(
        err.stack
          .split("\n")
          .slice(1, 4)
          .map((s: string) => `     ${s}`)
          .join("\n")
      );
    }
    failedTests++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEquals(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg} -> Expected: ${expected}, Got: ${actual}`);
  }
}

// -----------------------------------------------------------------------------
// In-Memory Database Simulator for Bootstrap Tests
// -----------------------------------------------------------------------------
class MockBootstrapDatabase {
  public organizations: Map<string, any> = new Map();
  public outlets: Map<string, any> = new Map();
  public departments: Map<string, any> = new Map();
  public users: Map<string, any> = new Map();
  public assignments: Map<string, any> = new Map();

  public getMockClient(): any {
    return {
      $transaction: async (fn: any) => fn(this.getTxClient()),
    };
  }

  private getTxClient(): any {
    return {
      organization: {
        upsert: async ({ where, create, update }: any) => {
          const existing = this.organizations.get(where.code);
          if (existing) {
            const updated = { ...existing, ...update };
            this.organizations.set(where.code, updated);
            return updated;
          }
          const created = { id: `org-${where.code}`, ...create };
          this.organizations.set(where.code, created);
          return created;
        },
      },
      outlet: {
        findFirst: async ({ where }: any) => {
          for (const o of this.outlets.values()) {
            if (o.petpoojaRestId === where.petpoojaRestId && o.code !== where.code?.not) {
              return { ...o };
            }
          }
          return null;
        },
        upsert: async ({ where, create, update }: any) => {
          const existing = this.outlets.get(where.code);
          if (existing) {
            const updated = { ...existing, ...update };
            this.outlets.set(where.code, updated);
            return updated;
          }
          const created = { id: `outlet-${where.code}`, ...create };
          this.outlets.set(where.code, created);
          return created;
        },
      },
      department: {
        upsert: async ({ where, create, update }: any) => {
          const key = `${where.outletId_departmentCode.outletId}_${where.outletId_departmentCode.departmentCode}`;
          const existing = this.departments.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            this.departments.set(key, updated);
            return updated;
          }
          const created = { id: `dept-${key}`, ...create };
          this.departments.set(key, created);
          return created;
        },
      },
      userAccount: {
        findUnique: async ({ where }: any) => {
          return this.users.get(where.username) ? { ...this.users.get(where.username) } : null;
        },
        create: async ({ data }: any) => {
          const created = { id: `user-${data.username}`, ...data };
          this.users.set(data.username, created);
          return created;
        },
        update: async ({ where, data }: any) => {
          let target: any = null;
          for (const [uname, u] of this.users.entries()) {
            if (u.id === where.id) {
              target = { ...u, ...data };
              this.users.set(uname, target);
              break;
            }
          }
          return target;
        },
      },
      userOutletAssignment: {
        upsert: async ({ where, create, update }: any) => {
          const key = `${where.userId_outletId.userId}_${where.userId_outletId.outletId}`;
          const existing = this.assignments.get(key);
          if (existing) {
            const updated = { ...existing, ...update };
            this.assignments.set(key, updated);
            return updated;
          }
          const created = { id: `assign-${key}`, ...create };
          this.assignments.set(key, created);
          return created;
        },
      },
    };
  }
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PRODUCTION BOOTSTRAP UNIT TESTS");
  console.log("==================================================================");

  // Set valid test configuration with confirmed production database name
  process.env.CONFIRM_PRODUCTION_BOOTSTRAP = "YES";
  process.env.PROD_ADMIN_PASSWORD = "StrongProductionPass#2026!";
  process.env.DATABASE_URL = "postgresql://gulmohar_app:secret@shared-postgres:5432/gulmohar_analytics";

  // 1. Safety Guard: Missing CONFIRM_PRODUCTION_BOOTSTRAP
  await test("Refuses execution if CONFIRM_PRODUCTION_BOOTSTRAP is not 'YES'", async () => {
    const db = new MockBootstrapDatabase();
    process.env.CONFIRM_PRODUCTION_BOOTSTRAP = "NO";

    let caught = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("CONFIRM_PRODUCTION_BOOTSTRAP must be explicitly set to 'YES'"),
        "Explains confirmation requirement"
      );
    }
    assert(caught, "Must throw confirmation error");
    process.env.CONFIRM_PRODUCTION_BOOTSTRAP = "YES";
  });

  // 2. Safety Guard: Missing or short PROD_ADMIN_PASSWORD
  await test("Refuses execution if PROD_ADMIN_PASSWORD is missing or shorter than 12 chars", async () => {
    const db = new MockBootstrapDatabase();
    process.env.PROD_ADMIN_PASSWORD = "short";

    let caught = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("at least 12 characters"),
        "Explains length requirement"
      );
    }
    assert(caught, "Must throw password length error");
    process.env.PROD_ADMIN_PASSWORD = "StrongProductionPass#2026!";
  });

  // 3. Safety Guard: Target is not in the explicit production database allowlist
  await test("Refuses execution if target database is not 'gulmohar_analytics'", async () => {
    const db = new MockBootstrapDatabase();
    process.env.DATABASE_URL = "postgresql://prod_user:secret@shared-postgres:5432/other_database";

    let caught = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("is not in the production allowlist"),
        "Rejects non-allowlisted database"
      );
    }
    assert(caught, "Must throw database allowlist refusal");
    process.env.DATABASE_URL = "postgresql://gulmohar_app:secret@shared-postgres:5432/gulmohar_analytics";
  });

  // 4. Safety Guard: Target host is not in the explicit host allowlist
  await test("Refuses execution if target host is not in ALLOWED_PROD_HOSTS", async () => {
    const db = new MockBootstrapDatabase();
    process.env.DATABASE_URL = "postgresql://gulmohar_app:secret@unauthorized-host:5432/gulmohar_analytics";

    let caught = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("is not in the production host allowlist"),
        "Rejects non-allowlisted host"
      );
    }
    assert(caught, "Must throw host allowlist refusal");
    process.env.DATABASE_URL = "postgresql://gulmohar_app:secret@shared-postgres:5432/gulmohar_analytics";
  });

  // 5. Safety Guard: Target is a development or test database
  await test("Refuses execution if DATABASE_URL points to a development/test database", async () => {
    const db = new MockBootstrapDatabase();
    process.env.DATABASE_URL = "postgresql://dev_user:pass@localhost:5432/gulmohar_dev";

    let caught = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("is not in the production allowlist") ||
          e.message.includes("development/test database"),
        "Rejects dev database URL"
      );
    }
    assert(caught, "Must throw dev database refusal");
    process.env.DATABASE_URL = "postgresql://gulmohar_app:secret@shared-postgres:5432/gulmohar_analytics";
  });

  // 4. Successful first-time bootstrap
  await test("Initial bootstrap creates AG org, KOZ-001 outlet, departments and admin", async () => {
    const db = new MockBootstrapDatabase();
    const result = await bootstrapProductionDatabase(db.getMockClient());

    assert(Boolean(result.organizationId), "Returns organizationId");
    assert(Boolean(result.outletId), "Returns outletId");
    assert(Boolean(result.adminUserId), "Returns adminUserId");

    // Organization check
    const org = db.organizations.get("AG");
    assert(Boolean(org), "Org AG exists");
    assertEquals(org.name, "Ashirvad Gulmohar", "Org name matches");

    // Outlet check
    const outlet = db.outlets.get("KOZ-001");
    assert(Boolean(outlet), "Outlet KOZ-001 exists");
    assertEquals(outlet.petpoojaRestId, "9780nusx", "Petpooja restId is 9780nusx");
    assertEquals(outlet.isActive, true, "Outlet is active");

    // KOZ-002 absence guarantee
    assertEquals(db.outlets.has("KOZ-002"), false, "KOZ-002 must NEVER exist in production");

    // Department check
    const kitchenKey = `${outlet.id}_D01`;
    const serviceKey = `${outlet.id}_D02`;
    assert(db.departments.has(kitchenKey), "Kitchen dept exists");
    assert(db.departments.has(serviceKey), "Service dept exists");

    // Admin user check
    const admin = db.users.get("admin");
    assert(Boolean(admin), "Admin user exists");
    assertEquals(admin.role, "ADMIN", "Role is ADMIN");
    assertEquals(admin.isActive, true, "Admin is active");

    // Verify Argon2id password hash works
    const isPwValid = await verify(admin.passwordHash, "StrongProductionPass#2026!");
    assert(isPwValid, "Argon2id password hash is valid");
  });

  // 2. Idempotency and Password Preservation
  await test("Subsequent run does not overwrite existing Admin password", async () => {
    const db = new MockBootstrapDatabase();

    // First run creates admin with initial password
    process.env.PROD_ADMIN_PASSWORD = "FirstInitialPassword#123";
    await bootstrapProductionDatabase(db.getMockClient());

    const initialAdmin = db.users.get("admin");
    const initialHash = initialAdmin.passwordHash;

    // Second run with a DIFFERENT password in environment
    process.env.PROD_ADMIN_PASSWORD = "DifferentSecondPassword#456";
    await bootstrapProductionDatabase(db.getMockClient());

    const secondAdmin = db.users.get("admin");
    assertEquals(
      secondAdmin.passwordHash,
      initialHash,
      "Existing password hash must remain untouched on subsequent runs"
    );

    // Initial password should still verify
    const isFirstStillValid = await verify(secondAdmin.passwordHash, "FirstInitialPassword#123");
    assert(isFirstStillValid, "Original password still verifies");
  });

  // 3. Conflict Detection
  await test("Throws error if another outlet claims the target Petpooja restaurant ID", async () => {
    const db = new MockBootstrapDatabase();
    // Simulate another conflicting outlet
    db.outlets.set("BLR-001", {
      id: "outlet-blr",
      code: "BLR-001",
      name: "Bangalore Outlet",
      petpoojaRestId: "9780nusx",
    });

    let threw = false;
    try {
      await bootstrapProductionDatabase(db.getMockClient());
    } catch (e: any) {
      threw = true;
      assert(e.message.includes("Database conflict"), "Detects Petpooja restId conflict");
    }
    assert(threw, "Must throw conflict error");
  });

  console.log("==================================================================");
  console.log(`Results: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);
  console.log("==================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error("Fatal test runner crash:", e);
  process.exit(1);
});

