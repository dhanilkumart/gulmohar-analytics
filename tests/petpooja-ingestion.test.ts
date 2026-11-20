/**
 * Unit Test Suite for Petpooja Ingestion Service (Stage 3C)
 *
 * Runs completely in-memory using a mock transactional Prisma client.
 * Does not connect to or modify production/staging PostgreSQL databases.
 *
 * Covers:
 * 1. Creating a new order with line items.
 * 2. Reprocessing the exact same order without creating duplicates (idempotency).
 * 3. Updating an existing order (modifying totals, timestamps).
 * 4. Updating an order to Cancelled status.
 * 5. Atomic line-item replacement without duplication.
 * 6. Preserving unmatched products with productId = null.
 * 7. Preserving null financial values (never converted to 0).
 * 8. Transaction rollback when line-item insertion fails.
 * 9. Per-order isolation: one corrupted order in a batch does not roll back valid orders.
 *
 * Execute with:
 *   npx tsx tests/petpooja-ingestion.test.ts
 */

import { Prisma } from "@prisma/client";
import {
  PetpoojaIngestionService,
  IngestionPrismaClient,
  IngestionTransactionClient,
} from "../src/lib/petpooja/ingestion-service";
import { PetpoojaResolver, ResolverPrismaClient } from "../src/lib/petpooja/resolver";
import { NormalizedSalesOrder } from "../src/types/petpooja";

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
// In-Memory Database Simulator for Testing
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
  public orders: Map<string, DbSalesOrder> = new Map(); // Key: `${outletId}_${petpoojaOrderId}`
  public items: DbSalesOrderItem[] = [];
  public failNextCreateMany = false;

  private generateId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
  }

  public getTransactionClient(): IngestionTransactionClient {
    // Snapshot state in case of rollback
    const ordersSnapshot = new Map(this.orders);
    const itemsSnapshot = [...this.items];

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
            const updatedOrder: DbSalesOrder = {
              ...existing,
              ...update,
            };
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
          if (this.failNextCreateMany) {
            throw new Error("Simulated line-item insertion constraint failure");
          }
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
        const ordersSnapshot = new Map(this.orders);
        const itemsSnapshot = [...this.items];
        const txClient = this.getTransactionClient();
        try {
          return await fn(txClient);
        } catch (err) {
          // Rollback on failure
          this.orders = ordersSnapshot;
          this.items = itemsSnapshot;
          throw err;
        }
      },
      salesOrder: this.getTransactionClient().salesOrder,
      salesOrderItem: this.getTransactionClient().salesOrderItem,
    };
  }
}

// -----------------------------------------------------------------------------
// Synthetic Resolver Fixtures
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

