/**
 * Unit Test Suite for Petpooja Synchronization Orchestrator (Stage 3D)
 *
 * Runs completely in-memory using mocked dependencies.
 * Zero database connections, zero network requests, zero live API calls.
 *
 * Covers:
 * 1. Successful end-to-end synchronization.
 * 2. Multi-page pagination workflow.
 * 3. Handling unmapped outlet gracefully without crashing the pipeline.
 * 4. Handling unmatched products (ingested as productId: null).
 * 5. Handling invalid orders during normalization (isolated, does not corrupt valid orders).
 * 6. Handling API client-level failure (HTTP error / credentials).
 * 7. Repeated synchronization without creating duplicates (idempotency).
 *
 * Execute with:
 *   npx tsx tests/petpooja-sync.test.ts
 */

import { Prisma } from "@prisma/client";
import { PetpoojaSyncOrchestrator } from "../src/lib/petpooja/sync";
import { PetpoojaGetOrdersClient } from "../src/lib/petpooja/get-orders-client";
import { PetpoojaResolver, ResolverPrismaClient } from "../src/lib/petpooja/resolver";
import {
  PetpoojaIngestionService,
  IngestionPrismaClient,
  IngestionTransactionClient,
} from "../src/lib/petpooja/ingestion-service";
import { PetpoojaPullOrderEntry } from "../src/types/petpooja";

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
// In-Memory Database Simulator
// -----------------------------------------------------------------------------
interface DbSalesOrder {
  id: string;
  outletId: string;
  petpoojaOrderId: string;
  orderDate: Date;
  orderedAt: Date;
  orderType: string;
  status: string;
  coreTotal: Prisma.Decimal | null;
  taxTotal: Prisma.Decimal | null;
  discountTotal: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal | null;
  financialStatus: string;
  matchingStatus: string;
}

interface DbSalesOrderItem {
  id: string;
  salesOrderId: string;
  productId: string | null;
  itemName: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  itemTax: Prisma.Decimal | null;
  itemDiscount: Prisma.Decimal | null;
}

class MockPrismaDatabase {
  public orders: Map<string, DbSalesOrder> = new Map();
  public items: DbSalesOrderItem[] = [];

  private generateId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
  }

  public getTransactionClient(): IngestionTransactionClient {
    return {
      salesOrder: {
        findUnique: async ({ where }: any) => {
          if (where.outletId_petpoojaOrderId) {
            const key = `${where.outletId_petpoojaOrderId.outletId}_${where.outletId_petpoojaOrderId.petpoojaOrderId}`;
            const found = this.orders.get(key);
            return found ? { ...found } : null;
          }
          return null;
        },
        upsert: async ({ where, create, update }: any) => {
          const key = `${where.outletId_petpoojaOrderId.outletId}_${where.outletId_petpoojaOrderId.petpoojaOrderId}`;
          const existing = this.orders.get(key);
          if (existing) {
            const updatedOrder: DbSalesOrder = { ...existing, ...update };
            this.orders.set(key, updatedOrder);
            return { ...updatedOrder };
          } else {
            const newOrder: DbSalesOrder = {
              id: this.generateId("order"),
              ...create,
            };
            this.orders.set(key, newOrder);
            return { ...newOrder };
          }
        },
      },
      salesOrderItem: {
        deleteMany: async ({ where }: any) => {
          const before = this.items.length;
          this.items = this.items.filter((item) => item.salesOrderId !== where.salesOrderId);
          return { count: before - this.items.length };
        },
        createMany: async ({ data }: any) => {
          const created = data.map((d: any) => ({
            id: this.generateId("item"),
            ...d,
          }));
          this.items.push(...created);
          return { count: created.length };
        },
      },
    };
  }

  public createPrismaClient(): IngestionPrismaClient {
    return {
      $transaction: async <T>(fn: (tx: IngestionTransactionClient) => Promise<T>): Promise<T> => {
        const txClient = this.getTransactionClient();
        return await fn(txClient);
      },
      salesOrder: this.getTransactionClient().salesOrder,
      salesOrderItem: this.getTransactionClient().salesOrderItem,
    };
  }
}

// -----------------------------------------------------------------------------
// Fixtures & Resolver Setup
// -----------------------------------------------------------------------------
const ORG_ID = "org-gulmohar-001";
const OUTLET_KOZ1 = {
  id: "outlet-koz-001",
  organizationId: ORG_ID,
  code: "KOZ-001",
  name: "Ashirvad Gulmohar - Kozhikode 1",
  petpoojaRestId: "9780nusx",
  isActive: true,
};

