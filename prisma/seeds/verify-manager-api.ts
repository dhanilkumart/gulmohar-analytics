import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();
const BASE_URL = "http://127.0.0.1:3099";

const TEST_ORG_CODE = "MGR-TEST-ORG";
const TEST_OUTLET_1_CODE = "MGR-OUTLET-1";
const TEST_OUTLET_2_CODE = "MGR-OUTLET-2";
const TEST_OUTLET_UNAUTH_CODE = "MGR-OUTLET-UNAUTH";

const TEST_SINGLE_MGR = "mgr_single_outlet";
const TEST_MULTI_MGR = "mgr_multi_outlet";
const TEST_OPERATOR = "op_manager_test";
const TEST_PASSWORD = "ManagerTestPass#2026";

async function runManagerEndpointVerification() {
  console.log("👔 Starting Manager Wastage & Breakage API Verification against http://127.0.0.1:3099...\n");
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
    // 0. Setup Multi-Outlet Test Fixtures
    // -------------------------------------------------------------------------
    console.log("0. Provisioning Isolated Multi-Outlet Fixtures in PostgreSQL:");
    const org = await prisma.organization.upsert({
      where: { code: TEST_ORG_CODE },
      update: {},
      create: {
        code: TEST_ORG_CODE,
        name: "Manager Testing Org",
      },
    });

    // Outlet 1
    const outlet1 = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_1_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_1_CODE,
        name: "Gulmohar Outlet 1",
        city: "Kozhikode",
        isActive: true,
      },
    });

    // Outlet 2
    const outlet2 = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_2_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_2_CODE,
        name: "Gulmohar Outlet 2",
        city: "Kochi",
        isActive: true,
      },
    });

    // Unauthorized Outlet
    const outletUnauth = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_UNAUTH_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_UNAUTH_CODE,
        name: "Gulmohar Unauthorized Outlet",
        city: "Kannur",
        isActive: true,
      },
    });

    // Departments for Outlet 1 and Outlet 2
    const dept1 = await prisma.department.upsert({
      where: {
        outletId_departmentCode: { outletId: outlet1.id, departmentCode: "KITCHEN" },
      },
      update: {},
      create: {
        outletId: outlet1.id,
        departmentCode: "KITCHEN",
        name: "Main Kitchen",
      },
    });

    const dept2 = await prisma.department.upsert({
      where: {
        outletId_departmentCode: { outletId: outlet2.id, departmentCode: "BAR" },
      },
      update: {},
      create: {
        outletId: outlet2.id,
        departmentCode: "BAR",
        name: "Bar & Beverages",
      },
    });

    // Category and Products
    const cat = await prisma.category.upsert({
      where: {
        organizationId_categoryCode: { organizationId: org.id, categoryCode: "CAT-MGR" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryCode: "CAT-MGR",
        name: "Manager Test Category",
      },
    });

    // Product with foodCost 45.00
    const prodCosted = await prisma.product.upsert({
      where: {
        organizationId_productCode: { organizationId: org.id, productCode: "PRD-COSTED" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryId: cat.id,
        productCode: "PRD-COSTED",
        name: "Costed Raw Chicken (kg)",
        defaultSellingPrice: 150.00,
        foodCost: 45.00,
        unit: "kg",
        isActive: true,
      },
    });

    // Product without cost (NULL foodCost)
    const prodNullCost = await prisma.product.upsert({
      where: {
        organizationId_productCode: { organizationId: org.id, productCode: "PRD-UNCOSTED" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryId: cat.id,
        productCode: "PRD-UNCOSTED",
        name: "Uncosted Herbs (bunch)",
        defaultSellingPrice: 50.00,
        foodCost: null,
        unit: "bunch",
        isActive: true,
      },
    });

    // Users
    const passwordHash = await hash(TEST_PASSWORD, {
      type: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // 1. Single Outlet Manager (Only Outlet 1)
    const singleMgrUser = await prisma.userAccount.upsert({
      where: { username: TEST_SINGLE_MGR },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_SINGLE_MGR,
        passwordHash,
        displayName: "Single Outlet Manager",
        role: "MANAGER",
        isActive: true,
      },
    });
    await prisma.userOutletAssignment.deleteMany({ where: { userId: singleMgrUser.id } });
    await prisma.userOutletAssignment.create({
      data: {
        userId: singleMgrUser.id,
        outletId: outlet1.id,
        isDefault: true,
      },
    });

    // 2. Multi-Outlet Manager (Outlet 1 and Outlet 2)
    const multiMgrUser = await prisma.userAccount.upsert({
      where: { username: TEST_MULTI_MGR },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_MULTI_MGR,
        passwordHash,
        displayName: "Multi Outlet Manager",
        role: "MANAGER",
        isActive: true,
      },
    });
    await prisma.userOutletAssignment.deleteMany({ where: { userId: multiMgrUser.id } });
    await prisma.userOutletAssignment.createMany({
      data: [
        { userId: multiMgrUser.id, outletId: outlet1.id, isDefault: true },
        { userId: multiMgrUser.id, outletId: outlet2.id, isDefault: false },
      ],
    });

    // 3. Operator (Outlet 1)
    const operatorUser = await prisma.userAccount.upsert({
      where: { username: TEST_OPERATOR },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_OPERATOR,
        passwordHash,
        displayName: "Floor Operator",
        role: "OPERATOR",
        isActive: true,
      },
    });
    await prisma.userOutletAssignment.deleteMany({ where: { userId: operatorUser.id } });
    await prisma.userOutletAssignment.create({
      data: {
        userId: operatorUser.id,
        outletId: outlet1.id,
        isDefault: true,
      },
    });

    console.log("  Fixtures provisioned.\n");

    // Helper for login
    async function login(username: string): Promise<string> {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: TEST_PASSWORD }),
      });
      if (!res.ok) {
        throw new Error(`Login failed for ${username}: ${res.status}`);
      }
      const cookie = res.headers.get("set-cookie");
      if (!cookie) {
        throw new Error(`No cookie set for ${username}`);
      }
      return cookie.split(";")[0];
    }

    const singleCookie = await login(TEST_SINGLE_MGR);
    const multiCookie = await login(TEST_MULTI_MGR);
    const opCookie = await login(TEST_OPERATOR);

    // -------------------------------------------------------------------------
    // 1. Test /api/dashboard/outlets
    // -------------------------------------------------------------------------
    console.log("1. Testing /api/dashboard/outlets scoping:");

    // Single outlet manager
    const singleOutletsRes = await fetch(`${BASE_URL}/api/dashboard/outlets`, {
      headers: { Cookie: singleCookie },
    });
    assert(singleOutletsRes.status === 200, "Single-outlet manager can fetch /api/dashboard/outlets");
    const singleOutletsData = await singleOutletsRes.json();
    assert(singleOutletsData.canSwitch === false, "canSwitch is false for single-outlet manager");
    assert(singleOutletsData.outlets.length === 1, "Single-outlet manager sees exactly 1 outlet");
    assert(singleOutletsData.activeOutlet?.id === outlet1.id, "Single-outlet manager automatically assigned active outlet");

    // Multi outlet manager default
    const multiOutletsRes = await fetch(`${BASE_URL}/api/dashboard/outlets`, {
      headers: { Cookie: multiCookie },
    });
    assert(multiOutletsRes.status === 200, "Multi-outlet manager can fetch /api/dashboard/outlets");
    const multiOutletsData = await multiOutletsRes.json();
    assert(multiOutletsData.canSwitch === true, "canSwitch is true for multi-outlet manager");
    assert(multiOutletsData.outlets.length === 2, "Multi-outlet manager sees 2 assigned outlets");
    assert(multiOutletsData.activeOutlet?.id === outlet1.id, "Multi-outlet manager defaults to first assigned outlet");

    // Multi outlet manager switching via ?outletId=
    const multiSwitchRes = await fetch(`${BASE_URL}/api/dashboard/outlets?outletId=${outlet2.id}`, {
      headers: { Cookie: multiCookie },
    });
    const multiSwitchData = await multiSwitchRes.json();
    assert(multiSwitchData.activeOutlet?.id === outlet2.id, "Multi-outlet manager can switch active outlet via query param");

    // Multi outlet manager requesting unassigned outlet -> Expect 403 Forbidden
    const multiUnauthRes = await fetch(`${BASE_URL}/api/dashboard/outlets?outletId=${outletUnauth.id}`, {
      headers: { Cookie: multiCookie },
    });
    assert(multiUnauthRes.status === 403, "Multi-outlet manager requesting unauthorized outlet gets HTTP 403 Forbidden");

    // -------------------------------------------------------------------------
    // 2. Role Enforcement: Operator blocked from Manager Endpoints
    // -------------------------------------------------------------------------
    console.log("\n2. Testing Role Enforcement (Operator blocked from Manager endpoints):");
    const opWastageGet = await fetch(`${BASE_URL}/api/dashboard/wastage?outletId=${outlet1.id}`, {
      headers: { Cookie: opCookie },
    });
    assert(opWastageGet.status === 403, "Operator GET /api/dashboard/wastage is rejected with HTTP 403");

    const opWastagePost = await fetch(`${BASE_URL}/api/dashboard/wastage`, {
      method: "POST",
      headers: { Cookie: opCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ outletId: outlet1.id }),
    });
    assert(opWastagePost.status === 403, "Operator POST /api/dashboard/wastage is rejected with HTTP 403");

    const opBreakageGet = await fetch(`${BASE_URL}/api/dashboard/breakage?outletId=${outlet1.id}`, {
      headers: { Cookie: opCookie },
    });
    assert(opBreakageGet.status === 403, "Operator GET /api/dashboard/breakage is rejected with HTTP 403");

    // -------------------------------------------------------------------------
    // 3. Manager Wastage CRUD & Outlet Scoping
    // -------------------------------------------------------------------------
    console.log("\n3. Testing Manager Wastage CRUD & Outlet Scoping:");

    // Rejection of unauthorized outlet creation
    const unauthWastageCreate = await fetch(`${BASE_URL}/api/dashboard/wastage`, {
      method: "POST",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet2.id, // Single manager does not have outlet 2
        departmentId: dept2.id,
        productId: prodCosted.id,
        quantity: 2,
        reason: "spoilage",
      }),
    });
    assert(unauthWastageCreate.status === 403, "Manager cannot create wastage in unassigned outlet (HTTP 403)");

    // Valid creation with costed product in Outlet 1
    const createCostedRes = await fetch(`${BASE_URL}/api/dashboard/wastage`, {
      method: "POST",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet1.id,
        productId: prodCosted.id,
        preparedQuantity: 10,
        wastedQuantity: 3,
        reason: "Prep waste",
        notes: "Trimmed excess fat",
      }),
    });
    assert(createCostedRes.status === 200, "Manager creates wastage record in Outlet 1 (HTTP 200)");
    const costedJson = await createCostedRes.json();
    const costedRecord = costedJson.record;
    assert(costedJson.success === true, "Creation returns success true");
    assert(Number(costedRecord.wastedQuantity) === 3, "Created wastage record has correct wasted quantity (3)");
    assert(Number(costedRecord.unitFoodCost) === 45, "Server calculated unitFoodCost from product foodCost (45)");
    assert(Number(costedRecord.estimatedCost) === 135, "Server calculated estimatedCost = 3 * 45 = 135");

    // Valid creation with NULL cost product
    const createNullCostRes = await fetch(`${BASE_URL}/api/dashboard/wastage`, {
      method: "POST",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet1.id,
        productId: prodNullCost.id,
        preparedQuantity: 10,
        wastedQuantity: 5,
        reason: "Expired",
      }),
    });
    assert(createNullCostRes.status === 200, "Manager creates wastage record for uncosted product (HTTP 200)");
    const nullCostJson = await createNullCostRes.json();
    const nullCostRecord = nullCostJson.record;
    assert(nullCostRecord.unitFoodCost === null, "unitFoodCost is strictly null for uncosted product");
    assert(nullCostRecord.estimatedCost === null, "estimatedCost is strictly null when foodCost is missing");

    // Manager GET list scoped to Outlet 1
    const listRes1 = await fetch(`${BASE_URL}/api/dashboard/wastage?outletId=${outlet1.id}`, {
      headers: { Cookie: singleCookie },
    });
    assert(listRes1.status === 200, "Manager GET /api/dashboard/wastage returns HTTP 200");
    const listData1 = await listRes1.json();
    assert(Array.isArray(listData1.records) && listData1.records.length >= 2, "List returns created records");

    // Manager UPDATE (PUT) record
    const updateRes = await fetch(`${BASE_URL}/api/dashboard/wastage`, {
      method: "PUT",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: costedRecord.id,
        preparedQuantity: 10,
        wastedQuantity: 4,
        reason: "Burnt",
        notes: "Overcooked on grill",
      }),
    });
    assert(updateRes.status === 200, "Manager updates existing wastage record (HTTP 200)");
    const updatedJson = await updateRes.json();
    const updatedRecord = updatedJson.record;
    assert(Number(updatedRecord.wastedQuantity) === 4, "Updated record reflects new wasted quantity 4");
    assert(Number(updatedRecord.estimatedCost) === 180, "Updated record recomputed estimatedCost = 4 * 45 = 180");
    assert(updatedRecord.reason === "Burnt", "Updated record reflects new reason 'Burnt'");

    // Manager DELETE record
    const deleteRes = await fetch(`${BASE_URL}/api/dashboard/wastage?id=${nullCostRecord.id}`, {
      method: "DELETE",
      headers: { Cookie: singleCookie },
    });
    assert(deleteRes.status === 200, "Manager deletes wastage record (HTTP 200)");

    // Verify deletion in DB
    const verifyDeleted = await prisma.wastageRecord.findUnique({
      where: { id: nullCostRecord.id },
    });
    assert(verifyDeleted === null, "Wastage record was permanently removed from PostgreSQL");

    // Multi-outlet isolation: Single manager cannot view or edit Outlet 2
    const singleMgrOutlet2Get = await fetch(`${BASE_URL}/api/dashboard/wastage?outletId=${outlet2.id}`, {
      headers: { Cookie: singleCookie },
    });
    assert(singleMgrOutlet2Get.status === 403, "Single manager querying unassigned Outlet 2 gets HTTP 403");

    // -------------------------------------------------------------------------
    // 4. Manager Breakage CRUD & Scoping
    // -------------------------------------------------------------------------
    console.log("\n4. Testing Manager Breakage CRUD & Scoping:");

    // Create breakage record with client-attempted cost (Must be ignored, stored as NULL)
    const createBrkRes = await fetch(`${BASE_URL}/api/dashboard/breakage`, {
      method: "POST",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet1.id,
        departmentId: dept1.id,
        item: "Fine Ceramic Dinner Plate",
        quantity: 2,
        cost: 999.00, // Client attempted cost injection
        reason: "dropped_by_staff",
        notes: "Slipped during dishwashing",
      }),
    });
    assert(createBrkRes.status === 200, "Manager creates breakage record (HTTP 200)");
    const brkJson = await createBrkRes.json();
    const brkRecord = brkJson.record;
    assert(Number(brkRecord.quantity) === 2, "Breakage record has quantity 2");
    assert(brkRecord.unitCost === null, "Breakage record unitCost is NULL (client cost rejected & no invented fallback)");
    assert(brkRecord.cost === null, "Breakage record total cost is NULL (strict NULL-cost policy)");

    // Create second breakage record without cost
    const createNullBrkRes = await fetch(`${BASE_URL}/api/dashboard/breakage`, {
      method: "POST",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet1.id,
        departmentId: dept1.id,
        item: "Standard Water Tumbler",
        quantity: 5,
        reason: "customer_accident",
      }),
    });
    assert(createNullBrkRes.status === 200, "Manager creates breakage record (HTTP 200)");
    const nullBrkJson = await createNullBrkRes.json();
    const nullBrkRecord = nullBrkJson.record;
    assert(Number(nullBrkRecord.quantity) === 5, "Breakage quantity is 5");
    assert(nullBrkRecord.cost === null, "Breakage total cost is strictly NULL");

    // Manager GET breakage list
    const brkListRes = await fetch(`${BASE_URL}/api/dashboard/breakage?outletId=${outlet1.id}`, {
      headers: { Cookie: singleCookie },
    });
    assert(brkListRes.status === 200, "Manager GET /api/dashboard/breakage returns HTTP 200");
    const brkListData = await brkListRes.json();
    assert(Array.isArray(brkListData.records) && brkListData.records.length >= 2, "Breakage list returns records");

    // Manager PUT breakage record (attempting client-cost update, must remain NULL)
    const updateBrkRes = await fetch(`${BASE_URL}/api/dashboard/breakage`, {
      method: "PUT",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: brkRecord.id,
        item: "Fine Ceramic Dinner Plate (Large)",
        quantity: 3,
        cost: 888.00, // Client attempted cost injection on update
        reason: "storage_accident",
        notes: "Shelf collapsed",
      }),
    });
    const updatedBrkJson = await updateBrkRes.json();
    if (updateBrkRes.status !== 200) {
      console.error("PUT /api/dashboard/breakage failed:", updateBrkRes.status, updatedBrkJson);
    }
    assert(updateBrkRes.status === 200, "Manager updates breakage record (HTTP 200)");
    const updatedBrk = updatedBrkJson.record;
    assert(Number(updatedBrk.quantity) === 3, "Updated breakage quantity is 3");
    assert(updatedBrk.cost === null, "Updated cost remains strictly NULL despite client payload");

    // Cross-outlet breakage update rejection: Single manager cannot modify records in Outlet 2
    // Create record in Outlet 2 via multi-manager first
    const out2BrkRes = await fetch(`${BASE_URL}/api/dashboard/breakage`, {
      method: "POST",
      headers: { Cookie: multiCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outlet2.id,
        departmentId: dept2.id,
        item: "Bar Highball Glass",
        quantity: 4,
      }),
    });
    const out2BrkJson = await out2BrkRes.json();
    const out2Brk = out2BrkJson.record;

    const crossUpdate = await fetch(`${BASE_URL}/api/dashboard/breakage`, {
      method: "PUT",
      headers: { Cookie: singleCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: out2Brk.id,
        quantity: 10,
      }),
    });
    assert(crossUpdate.status === 403, "Single manager cannot edit breakage record in Outlet 2 (HTTP 403)");

    // Manager DELETE breakage record
    const deleteBrkRes = await fetch(`${BASE_URL}/api/dashboard/breakage?id=${nullBrkRecord.id}`, {
      method: "DELETE",
      headers: { Cookie: singleCookie },
    });
    assert(deleteBrkRes.status === 200, "Manager deletes breakage record (HTTP 200)");
    const verifyBrkDeleted = await prisma.breakageRecord.findUnique({
      where: { id: nullBrkRecord.id },
    });
    assert(verifyBrkDeleted === null, "Breakage record permanently removed from PostgreSQL");

    // Clean up temporary created records
    await prisma.wastageRecord.deleteMany({
      where: { id: { in: [costedRecord.id] } },
    });
    await prisma.breakageRecord.deleteMany({
      where: { id: { in: [brkRecord.id, out2Brk.id] } },
    });

  } catch (err) {
    console.error("❌ Exception during manager verification:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n==================================================`);
  console.log(`Manager Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runManagerEndpointVerification();