// -----------------------------------------------------------------------------
// Sample Order Factory
// -----------------------------------------------------------------------------
function buildNormalizedOrder(overrides?: Partial<NormalizedSalesOrder>): NormalizedSalesOrder {
  return {
    petpoojaRestId: "9780nusx",
    petpoojaOrderId: "58322",
    refId: "9919181663",
    orderDate: "2026-11-17",
    orderedAt: new Date("2026-11-17T17:05:41.000Z"),
    orderType: "Dine In",
    status: "Success",
    orderFrom: "POS",
    coreTotal: new Prisma.Decimal("1032.00"),
    taxTotal: new Prisma.Decimal("51.60"),
    discountTotal: new Prisma.Decimal("0.00"),
    totalAmount: new Prisma.Decimal("1084.00"),
    roundOff: new Prisma.Decimal("0.40"),
    paymentType: "Cash",
    serviceCharge: null,
    deliveryCharges: null,
    containerCharges: null,
    items: [
      {
        itemIndex: 0,
        petpoojaItemId: "1318297226",
        petpoojaItemCode: "110", // Maps to prod-roti-001
        itemName: "Butter Roti",
        quantity: new Prisma.Decimal("4.000"),
        unitPrice: new Prisma.Decimal("48.00"),
        totalAmount: new Prisma.Decimal("192.00"),
        itemTax: new Prisma.Decimal("9.60"),
        itemDiscount: new Prisma.Decimal("0.00"),
      },
    ],
    ...overrides,
  };
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PETPOOJA INGESTION SERVICE UNIT TESTS (STAGE 3C)");
  console.log("==================================================================");

  // 1. Create a new order with line items
  await test("Creates a new SalesOrder and child SalesOrderItem records", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const order = buildNormalizedOrder();
    const result = await service.ingestOrder(order);

    assert(result.success, "Ingestion must succeed");
    if (result.success) {
      assertEquals(result.status, "created", "Status must be created");
      assertEquals(result.itemCount, 1, "Item count is 1");
      assertEquals(result.unmappedItemCount, 0, "Unmapped count is 0");
    }

    assertEquals(db.orders.size, 1, "Exactly 1 order in DB");
    assertEquals(db.items.length, 1, "Exactly 1 item in DB");

    const savedOrder = Array.from(db.orders.values())[0];
    assertEquals(savedOrder.petpoojaOrderId, "58322", "petpoojaOrderId matches");
    assertEquals(savedOrder.status, "Success", "Status matches");
    assertEquals(savedOrder.totalAmount?.toFixed(2), "1084.00", "Total amount matches");
    assertEquals(savedOrder.matchingStatus, "matched", "Matching status is matched");

    const savedItem = db.items[0];
    assertEquals(savedItem.productId, "prod-roti-001", "Product mapped via itemcode 110");
    assertEquals(savedItem.quantity.toFixed(3), "4.000", "Quantity matches");
  });

  // 2. Reprocessing the same order without creating duplicates (Idempotency)
  await test("Reprocessing the same order updates in-place without creating duplicate rows", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const order = buildNormalizedOrder();

    // First ingestion (created)
    const res1 = await service.ingestOrder(order);
    assertEquals(res1.status, "created", "First pass: created");

    // Second ingestion with identical payload (updated)
    const res2 = await service.ingestOrder(order);
    assertEquals(res2.status, "updated", "Second pass: updated");

    assertEquals(db.orders.size, 1, "Still exactly 1 order in DB");
    assertEquals(db.items.length, 1, "Still exactly 1 item in DB (no duplicates)");
  });

  // 3. Updating an existing order with modified totals
  await test("Updates existing order totals and financial values accurately", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const initial = buildNormalizedOrder({
      discountTotal: new Prisma.Decimal("0.00"),
      totalAmount: new Prisma.Decimal("1084.00"),
    });
    await service.ingestOrder(initial);

    // Operator applies Rs 100 discount post-billing
    const updated = buildNormalizedOrder({
      discountTotal: new Prisma.Decimal("100.00"),
      totalAmount: new Prisma.Decimal("984.00"),
    });
    const res = await service.ingestOrder(updated);

    assertEquals(res.status, "updated", "Updated in place");
    const saved = Array.from(db.orders.values())[0];
    assertEquals(saved.discountTotal?.toFixed(2), "100.00", "Updated discount preserved");
    assertEquals(saved.totalAmount?.toFixed(2), "984.00", "Updated total amount preserved");
  });

  // 4. Updating an order to Cancelled status
  await test("Updates an existing order to Cancelled status", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    // Initial success order
    await service.ingestOrder(buildNormalizedOrder({ status: "Success" }));

    // Voided / Cancelled order re-ingested
    const cancelled = buildNormalizedOrder({ status: "Cancelled" });
    const res = await service.ingestOrder(cancelled);

    assertEquals(res.status, "updated", "Updated status to Cancelled");
    const saved = Array.from(db.orders.values())[0];
    assertEquals(saved.status, "Cancelled", "Status in DB is now Cancelled");
  });

  // 5. Line-item replacement without duplication
  await test("Replaces line items cleanly when order item count changes", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    // Order initially has 1 item
    const orderV1 = buildNormalizedOrder();
    await service.ingestOrder(orderV1);
    assertEquals(db.items.length, 1, "Initial 1 item");

    // Order updated to have 2 items
    const orderV2 = buildNormalizedOrder({
      items: [
        orderV1.items[0],
        {
          itemIndex: 1,
          petpoojaItemId: "item-dosa-99",
          petpoojaItemCode: "P006",
          itemName: "Masala Dosa",
          quantity: new Prisma.Decimal("1.000"),
          unitPrice: new Prisma.Decimal("120.00"),
          totalAmount: new Prisma.Decimal("120.00"),
          itemTax: null,
          itemDiscount: null,
        },
      ],
    });

    await service.ingestOrder(orderV2);
    assertEquals(db.items.length, 2, "Items replaced: now exactly 2 items in DB");
    assert(
      db.items.some((it) => it.productId === "prod-dosa-002"),
      "Second item mapped"
    );
  });

  // 6. Preserving unmatched products with productId = null
  await test("Preserves unmapped line items with productId = null without failing order", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orderWithUnmapped = buildNormalizedOrder({
      items: [
        {
          itemIndex: 0,
          petpoojaItemId: "unmapped-pos-id",
          petpoojaItemCode: "UNMAPPED-SKU",
          itemName: "Seasonal Exotic Shake",
          quantity: new Prisma.Decimal("1.000"),
          unitPrice: new Prisma.Decimal("150.00"),
          totalAmount: new Prisma.Decimal("150.00"),
          itemTax: null,
          itemDiscount: null,
        },
      ],
    });

    const res = await service.ingestOrder(orderWithUnmapped);
    assert(res.success, "Order with unmapped item must succeed");
    if (res.success) {
      assertEquals(res.unmappedItemCount, 1, "1 unmapped item recorded");
    }

    const savedOrder = Array.from(db.orders.values())[0];
    assertEquals(savedOrder.matchingStatus, "unmatched", "Matching status set to unmatched");

    const savedItem = db.items[0];
    assertEquals(savedItem.productId, null, "productId is null in DB");
    assertEquals(savedItem.itemName, "Seasonal Exotic Shake", "Original name preserved");
    assertEquals(savedItem.totalAmount.toFixed(2), "150.00", "Amount preserved");
  });

  // 7. Preserving null financial values (never converted to 0)
  await test("Preserves null financial values in SalesOrder header", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const orderWithNulls = buildNormalizedOrder({
      coreTotal: null,
      taxTotal: null,
      discountTotal: null,
      totalAmount: null,
    });

    const res = await service.ingestOrder(orderWithNulls);
    assert(res.success, "Order with null totals succeeds");

    const saved = Array.from(db.orders.values())[0];
    assertEquals(saved.coreTotal, null, "coreTotal is null");
    assertEquals(saved.taxTotal, null, "taxTotal is null");
    assertEquals(saved.discountTotal, null, "discountTotal is null");
    assertEquals(saved.totalAmount, null, "totalAmount is null");
  });

  // 8. Transaction rollback when line-item insertion fails
  await test("Rolls back order header update when line-item creation fails in transaction", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    // Initial valid state
    await service.ingestOrder(buildNormalizedOrder());
    assertEquals(db.orders.size, 1, "1 order before failure test");

    // Force failure on next createMany
    db.failNextCreateMany = true;

    // Attempt to update with a modified order
    const updated = buildNormalizedOrder({
      totalAmount: new Prisma.Decimal("99999.00"),
    });

    const res = await service.ingestOrder(updated);
    assertEquals(res.success, false, "Ingestion must report failure");
    if (!res.success) {
      assert(
        res.error.includes("Simulated line-item insertion constraint failure"),
        "Contains failure error"
      );
    }

    // Rollback check: order totalAmount must NOT have been changed to 99999.00
    const currentOrder = Array.from(db.orders.values())[0];
    assertEquals(
      currentOrder.totalAmount?.toFixed(2),
      "1084.00",
      "Rolled back to original totalAmount"
    );
  });

  // 9. Batch isolation: One failed order does not corrupt other orders
  await test("Batch ingestion continues on order failure without corrupting other orders", async () => {
    const db = new MockPrismaDatabase();
    const resolver = new PetpoojaResolver(createMockResolverPrisma());
    const service = new PetpoojaIngestionService(db.createPrismaClient(), resolver);

    const order1 = buildNormalizedOrder({ petpoojaOrderId: "order-batch-1" });
    const order2CorruptRestId = buildNormalizedOrder({
      petpoojaOrderId: "order-batch-2",
      petpoojaRestId: "unmapped-outlet-restid", // Will fail outlet resolution
    });
    const order3 = buildNormalizedOrder({ petpoojaOrderId: "order-batch-3" });

    const stats = await service.ingestBatch([order1, order2CorruptRestId, order3]);

    assertEquals(stats.totalReceived, 3, "Received 3 orders");
    assertEquals(stats.created, 2, "2 orders created successfully");
    assertEquals(stats.failed, 1, "1 order failed");
    assertEquals(db.orders.size, 2, "2 orders successfully persisted in DB");
    assert(db.orders.has(`${OUTLET_KOZ1.id}_order-batch-1`), "Order 1 persisted");
    assert(db.orders.has(`${OUTLET_KOZ1.id}_order-batch-3`), "Order 3 persisted");
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