const PRODUCTS = [
  { id: "prod-roti-001", organizationId: ORG_ID, productCode: "110", name: "Butter Roti" },
  { id: "prod-dosa-002", organizationId: ORG_ID, productCode: "P006", name: "Masala Dosa" },
];

function createMockResolverPrisma(): ResolverPrismaClient {
  return {
    outlet: {
      findUnique: async ({ where }: any) => {
        if (where.petpoojaRestId === OUTLET_KOZ1.petpoojaRestId) return { ...OUTLET_KOZ1 };
        return null;
      },
    } as any,
    outletProductSetting: {
      findFirst: async () => null,
      findMany: async () => [],
    } as any,
    product: {
      findUnique: async ({ where }: any) => {
        if (where.organizationId_productCode) {
          const { productCode } = where.organizationId_productCode;
          const found = PRODUCTS.find((p) => p.productCode === productCode);
          return found ? { id: found.id } : null;
        }
        return null;
      },
      findMany: async () => PRODUCTS.map((p) => ({ id: p.id, productCode: p.productCode })),
    } as any,
  };
}

function createSyntheticRawOrder(
  orderIdNum: number,
  refId: string,
  overrides?: Partial<PetpoojaPullOrderEntry["Order"]>
): PetpoojaPullOrderEntry {
  return {
    Restaurant: {
      restaurantid: "57175",
      res_name: "GULMOHAR RESTAURANT",
      address: "Calicut Road",
      contact_information: "0495-123456",
      restID: "9780nusx",
    },
    Customer: {
      name: `Customer ${orderIdNum}`,
      address: "Customer Address",
      phone: "9876543210",
    },
    Order: {
      orderID: String(orderIdNum),
      refId,
      delivery_charges: "0",
      order_type: "Dine In",
      payment_type: "Cash",
      discount_total: "0",
      tax_total: "10",
      round_off: "0",
      core_total: "200",
      total: "210",
      created_on: "2026-11-17 12:30:00",
      order_from: "POS",
      order_date: "2026-11-17",
      status: "Success",
      ...overrides,
    },
    OrderItem: [
      {
        itemid: `item-${orderIdNum}`,
        itemcode: "110", // Maps to prod-roti-001
        name: "Butter Roti",
        price: "100",
        quantity: "2",
        total: "200",
        total_discount: 0,
        total_tax: 10,
      },
    ],
  };
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PETPOOJA SYNC ORCHESTRATOR UNIT TESTS (STAGE 3D)");
  console.log("==================================================================");

  const mockClientConfig = {
    endpointUrl: "https://api.petpooja.com/V1/thirdparty/generic_get_orders/",
    appKey: "test-app-key",
    appSecret: "test-app-secret",
    accessToken: "test-access-token",
    restId: "9780nusx",
    apiCookie: "test-cookie=abc123xyz;",
  };

  // 1. Successful End-to-End Synchronization
  await test("Runs complete end-to-end sync for an operational date successfully", async () => {
    const rawOrders = [
      createSyntheticRawOrder(101, "ref-101"),
      createSyntheticRawOrder(102, "ref-102"),
    ];

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    // Mock fetchAllOrders to return 2 orders in 1 page
    client.fetchAllOrders = async () => ({
      orders: rawOrders,
      totalOrders: 2,
      pagesFetched: 1,
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    assert(result.success, "Sync must report success");
    assertEquals(result.orderDate, "2026-11-17", "Order date matches");
    assertEquals(result.pagesFetched, 1, "1 page fetched");
    assertEquals(result.totalOrdersReceived, 2, "2 orders received");
    assertEquals(result.created, 2, "2 orders created in DB");
    assertEquals(result.failed, 0, "0 failures");
    assertEquals(result.unmappedItems, 0, "0 unmapped items");
    assertEquals(db.orders.size, 2, "2 orders stored in DB");
  });

  // 2. Multi-Page Pagination Flow
  await test("Synchronizes multiple pages seamlessly", async () => {
    // 3 orders across 2 simulated pages
    const rawOrders = [
      createSyntheticRawOrder(201, "ref-201"),
      createSyntheticRawOrder(202, "ref-202"),
      createSyntheticRawOrder(203, "ref-203"),
    ];

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => ({
      orders: rawOrders,
      totalOrders: 3,
      pagesFetched: 2, // 2 pages simulated
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    assert(result.success, "Sync must succeed");
    assertEquals(result.pagesFetched, 2, "Reported 2 pages fetched");
    assertEquals(result.created, 3, "3 orders created");
    assertEquals(db.orders.size, 3, "3 orders in DB");
  });

  // 3. Handling Unmapped Outlet
  await test("Records error and marks failure for order with unmapped outlet", async () => {
    const orderWithBadRestId = createSyntheticRawOrder(301, "ref-301");
    orderWithBadRestId.Restaurant.restID = "unmapped-outlet-999";

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => ({
      orders: [orderWithBadRestId],
      totalOrders: 1,
      pagesFetched: 1,
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    assertEquals(result.failed, 1, "1 failed order");
    assertEquals(result.created, 0, "0 created orders");
    assert(
      result.errors.some(
        (e) =>
          e.stage === "ingestion" &&
          (e.message.includes("OUTLET_UNMAPPED") || e.message.includes("Failed to resolve outlet"))
      ),
      "Includes outlet resolution error"
    );
  });

  // 4. Handling Unmatched Products
  await test("Ingests orders with unmapped items and records unmappedItems count", async () => {
    const rawOrder = createSyntheticRawOrder(401, "ref-401");
    rawOrder.OrderItem = [
      {
        itemid: "unmapped-id",
        itemcode: "UNKNOWN-CODE",
        name: "Special Shake",
        price: "150",
        quantity: "1",
        total: "150",
      },
    ];

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => ({
      orders: [rawOrder],
      totalOrders: 1,
      pagesFetched: 1,
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    assert(result.success, "Sync succeeds with unmapped items");
    assertEquals(result.created, 1, "Order created");
    assertEquals(result.unmappedItems, 1, "1 unmapped item recorded");

    const savedItem = db.items[0];
    assertEquals(savedItem.productId, null, "Item stored with productId null");
    assertEquals(savedItem.itemName, "Special Shake", "Item name preserved");
  });

  // 5. Handling Invalid Orders during Normalization (Per-Order Isolation)
  await test("Normalizer error on one corrupted order does not block valid orders", async () => {
    const validOrder = createSyntheticRawOrder(501, "ref-501");
    const corruptedOrder = createSyntheticRawOrder(502, "ref-502", {
      order_date: "invalid-calendar-date", // Fatal normalization error
    });

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => ({
      orders: [validOrder, corruptedOrder],
      totalOrders: 2,
      pagesFetched: 1,
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    // Partial success: 1 created, 1 failed
    assertEquals(result.totalOrdersReceived, 2, "2 orders received");
    assertEquals(result.created, 1, "1 valid order created in DB");
    assertEquals(result.failed, 1, "1 corrupted order failed");
    assert(
      result.errors.some((e) => e.stage === "normalization"),
      "Includes normalization error"
    );
    assertEquals(db.orders.size, 1, "Only the valid order is in DB");
  });

  // 6. Handling API Client Failures (e.g. Network/Authentication)
  await test("Handles top-level API failures gracefully and returns structured error", async () => {
    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => {
      throw new Error("HTTP 401: Unauthorized API credentials");
    };

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);
    const result = await orchestrator.syncDate("2026-11-17");

    assertEquals(result.success, false, "Must report failure on API error");
    assertEquals(result.totalOrdersReceived, 0, "0 orders received");
    assertEquals(result.created, 0, "0 orders created");
    assert(
      result.errors.some((e) => e.stage === "api" && e.message.includes("HTTP 401")),
      "Includes API stage error"
    );
  });

  // 7. Repeated Synchronization (Idempotency Check)
  await test("Repeated synchronization updates in place without duplicating records", async () => {
    const rawOrders = [createSyntheticRawOrder(701, "ref-701")];

    const client = new PetpoojaGetOrdersClient(mockClientConfig);
    client.fetchAllOrders = async () => ({
      orders: rawOrders,
      totalOrders: 1,
      pagesFetched: 1,
      hasMore: false,
    });

    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const ingestion = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orchestrator = new PetpoojaSyncOrchestrator(client, resolver, ingestion);

    // Run 1: Created
    const res1 = await orchestrator.syncDate("2026-11-17");
    assertEquals(res1.created, 1, "First sync: 1 created");
    assertEquals(res1.updated, 0, "First sync: 0 updated");
    assertEquals(db.orders.size, 1, "1 order in DB");
    assertEquals(db.items.length, 1, "1 item in DB");

    // Run 2: Updated in place
    const res2 = await orchestrator.syncDate("2026-11-17");
    assertEquals(res2.created, 0, "Second sync: 0 created");
    assertEquals(res2.updated, 1, "Second sync: 1 updated");
    assertEquals(db.orders.size, 1, "Still 1 order in DB (zero duplicates)");
    assertEquals(db.items.length, 1, "Still 1 item in DB (zero duplicates)");
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
