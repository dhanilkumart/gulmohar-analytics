/**
 * Unit Test Suite for Petpooja Outlet & Product Resolver (Stage 3B)
 *
 * Runs completely in-memory using a mock Prisma client.
 * Does not modify production database records or configuration.
 *
 * Covers:
 * 1. Successful outlet resolution via petpoojaRestId.
 * 2. Unmapped / non-existent restId (structured OUTLET_UNMAPPED).
 * 3. Inactive outlet rejection (OUTLET_UNMAPPED).
 * 4. Priority 1: Successful outlet-specific product mapping via OutletProductSetting.petpoojaItemId.
 * 5. Priority 2: Successful organization-level product-code fallback via Product.productCode.
 * 6. Priority Check: Outlet-specific mapping taking priority over org-level product code when both exist.
 * 7. Priority 3: Unmatched product returns productId: null without failing.
 * 8. Organization isolation: Preventing cross-organization product matching.
 * 9. In-memory batch context resolution produces identical results without DB queries.
 *
 * Execute with:
 *   npx tsx tests/petpooja-resolver.test.ts
 */

import {
  PetpoojaResolver,
  ResolverPrismaClient,
  ResolvedOutlet,
} from "../src/lib/petpooja/resolver";

// -----------------------------------------------------------------------------
// Test Runner Harness
// -----------------------------------------------------------------------------
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
// Synthetic Database State Fixtures
// -----------------------------------------------------------------------------
const ORG_1_ID = "org-gulmohar-001";
const ORG_2_ID = "org-otherchain-002";

const OUTLET_KOZ1 = {
  id: "outlet-koz-001",
  organizationId: ORG_1_ID,
  code: "KOZ-001",
  name: "Ashirvad Gulmohar - Kozhikode 1",
  petpoojaRestId: "9780nusx",
  isActive: true,
};

const OUTLET_INACTIVE = {
  id: "outlet-closed-002",
  organizationId: ORG_1_ID,
  code: "KOZ-CLOSED",
  name: "Ashirvad Gulmohar - Closed",
  petpoojaRestId: "inactive-rest-id",
  isActive: false,
};

// Organization 1 Products (Gulmohar)
const PRODUCTS_ORG_1 = [
  { id: "prod-roti-001", organizationId: ORG_1_ID, productCode: "110", name: "Butter Roti" },
  { id: "prod-dosa-002", organizationId: ORG_1_ID, productCode: "P006", name: "Masala Dosa" },
  { id: "prod-special-003", organizationId: ORG_1_ID, productCode: "SPEC-01", name: "Spec Roti" },
];

// Organization 2 Products (Different Organization - Same product code "110")
const PRODUCTS_ORG_2 = [
  { id: "prod-other-roti-999", organizationId: ORG_2_ID, productCode: "110", name: "Other Org Roti" },
];

// Outlet-Specific Mappings for KOZ-001
const OUTLET_SETTINGS_KOZ1 = [
  // Maps petpoojaItemId "1318297226" specifically to prod-special-003, overriding its normal code "110"
  {
    id: "setting-1",
    outletId: OUTLET_KOZ1.id,
    productId: "prod-special-003",
    petpoojaItemId: "1318297226",
  },
  // Maps petpoojaItemId "pos-custom-99" to prod-dosa-002
  {
    id: "setting-2",
    outletId: OUTLET_KOZ1.id,
    productId: "prod-dosa-002",
    petpoojaItemId: "pos-custom-99",
  },
];

/**
 * Creates a mock Prisma Client honoring exact Prisma query signatures.
 */
