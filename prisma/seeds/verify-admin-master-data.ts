import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();
const BASE_URL = "http://127.0.0.1:3099";

const TEST_ORG_CODE = "ADM-TEST-ORG";
const TEST_OUTLET_A_CODE = "ADM-OUTLET-A";
const TEST_OUTLET_B_CODE = "ADM-OUTLET-B";
const OTHER_ORG_CODE = "OTHER-TEST-ORG";
const OTHER_OUTLET_CODE = "OTHER-OUTLET";

const TEST_ADMIN = "admin_master_test";
const TEST_MANAGER = "mgr_master_test";
const TEST_OPERATOR = "op_master_test";
const TEST_PASSWORD = "AdminMasterTestPass#2026";

async function runAdminMasterDataVerification() {
  console.log("🛡️ Starting Admin Master Data Management Verification against http://127.0.0.1:3099...\n");
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
    console.log("0. Provisioning Organizations and Test Users in PostgreSQL:");
    const org = await prisma.organization.upsert({
      where: { code: TEST_ORG_CODE },
      update: {},
      create: {
        code: TEST_ORG_CODE,
        name: "Admin Master Data Org",
      },
    });

    const otherOrg = await prisma.organization.upsert({
      where: { code: OTHER_ORG_CODE },
      update: {},
      create: {
        code: OTHER_ORG_CODE,
        name: "Foreign Organization",
      },
    });

    const outletA = await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_A_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_A_CODE,
        name: "Admin Outlet A",
        city: "Kozhikode",
        isActive: true,
      },
    });

    await prisma.outlet.upsert({
      where: { code: TEST_OUTLET_B_CODE },
      update: {},
      create: {
        organizationId: org.id,
        code: TEST_OUTLET_B_CODE,
        name: "Admin Outlet B",
        city: "Kochi",
        isActive: true,
      },
    });

    const otherOutlet = await prisma.outlet.upsert({
      where: { code: OTHER_OUTLET_CODE },
      update: {},
      create: {
        organizationId: otherOrg.id,
        code: OTHER_OUTLET_CODE,
        name: "Foreign Outlet",
        city: "Bangalore",
        isActive: true,
      },
    });

    // Default category in test org
    const category = await prisma.category.upsert({
      where: {
        organizationId_categoryCode: { organizationId: org.id, categoryCode: "CAT-ADM" },
      },
      update: {},
      create: {
        organizationId: org.id,
        categoryCode: "CAT-ADM",
        name: "Admin Test Category",
      },
    });

    const passwordHash = await hash(TEST_PASSWORD, {
      type: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // 1. Admin
    await prisma.userAccount.upsert({
      where: { username: TEST_ADMIN },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_ADMIN,
        passwordHash,
        displayName: "Master Admin",
        role: "ADMIN",
        isActive: true,
      },
    });

    // 2. Manager
    const mgrUser = await prisma.userAccount.upsert({
      where: { username: TEST_MANAGER },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_MANAGER,
        passwordHash,
        displayName: "Assigned Manager",
        role: "MANAGER",
        isActive: true,
      },
    });
    await prisma.userOutletAssignment.deleteMany({ where: { userId: mgrUser.id } });
    await prisma.userOutletAssignment.create({
      data: { userId: mgrUser.id, outletId: outletA.id, isDefault: true },
    });

    // 3. Operator
    const opUser = await prisma.userAccount.upsert({
      where: { username: TEST_OPERATOR },
      update: { passwordHash, isActive: true },
      create: {
        organizationId: org.id,
        username: TEST_OPERATOR,
        passwordHash,
        displayName: "Terminal Operator",
        role: "OPERATOR",
        isActive: true,
      },
    });
    await prisma.userOutletAssignment.deleteMany({ where: { userId: opUser.id } });
    await prisma.userOutletAssignment.create({
      data: { userId: opUser.id, outletId: outletA.id, isDefault: true },
    });

    console.log("  Fixtures provisioned.\n");

    // Login helper
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

    const adminCookie = await login(TEST_ADMIN);
    const mgrCookie = await login(TEST_MANAGER);
    const opCookie = await login(TEST_OPERATOR);

    // -------------------------------------------------------------------------
    // 1. Role Enforcement (Manager & Operator rejection from Admin APIs)
    // -------------------------------------------------------------------------
    console.log("1. Testing Role Enforcement (Manager & Operator blocked from Admin APIs):");
    const endpoints = [
      "/api/admin/departments",
      "/api/admin/products",
      "/api/admin/ingredients",
      "/api/admin/recipes?productId=none",
    ];

    for (const ep of endpoints) {
      const mgrRes = await fetch(`${BASE_URL}${ep}`, { headers: { Cookie: mgrCookie } });
      assert(mgrRes.status === 403, `Manager GET ${ep} rejected with HTTP 403`);

      const opRes = await fetch(`${BASE_URL}${ep}`, { headers: { Cookie: opCookie } });
      assert(opRes.status === 403, `Operator GET ${ep} rejected with HTTP 403`);
    }

    // -------------------------------------------------------------------------
    // 2. Department Management CRUD
    // -------------------------------------------------------------------------
    console.log("\n2. Testing Department Management CRUD:");
    // Reject department creation in foreign outlet
    const foreignDeptRes = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: otherOutlet.id, // Foreign organization outlet
        departmentCode: "DEP-FOR",
        name: "Foreign Kitchen",
      }),
    });
    assert(foreignDeptRes.status === 400, "Cannot create department in foreign organization outlet (HTTP 400)");

    // Create department in Outlet A
    const createDeptRes = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outletA.id,
        departmentCode: "DEP-MAIN",
        name: "Main Production Kitchen",
        benchmarkHeadcount: 12,
      }),
    });
    assert(createDeptRes.status === 201, "Admin creates department in Outlet A (HTTP 201)");
    const deptData = await createDeptRes.json();
    const deptId = deptData.department.id;
    assert(deptData.department.departmentCode === "DEP-MAIN", "Created department has code DEP-MAIN");
    assert(deptData.department.benchmarkHeadcount === 12, "Benchmark headcount stored correctly (12)");

    // Duplicate code check in same outlet
    const dupDeptRes = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        outletId: outletA.id,
        departmentCode: "DEP-MAIN",
        name: "Duplicate Kitchen",
      }),
    });
    assert(dupDeptRes.status === 409, "Duplicate department code in same outlet rejected (HTTP 409)");

    // List departments
    const listDeptRes = await fetch(`${BASE_URL}/api/admin/departments?outletId=${outletA.id}`, {
      headers: { Cookie: adminCookie },
    });
    assert(listDeptRes.status === 200, "Admin can list departments (HTTP 200)");
    const deptList = await listDeptRes.json();
    const foundDept = deptList.departments.find((d: { id: string }) => d.id === deptId);
    assert(Boolean(foundDept), "Created department appears in list");

    // Update department (name, benchmark, deactivate)
    const updateDeptRes = await fetch(`${BASE_URL}/api/admin/departments`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deptId,
        name: "Central Production Kitchen",
        benchmarkHeadcount: 15,
        isActive: false,
      }),
    });
    assert(updateDeptRes.status === 200, "Admin updates department (HTTP 200)");
    const updatedDept = await updateDeptRes.json();
    assert(updatedDept.department.name === "Central Production Kitchen", "Department name updated");
    assert(updatedDept.department.isActive === false, "Department deactivated (isActive = false)");

    // -------------------------------------------------------------------------
    // 3. Product & Menu Management CRUD & NULL-cost Policy
    // -------------------------------------------------------------------------
    console.log("\n3. Testing Product & Menu Management CRUD:");

    // Create costed product with outlet price override
    const createProdCosted = await fetch(`${BASE_URL}/api/admin/products`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: "PRD-ADM-1",
        name: "Special Malabar Biryani",
        categoryId: category.id,
        defaultSellingPrice: 240,
        foodCost: 85.50,
        unit: "portion",
        preparationType: "batch",
        outletOverrides: [
          { outletId: outletA.id, priceOverride: 260, isAvailable: true },
        ],
      }),
    });
    assert(createProdCosted.status === 201, "Admin creates product with food cost (HTTP 201)");
    const prodCostedData = await createProdCosted.json();
    const prod1Id = prodCostedData.product.id;
    assert(Number(prodCostedData.product.defaultSellingPrice) === 240, "Default selling price is 240");
    assert(Number(prodCostedData.product.foodCost) === 85.5, "Food cost is 85.50");

    // Verify outlet override in DB
    const overrideCheck = await prisma.outletProductSetting.findUnique({
      where: { outletId_productId: { outletId: outletA.id, productId: prod1Id } },
    });
    assert(Boolean(overrideCheck && Number(overrideCheck.priceOverride) === 260), "Outlet price override saved in outlet_product_settings");

    // Create uncosted product (Strict NULL-cost policy verification)
    const createProdUncosted = await fetch(`${BASE_URL}/api/admin/products`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: "PRD-ADM-NULL",
        name: "Mystery Chef Special",
        categoryId: category.id,
        defaultSellingPrice: 300,
        foodCost: "", // Empty food cost
        unit: "plate",
      }),
    });
    assert(createProdUncosted.status === 201, "Admin creates product without food cost (HTTP 201)");
    const prodNullData = await createProdUncosted.json();
    const prod2Id = prodNullData.product.id;
    assert(prodNullData.product.foodCost === null, "foodCost is strictly NULL when unprovided (never zero)");

    // Check duplicate product code rejection
    const dupProdRes = await fetch(`${BASE_URL}/api/admin/products`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: "PRD-ADM-1",
        name: "Another Biryani",
        categoryId: category.id,
        defaultSellingPrice: 200,
      }),
    });
    assert(dupProdRes.status === 409, "Duplicate product code rejected with HTTP 409");

    // Update product
    const updateProdRes = await fetch(`${BASE_URL}/api/admin/products`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: prod1Id,
        defaultSellingPrice: 250,
        foodCost: 90,
      }),
    });
    assert(updateProdRes.status === 200, "Admin updates product (HTTP 200)");
    const updatedProd = await updateProdRes.json();
    assert(Number(updatedProd.product.defaultSellingPrice) === 250, "Selling price updated to 250");
    assert(Number(updatedProd.product.foodCost) === 90, "Food cost updated to 90");

    // -------------------------------------------------------------------------
    // 4. Ingredient Management CRUD
    // -------------------------------------------------------------------------
    console.log("\n4. Testing Ingredient Management CRUD:");

    // Create ingredient
    const createIngRes = await fetch(`${BASE_URL}/api/admin/ingredients`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientCode: "ING-ADM-RICE",
        name: "Kaima Biryani Rice",
        unit: "kg",
        defaultCost: 65,
      }),
    });
    assert(createIngRes.status === 201, "Admin creates ingredient (HTTP 201)");
    const ingData = await createIngRes.json();
    const ingId = ingData.ingredient.id;
    assert(ingData.ingredient.ingredientCode === "ING-ADM-RICE", "Ingredient code stored correctly");
    assert(Number(ingData.ingredient.defaultCost) === 65, "Default cost is 65.00");

    // Duplicate ingredient code
    const dupIngRes = await fetch(`${BASE_URL}/api/admin/ingredients`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientCode: "ING-ADM-RICE",
        name: "Duplicate Rice",
        unit: "kg",
        defaultCost: 70,
      }),
    });
    assert(dupIngRes.status === 409, "Duplicate ingredient code rejected with HTTP 409");

    // Update ingredient
    const updateIngRes = await fetch(`${BASE_URL}/api/admin/ingredients`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ingId,
        defaultCost: 68.50,
        isActive: true,
      }),
    });
    assert(updateIngRes.status === 200, "Admin updates ingredient cost (HTTP 200)");
    const updatedIng = await updateIngRes.json();
    assert(Number(updatedIng.ingredient.defaultCost) === 68.5, "Ingredient cost updated to 68.50");

    // -------------------------------------------------------------------------
    // 5. Basic Recipe Mapping (Product-to-Ingredient)
    // -------------------------------------------------------------------------
    console.log("\n5. Testing Recipe Component Mapping:");

    // Map ingredient to product
    const addRecipeRes = await fetch(`${BASE_URL}/api/admin/recipes`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prod1Id,
        ingredientId: ingId,
        quantityPerUnit: 0.18, // 180 grams
      }),
    });
    assert(addRecipeRes.status === 201, "Admin maps ingredient to product recipe (HTTP 201)");
    const recipeData = await addRecipeRes.json();
    const recipeItemId = recipeData.recipeItem.id;
    assert(recipeData.recipeItem.quantityPerUnit === 0.18, "Quantity per unit is 0.18");

    // Fetch product recipe
    const getRecipeRes = await fetch(`${BASE_URL}/api/admin/recipes?productId=${prod1Id}`, {
      headers: { Cookie: adminCookie },
    });
    assert(getRecipeRes.status === 200, "Admin fetches product recipe (HTTP 200)");
    const recipeList = await getRecipeRes.json();
    assert(recipeList.recipes.length === 1, "Recipe contains 1 component");
    assert(recipeList.recipes[0].ingredientCode === "ING-ADM-RICE", "Component code matches mapped ingredient");

    // Delete recipe item
    const delRecipeRes = await fetch(`${BASE_URL}/api/admin/recipes?id=${recipeItemId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    assert(delRecipeRes.status === 200, "Admin deletes recipe component (HTTP 200)");

    const verifyDelRecipe = await prisma.recipeItem.findUnique({ where: { id: recipeItemId } });
    assert(verifyDelRecipe === null, "Recipe item removed from PostgreSQL");

    // -------------------------------------------------------------------------
    // 6. Cleanup Test Fixtures
    // -------------------------------------------------------------------------
    await prisma.outletProductSetting.deleteMany({ where: { productId: { in: [prod1Id, prod2Id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [prod1Id, prod2Id] } } });
    await prisma.ingredient.deleteMany({ where: { id: ingId } });
    await prisma.department.deleteMany({ where: { id: deptId } });
  } catch (err) {
    console.error("❌ Exception during admin verification:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n==================================================`);
  console.log(`Admin Master Data Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminMasterDataVerification();
