import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();
const BASE_URL = "http://127.0.0.1:3099";

const TEST_ORG_CODE = "OP-TEST-ORG";
const TEST_OUTLET_A_CODE = "OP-OUTLET-A";
const TEST_OUTLET_B_CODE = "OP-OUTLET-B";

const TEST_OPERATOR_A = "operator_outlet_a";
const TEST_ADMIN = "admin_user_test";
const TEST_PASSWORD = "OperatorTestPass#2026";

async function runOperatorEndpointVerification() {
  console.log("🥘 Starting Operator Wastage & Breakage API Verification against http://127.0.0.1:3099...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 0. Setup Organization, Two Outlets, Departments & Products
    // -------------------------------------------------------------------------
    console.log("0. Provisioning Isolated Multi-Outlet Fixtures in PostgreSQL:");
    const org = await prisma.organization.upsert({
      where: { code: TEST_ORG_CODE },
      update: {},
      create: {
        code: TEST_ORG_CODE,
        name: "Operator Testing Org",
      },
    });

    // Outlet A (Operator A's outlet)
    const outletA = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_A_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_A_CODE,
        name: "Ashirvad Gulmohar Outlet A",
        city: "Kozhikode",
        isActive: true,
      },
    });

    // Outlet B (Different outlet)
    const outletB = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_B_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_B_CODE,
        name: "Ashirvad Gulmohar Outlet B",
        city: "Bangalore",
        isActive: true,
      },
    });

    // Department A in Outlet A
    const deptA = await prisma.department.upsert({
      where: {
        outletId_departmentCode: { outletId: outletA.id, departmentCode: "D01" },
      },
      update: {},
      create: {
        outletId: outletA.id,
        departmentCode: "D01",
        name: "Kitchen",
      },
    });

    // Department B in Outlet B
    const deptB = await prisma.department.upsert({
      where: {
        outletId_departmentCode: { outletId: outletB.id, departmentCode: "D01" },
      },
      update: {},
      create: {
        outletId: outletB.id,
        departmentCode: "D01",
        name: "Kitchen",
      },
    });

    // Category & Product in Organization
    const cat = await prisma.category.upsert({
      where: {
        organizationId_categoryCode: { organizationId: org.id, categoryCode: "CAT-OP" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryCode: "CAT-OP",
        name: "South Indian Special",
      },
    });

    const productWithCost = await prisma.product.upsert({
      where: {
        organizationId_productCode: { organizationId: org.id, productCode: "P-COSTED" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryId: cat.id,
        productCode: "P-COSTED",
        name: "Masala Dosa Special",
        defaultSellingPrice: 120,
        foodCost: 35.5, // Food cost = 35.50
        unit: "portion",
        isActive: true,
      },
    });

    const productNullCost = await prisma.product.upsert({
      where: {
        organizationId_productCode: { organizationId: org.id, productCode: "P-NULLCOST" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryId: cat.id,
        productCode: "P-NULLCOST",
        name: "New Experimental Dish",
        defaultSellingPrice: 150,
        foodCost: null, // Food cost unknown (NULL cost policy)
        unit: "portion",
        isActive: true,
      },
    });

    const passwordHash = await hash(TEST_PASSWORD, {
      type: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // Operator A assigned strictly to Outlet A
    const operatorA = await prisma.userAccount.upsert({
      where: { username: TEST_OPERATOR_A },
      update: { isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_OPERATOR_A,
        displayName: "Operator Terminal A",
        passwordHash,
        role: "OPERATOR",
        isActive: true,
      },
    });

    await prisma.userOutletAssignment.upsert({
      where: {
        userId_outletId: { userId: operatorA.id, outletId: outletA.id },
      },
      update: { isDefault: true },
      create: {
        userId: operatorA.id,
        outletId: outletA.id,
        isDefault: true,
      },
    });

    // Admin user (organization wide)
    const adminUser = await prisma.userAccount.upsert({
      where: { username: TEST_ADMIN },
      update: { isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_ADMIN,
        displayName: "Admin Supervisor",
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    assert(Boolean(operatorA && adminUser), "Fixtures initialized for multi-outlet testing");

    // -------------------------------------------------------------------------
    // 1. Authenticate Operator A and obtain cookie
    // -------------------------------------------------------------------------
    console.log("\n1. Authenticating Operator A:");
    const loginOpRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_OPERATOR_A, password: TEST_PASSWORD }),
    });
    assert(loginOpRes.status === 200, "Operator A login successful (HTTP 200)");
    const opCookieHeader = loginOpRes.headers.get("set-cookie") || "";
    const opCookie = (opCookieHeader.match(/gulmohar_session=([^;]+)/) || [])[1];

    // Authenticate Admin
    const loginAdminRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: TEST_ADMIN, password: TEST_PASSWORD }),
    });
    const adminCookieHeader = loginAdminRes.headers.get("set-cookie") || "";
    const adminCookie = (adminCookieHeader.match(/gulmohar_session=([^;]+)/) || [])[1];

    // -------------------------------------------------------------------------
    // 2. GET /api/operator/meta
    // -------------------------------------------------------------------------
    console.log("\n2. Testing GET /api/operator/meta:");
    const metaRes = await fetch(`${BASE_URL}/api/operator/meta`, {
      headers: { Cookie: `gulmohar_session=${opCookie}` },
    });
    assert(metaRes.status === 200, "GET /api/operator/meta returns HTTP 200");
    const metaBody = await metaRes.json();
    assert(metaBody.outlet.code === TEST_OUTLET_A_CODE, "Meta endpoint returns Operator A's assigned outlet");
    assert(metaBody.departments.some((d: { id: string }) => d.id === deptA.id), "Meta endpoint returns Outlet A's department");

    // -------------------------------------------------------------------------
    // 3. POST /api/operator/wastage: Valid Submission & Server-Side Cost Calculation
    // -------------------------------------------------------------------------
    console.log("\n3. Testing POST /api/operator/wastage (Costed Product):");
    const wastagePayload = {
      dish: productWithCost.name,
      productId: productWithCost.id,
      preparedQuantity: 40,
      wastedQuantity: 6,
      reason: "Over-preparation",
      notes: "Lunch rush prep excess",
      // Client tampering attempt: should be completely ignored/overridden by server
      outletId: outletB.id,
      recordedById: adminUser.id,
      unitFoodCost: 9999.99,
      estimatedCost: 999999.99,
    };

    const wastageRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify(wastagePayload),
    });

    assert(wastageRes.status === 200, `POST /api/operator/wastage returned HTTP 200 (Got ${wastageRes.status})`);
    const wastageBody = await wastageRes.json();
    assert(wastageBody.success === true, "Wastage submission returned success: true");

    // Check database record in PostgreSQL
    const dbWastage = await prisma.wastageRecord.findUnique({
      where: { id: wastageBody.record.id },
    });
    assert(dbWastage !== null, "Wastage record persisted in PostgreSQL");
    assert(dbWastage?.outletId === outletA.id, "outletId is strictly Operator A's assigned outlet (tampered outletB ignored)");
    assert(dbWastage?.recordedById === operatorA.id, "recordedById is strictly authenticated Operator A (tampered adminId ignored)");
    assert(Number(dbWastage?.unitFoodCost) === 35.5, "unitFoodCost computed server-side from product master (₹35.50)");
    // 6 * 35.5 = 213.00
    assert(Number(dbWastage?.estimatedCost) === 213.0, "estimatedCost computed server-side: 6 * 35.50 = ₹213.00 (tampered cost ignored)");

    // -------------------------------------------------------------------------
    // 4. POST /api/operator/wastage: NULL-Cost Policy Check
    // -------------------------------------------------------------------------
    console.log("\n4. Testing POST /api/operator/wastage (NULL-Cost Policy):");
    const nullCostWastageRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify({
        dish: productNullCost.name,
        productId: productNullCost.id,
        preparedQuantity: 20,
        wastedQuantity: 4,
        reason: "Kitchen spoiled/burnt",
      }),
    });
    const nullCostBody = await nullCostWastageRes.json();
    const dbNullCostWastage = await prisma.wastageRecord.findUnique({
      where: { id: nullCostBody.record.id },
    });
    assert(dbNullCostWastage?.unitFoodCost === null, "When product cost is unknown, unitFoodCost stores NULL");
    assert(dbNullCostWastage?.estimatedCost === null, "When product cost is unknown, estimatedCost stores NULL (Never false zero!)");

    // -------------------------------------------------------------------------
    // 5. POST /api/operator/wastage: Validation & Edge Cases
    // -------------------------------------------------------------------------
    console.log("\n5. Testing Wastage Input Validation:");
    // Quantity > Prepared
    const invalidQtyRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify({
        dish: productWithCost.name,
        preparedQuantity: 10,
        wastedQuantity: 15, // invalid: wasted > prep
        reason: "Customer returned",
      }),
    });
    assert(invalidQtyRes.status === 400, "Wasted > Prepared quantity rejected with HTTP 400");

    // Negative quantity
    const negativeQtyRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify({
        dish: productWithCost.name,
        preparedQuantity: -5,
        wastedQuantity: 2,
        reason: "Over-preparation",
      }),
    });
    assert(negativeQtyRes.status === 400, "Negative quantity rejected with HTTP 400");

    // -------------------------------------------------------------------------
    // 6. POST /api/operator/breakage: Valid Submission & Department Scoping
    // -------------------------------------------------------------------------
    console.log("\n6. Testing POST /api/operator/breakage (Valid Submission & Costing):");
    const breakagePayload = {
      item: "Dinner Plate",
      departmentId: deptA.id,
      brokenQuantity: 3,
      reason: "Dropped by steward/customer",
      notes: "Accidental drop near table 4",
      // Client tampering attempt:
      outletId: outletB.id,
      recordedById: adminUser.id,
      unitCost: 50000,
      totalCost: 150000,
    };

    const breakageRes = await fetch(`${BASE_URL}/api/operator/breakage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify(breakagePayload),
    });

    assert(breakageRes.status === 200, `POST /api/operator/breakage returned HTTP 200 (Got ${breakageRes.status})`);
    const breakageBody = await breakageRes.json();
    assert(breakageBody.success === true, "Breakage submission returned success: true");

    const dbBreakage = await prisma.breakageRecord.findUnique({
      where: { id: breakageBody.record.id },
    });
    assert(dbBreakage !== null, "Breakage record persisted in PostgreSQL");
    assert(dbBreakage?.outletId === outletA.id, "outletId is strictly Operator A's outlet (tampered outletB ignored)");
    assert(dbBreakage?.departmentId === deptA.id, "departmentId is strictly Outlet A's department");
    assert(dbBreakage?.recordedById === operatorA.id, "recordedById is strictly authenticated Operator A");
    // Standard dinner plate replacement cost = ₹180; 3 * 180 = ₹540
    assert(Number(dbBreakage?.unitCost) === 180, "unitCost computed server-side for 'Dinner Plate' (₹180)");
    assert(Number(dbBreakage?.totalCost) === 540, "totalCost computed server-side: 3 * 180 = ₹540 (tampered cost ignored)");

    // -------------------------------------------------------------------------
    // 7. Cross-Outlet Department Reference Protection
    // -------------------------------------------------------------------------
    console.log("\n7. Testing Cross-Outlet Department Isolation:");
    // Attempting to supply department B (belongs to outlet B) from Operator A (outlet A)
    const crossDeptRes = await fetch(`${BASE_URL}/api/operator/breakage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${opCookie}` },
      body: JSON.stringify({
        item: "Water Glass",
        departmentId: deptB.id, // Department of Outlet B!
        brokenQuantity: 2,
        reason: "Handling damage",
      }),
    });
    assert(crossDeptRes.status === 200, "Submission handled gracefully");
    const crossDeptBody = await crossDeptRes.json();
    const dbCrossCheck = await prisma.breakageRecord.findUnique({
      where: { id: crossDeptBody.record.id },
      include: { department: true },
    });
    assert(
      dbCrossCheck?.outletId === outletA.id && dbCrossCheck?.department.outletId === outletA.id,
      "Server rejects cross-outlet department and re-binds/scopes department strictly within Outlet A"
    );

    // -------------------------------------------------------------------------
    // 8. Role Enforcement: Non-Operator Access Restrictions
    // -------------------------------------------------------------------------
    console.log("\n8. Testing RBAC Role Restrictions on Operator Endpoints:");
    // Admin attempting to POST to operator wastage endpoint
    const adminWastageRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `gulmohar_session=${adminCookie}` },
      body: JSON.stringify({
        dish: productWithCost.name,
        preparedQuantity: 10,
        wastedQuantity: 2,
        reason: "Over-preparation",
      }),
    });
    assert(adminWastageRes.status === 403, "Non-operator (Admin) rejected with HTTP 403 Forbidden");

    // Unauthenticated request
    const unauthRes = await fetch(`${BASE_URL}/api/operator/wastage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dish: productWithCost.name,
        preparedQuantity: 10,
        wastedQuantity: 2,
        reason: "Over-preparation",
      }),
    });
    assert(unauthRes.status === 401, "Unauthenticated request rejected with HTTP 401 Unauthorized");

    // -------------------------------------------------------------------------
    // 9. Teardown Test Data Safely
    // -------------------------------------------------------------------------
    console.log("\n9. Teardown Test Fixtures from PostgreSQL:");
    await prisma.wastageRecord.deleteMany({
      where: { outletId: { in: [outletA.id, outletB.id] } },
    });
    await prisma.breakageRecord.deleteMany({
      where: { outletId: { in: [outletA.id, outletB.id] } },
    });
    await prisma.userSession.deleteMany({
      where: { userId: { in: [operatorA.id, adminUser.id] } },
    });
    await prisma.userOutletAssignment.deleteMany({
      where: { outletId: { in: [outletA.id, outletB.id] } },
    });
    await prisma.department.deleteMany({
      where: { outletId: { in: [outletA.id, outletB.id] } },
    });
    await prisma.product.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.category.deleteMany({
      where: { organizationId: org.id },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: [operatorA.id, adminUser.id] } },
    });
    await prisma.outlet.deleteMany({
      where: { id: { in: [outletA.id, outletB.id] } },
    });
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log("  🧹 All operator test fixtures safely cleaned up.");

    console.log(`\n======================================================`);
    console.log(`Operator API Verification: ${passed + failed} Tests | ${passed} Passed | ${failed} Failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Operator API verification error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runOperatorEndpointVerification();