function createMockPrisma(): ResolverPrismaClient {
  const outlets = [OUTLET_KOZ1, OUTLET_INACTIVE];
  const products = [...PRODUCTS_ORG_1, ...PRODUCTS_ORG_2];
  const settings = [...OUTLET_SETTINGS_KOZ1];

  return {
    outlet: {
      findUnique: async ({ where }: any) => {
        if (where.petpoojaRestId) {
          const found = outlets.find((o) => o.petpoojaRestId === where.petpoojaRestId);
          return found ? { ...found } : null;
        }
        return null;
      },
    } as any,

    outletProductSetting: {
      findFirst: async ({ where }: any) => {
        const found = settings.find(
          (s) => s.outletId === where.outletId && s.petpoojaItemId === where.petpoojaItemId
        );
        return found ? { productId: found.productId } : null;
      },
      findMany: async ({ where }: any) => {
        return settings
          .filter((s) => s.outletId === where.outletId && s.petpoojaItemId !== null)
          .map((s) => ({ productId: s.productId, petpoojaItemId: s.petpoojaItemId }));
      },
    } as any,

    product: {
      findUnique: async ({ where }: any) => {
        if (where.organizationId_productCode) {
          const { organizationId, productCode } = where.organizationId_productCode;
          const found = products.find(
            (p) => p.organizationId === organizationId && p.productCode === productCode
          );
          return found ? { id: found.id } : null;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        return products
          .filter((p) => p.organizationId === where.organizationId)
          .map((p) => ({ id: p.id, productCode: p.productCode }));
      },
    } as any,
  };
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PETPOOJA RESOLVER UNIT TESTS (STAGE 3B)");
  console.log("==================================================================");

  const mockPrisma = createMockPrisma();
  const resolver = new PetpoojaResolver(mockPrisma);

  const resolvedKoz1Outlet: ResolvedOutlet = {
    outletId: OUTLET_KOZ1.id,
    organizationId: OUTLET_KOZ1.organizationId,
    outletCode: OUTLET_KOZ1.code,
    outletName: OUTLET_KOZ1.name,
  };

  // 1. Successful Outlet Resolution
  await test("Resolves outlet successfully when petpoojaRestId matches active outlet", async () => {
    const res = await resolver.resolveOutlet("9780nusx");
    assert(res.success, "Should succeed for 9780nusx");
    if (res.success) {
      assertEquals(res.outlet.outletId, OUTLET_KOZ1.id, "outletId matches");
      assertEquals(res.outlet.organizationId, ORG_1_ID, "organizationId matches");
      assertEquals(res.outlet.outletCode, "KOZ-001", "outletCode matches");
    }
  });

  // 2. Unmapped Outlet Handling
  await test("Returns OUTLET_UNMAPPED when restID does not exist in database", async () => {
    const res = await resolver.resolveOutlet("unmapped-rest-id-999");
    assertEquals(res.success, false, "Should fail for unmapped restId");
    if (!res.success) {
      assertEquals(res.code, "OUTLET_UNMAPPED", "Error code must be OUTLET_UNMAPPED");
      assert(res.message.includes("No active outlet found"), "Explanatory message");
      assertEquals(res.restId, "unmapped-rest-id-999", "Echoes unmapped restId");
    }
  });

  // 3. Inactive Outlet Rejection
  await test("Returns OUTLET_UNMAPPED when outlet is inactive in database", async () => {
    const res = await resolver.resolveOutlet("inactive-rest-id");
    assertEquals(res.success, false, "Should fail for inactive outlet");
    if (!res.success) {
      assertEquals(res.code, "OUTLET_UNMAPPED", "Error code must be OUTLET_UNMAPPED");
      assert(res.message.includes("is inactive"), "Explanatory message mentions inactive");
    }
  });

  // 4. Priority 1: Outlet-Specific Product Mapping (via OutletProductSetting.petpoojaItemId)
  await test("Resolves product via Priority 1 (OutletProductSetting.petpoojaItemId)", async () => {
    // pos-custom-99 does not match any productCode, but matches setting for KOZ-001 -> prod-dosa-002
    const res = await resolver.resolveProduct(resolvedKoz1Outlet, {
      petpoojaItemId: "pos-custom-99",
      petpoojaItemCode: "NO-CODE",
      itemName: "Custom Dosa at POS",
    });

    assertEquals(res.productId, "prod-dosa-002", "Matches setting productId");
    assertEquals(res.matchMethod, "outlet_setting_item_id", "Match method is Priority 1");
  });

  // 5. Priority 2: Org-Level Product Code Fallback (via Product.productCode)
  await test("Falls back to Priority 2 (Product.productCode) when no outlet setting exists", async () => {
    // petpoojaItemId "unknown-item-id", but productCode "P006" exists in Org 1
    const res = await resolver.resolveProduct(resolvedKoz1Outlet, {
      petpoojaItemId: "unknown-item-id",
      petpoojaItemCode: "P006",
      itemName: "Masala Dosa",
    });

    assertEquals(res.productId, "prod-dosa-002", "Matches org product code");
    assertEquals(res.matchMethod, "org_product_code", "Match method is Priority 2");
  });

  // 6. Outlet-Specific Mapping Priority Over Org-Level Fallback
  await test("Outlet-specific setting overrides org-level product code when both exist", async () => {
    // Item has petpoojaItemId "1318297226" (mapped in settings to prod-special-003)
    // AND productCode "110" (mapped in org products to prod-roti-001)
    // Priority 1 MUST WIN (prod-special-003, not prod-roti-001)
    const res = await resolver.resolveProduct(resolvedKoz1Outlet, {
      petpoojaItemId: "1318297226",
      petpoojaItemCode: "110",
      itemName: "Butter Roti Special",
    });

    assertEquals(res.productId, "prod-special-003", "Priority 1 setting must override org code");
    assertEquals(res.matchMethod, "outlet_setting_item_id", "Match method is Priority 1");
  });

  // 7. Priority 3: Unmatched Fallback (productId: null without crashing)
  await test("Returns productId: null and 'unmatched' when item cannot be mapped", async () => {
    const res = await resolver.resolveProduct(resolvedKoz1Outlet, {
      petpoojaItemId: "unmapped-9999",
      petpoojaItemCode: "UNMAPPED-SKU",
      itemName: "Seasonal Unmapped Juice",
    });

    assertEquals(res.productId, null, "Unmatched productId is null");
    assertEquals(res.matchMethod, "unmatched", "Match method is unmatched");
    assertEquals(res.petpoojaItemCode, "UNMAPPED-SKU", "Preserves original SKU");
    assertEquals(res.itemName, "Seasonal Unmapped Juice", "Preserves original item name");
  });

  // 8. Preventing Cross-Organization Product Matching
  await test("Strictly prevents matching products belonging to another organization", async () => {
    // Outlet in Org 2
    const outletOrg2: ResolvedOutlet = {
      outletId: "outlet-org-2",
      organizationId: ORG_2_ID,
      outletCode: "ORG2-001",
      outletName: "Other Chain Outlet",
    };

    // Item code "P006" exists only in Org 1, NOT in Org 2
    const res = await resolver.resolveProduct(outletOrg2, {
      petpoojaItemId: "some-item-id",
      petpoojaItemCode: "P006",
      itemName: "Masala Dosa",
    });

    // Should NOT match prod-dosa-002 because that belongs to Org 1
    assertEquals(res.productId, null, "Must not match product from Org 1 for Org 2 outlet");
    assertEquals(res.matchMethod, "unmatched", "Remains unmatched");
  });

  // 9. In-Memory Batch Context Resolution
  await test("Context-based batch resolution produces identical results without DB roundtrips", async () => {
    const context = await resolver.buildOutletResolutionContext(resolvedKoz1Outlet);

    // 1. Setting match
    const r1 = resolver.resolveProductWithContext(context, {
      petpoojaItemId: "1318297226",
      petpoojaItemCode: "110",
      itemName: "Butter Roti Special",
    });
    assertEquals(r1.productId, "prod-special-003", "Setting match in context");
    assertEquals(r1.matchMethod, "outlet_setting_item_id", "Method is setting");

    // 2. Org code fallback match
    const r2 = resolver.resolveProductWithContext(context, {
      petpoojaItemId: "some-unmapped-id",
      petpoojaItemCode: "110",
      itemName: "Standard Butter Roti",
    });
    assertEquals(r2.productId, "prod-roti-001", "Org code match in context");
    assertEquals(r2.matchMethod, "org_product_code", "Method is org_product_code");

    // 3. Unmatched
    const r3 = resolver.resolveProductWithContext(context, {
      petpoojaItemId: "unmapped-id",
      petpoojaItemCode: "UNMAPPED-CODE",
      itemName: "Random Item",
    });
    assertEquals(r3.productId, null, "Unmatched in context");
    assertEquals(r3.matchMethod, "unmatched", "Method is unmatched");
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

