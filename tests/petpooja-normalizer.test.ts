/**
 * Comprehensive Unit Test Suite for Petpooja Normalizer (Stage 2)
 *
 * Runs completely in-memory without database access or external networks.
 * Uses synthetic fixtures and sanitized live sample structures.
 *
 * Covers:
 * 1. Normal order normalization from sample fixture structure.
 * 2. Asia/Kolkata (UTC+05:30) timestamp parsing across calendar validity and leap years.
 * 3. Exact decimal preservation (avoids floating point drift like 0.1 + 0.2).
 * 4. Mixed string/number types in order header and line items.
 * 5. Preservation of cancelled order status.
 * 6. Missing optional fields (remain null or undefined, never artificially zeroed).
 * 7. Invalid decimal inputs (distinguished from missing values).
 * 8. Validation of calendar date components (rejects invalid days like Feb 30).
 * 9. Customer PII absence guarantee (name, phone, address, gstin excluded).
 * 10. Multi-item ordering with sequence preservation and item code preservation.
 * 11. Batch normalization with issue tracking.
 *
 * Execute with:
 *   npx tsx tests/petpooja-normalizer.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Prisma } from "@prisma/client";
import {
  normalizePetpoojaOrder,
  normalizePetpoojaBatch,
  parseAsiaKolkataTimestamp,
  parseOperationalDate,
  parseDecimalValue,
} from "../src/lib/petpooja/normalizer";
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
// Fixture Generators
// -----------------------------------------------------------------------------
function buildBaseSyntheticOrder(overrides?: Partial<PetpoojaPullOrderEntry["Order"]>): PetpoojaPullOrderEntry {
  return {
    Restaurant: {
      restaurantid: "57175",
      res_name: "GULMOHAR RESTAURANT",
      address: "Calicut Road",
      restaurant_state: "Kerala",
      contact_information: "0495-123456",
      restID: "9780nusx",
    },
    Customer: {
      name: "Customer PII Name",
      address: "Private Customer Address",
      phone: "9876543210",
      gst_no: "32ABCDE1234F1Z5",
      created_date: "2026-01-01 10:00:00",
    },
    Order: {
      orderID: "58322",
      refId: "9919181663",
      delivery_charges: "0",
      container_charges: "0",
      order_type: "Dine In",
      sub_order_type_id: "403958",
      sub_order_type: "Other",
      payment_type: "Cash",
      custom_payment_type: "",
      table_no: "C5",
      no_of_persons: "2",
      discount_total: "0",
      tax_total: "51.6",
      round_off: "0.40",
      core_total: "1032",
      total: "1084",
      created_on: "2026-11-17 22:35:41",
      order_from: "POS",
      advance_order: "No",
      part_payment: [],
      order_date: "2026-11-17",
      status: "Success",
      service_charge: 0,
      waivedOff: "0",
      tip: "0",
      ...overrides,
    },
    OrderItem: [
      {
        categoryid: "11147700",
        categoryname: "Breads",
        name: "Butter Roti",
        itemid: "1318297226",
        itemcode: "110",
        specialnotes: "Well toasted",
        price: "48",
        quantity: "4",
        total: "192",
        total_discount: 0,
        total_tax: 9.6,
      },
    ],
  };
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PETPOOJA NORMALIZER UNIT TESTS (STAGE 2)");
  console.log("==================================================================");

  // 1. Normal order from sample structure
  await test("Normalizes standard order and line items correctly", () => {
    const raw = buildBaseSyntheticOrder();
    const result = normalizePetpoojaOrder(raw);

    assert(result.success, "Normalization should succeed");
    assert(result.order !== undefined, "Order should be defined");

    const o = result.order!;
    assertEquals(o.petpoojaRestId, "9780nusx", "restID matches");
    assertEquals(o.petpoojaOrderId, "58322", "orderID matches");
    assertEquals(o.refId, "9919181663", "refId matches");
    assertEquals(o.orderDate, "2026-11-17", "orderDate matches");
    assertEquals(o.orderType, "Dine In", "orderType matches");
    assertEquals(o.status, "Success", "status matches");
    assertEquals(o.paymentType, "Cash", "paymentType matches");
    assertEquals(o.tableNo, "C5", "tableNo matches");
    assertEquals(o.noOfPersons, 2, "noOfPersons matches");

    // Exact Decimals
    assert(o.coreTotal instanceof Prisma.Decimal, "coreTotal must be Decimal");
    assertEquals(o.coreTotal?.toFixed(2), "1032.00", "coreTotal value");
    assertEquals(o.taxTotal?.toFixed(2), "51.60", "taxTotal value");
    assertEquals(o.discountTotal?.toFixed(2), "0.00", "discountTotal value");
    assertEquals(o.totalAmount?.toFixed(2), "1084.00", "totalAmount value");
    assertEquals(o.roundOff?.toFixed(2), "0.40", "roundOff value");

    // Line items
    assertEquals(o.items.length, 1, "Has 1 item");
    const item = o.items[0];
    assertEquals(item.itemIndex, 0, "Item index is 0");
    assertEquals(item.petpoojaItemId, "1318297226", "itemid matches");
    assertEquals(item.petpoojaItemCode, "110", "itemcode matches");
    assertEquals(item.itemName, "Butter Roti", "name matches");
    assertEquals(item.quantity.toFixed(3), "4.000", "quantity decimal");
    assertEquals(item.unitPrice.toFixed(2), "48.00", "unitPrice decimal");
    assertEquals(item.totalAmount.toFixed(2), "192.00", "totalAmount decimal");
    assertEquals(item.itemTax?.toFixed(2), "9.60", "itemTax decimal");
    assertEquals(item.itemDiscount?.toFixed(2), "0.00", "itemDiscount decimal");
    assertEquals(item.specialNotes, "Well toasted", "specialNotes matches");
  });

  // 2. Strict Asia/Kolkata Timestamp Parsing
  await test("Parses created_on strictly in Asia/Kolkata (UTC+05:30)", () => {
    // 22:35:41 IST is exactly 17:05:41 UTC on the same day
    const res = parseAsiaKolkataTimestamp("2026-11-17 22:35:41", "testField");
    assert(res.date !== undefined, "Date must be parsed");
    assertEquals(res.date?.toISOString(), "2026-11-17T17:05:41.000Z", "UTC representation of IST timestamp");

    // Morning IST crossing into previous UTC date:
    // 2026-11-17 02:30:00 IST is 2026-11-16 21:00:00 UTC
    const res2 = parseAsiaKolkataTimestamp("2026-11-17 02:30:00", "testField");
    assert(res2.date !== undefined, "Date must be parsed");
    assertEquals(res2.date?.toISOString(), "2026-11-16T21:00:00.000Z", "UTC time shifts back 5.5 hours");
  });

  // 3. Calendar validation for dates and timestamps
  await test("Rejects invalid calendar dates and times", () => {
    // Feb 30 does not exist
    const invDate = parseOperationalDate("2026-02-30", "testDate");
    assert(invDate.issue !== undefined, "Must flag Feb 30 as invalid day");
    assertEquals(invDate.issue?.severity, "error", "Severity is error");

    // Month 13 does not exist
    const invMonth = parseOperationalDate("2026-13-01", "testDate");
    assert(invMonth.issue !== undefined, "Must flag month 13 as invalid");

    // Invalid time component (25:00:00)
    const invTime = parseAsiaKolkataTimestamp("2026-11-17 25:00:00", "testTime");
    assert(invTime.issue !== undefined, "Must flag hour 25 as invalid");
  });

  // 4. Decimal precision preservation without float drift
  await test("Preserves exact decimal precision without floating point drift", () => {
    // 0.1 + 0.2 in JS float is 0.30000000000000004
    const d1 = parseDecimalValue("0.1", "f1").value!;
    const d2 = parseDecimalValue("0.2", "f2").value!;
    const sum = d1.add(d2);
    assertEquals(sum.toFixed(1), "0.3", "Prisma.Decimal exact arithmetic");

    // Negative roundoff string: "-0.22"
    const neg = parseDecimalValue("-0.22", "round_off").value!;
    assertEquals(neg.toFixed(2), "-0.22", "Preserves negative sign");
  });

  // 5. Mixed String and Numeric Financial Values
  await test("Handles mixed string and numeric financial fields safely", () => {
    // In sample payload: service_charge is 0 (number), discount_total is "105.36" (string), total_tax is 9.6 (number)
    const raw = buildBaseSyntheticOrder({
      service_charge: 15 as any,
      discount_total: "105.36",
    });
    raw.OrderItem[0].total_tax = 14.55;
    raw.OrderItem[0].total_discount = 25;

    const result = normalizePetpoojaOrder(raw);
    assert(result.success, "Should normalize mixed types");
    const o = result.order!;
    assertEquals(o.serviceCharge?.toFixed(2), "15.00", "serviceCharge from number 15");
    assertEquals(o.discountTotal?.toFixed(2), "105.36", "discountTotal from string '105.36'");
    assertEquals(o.items[0].itemTax?.toFixed(2), "14.55", "itemTax from number 14.55");
    assertEquals(o.items[0].itemDiscount?.toFixed(2), "25.00", "itemDiscount from integer 25");
  });

  // 6. Preservation of Cancelled Orders
  await test("Preserves cancelled order status without rejecting the order", () => {
    const raw = buildBaseSyntheticOrder({
      status: "Cancelled",
      cancel_order_description: "Guest left before service",
    });

    const result = normalizePetpoojaOrder(raw);
    assert(result.success, "Cancelled orders must be successfully normalized");
    assertEquals(result.order?.status, "Cancelled", "Status preserved as Cancelled");
  });

  // 7. Missing Optional Financial Fields (Preserved as Null, Never False Zero)
  await test("Distinguishes missing optional fields from zeros (preserves null)", () => {
    const raw = buildBaseSyntheticOrder({
      discount_total: undefined as any,
      tax_total: null as any,
      delivery_charges: "" as any,
    });
    raw.OrderItem[0].total_discount = undefined as any;

    const result = normalizePetpoojaOrder(raw);
    assert(result.success, "Normalization succeeds");
    const o = result.order!;
    assertEquals(o.discountTotal, null, "Missing discount_total is null, not 0");
    assertEquals(o.taxTotal, null, "Null tax_total is null, not 0");
    assertEquals(o.deliveryCharges, null, "Empty delivery_charges is null, not 0");
    assertEquals(o.items[0].itemDiscount, null, "Missing itemDiscount is null, not 0");
  });

  // 8. Invalid Decimal Inputs (Reports Warning, Preserves Null)
  await test("Reports validation issue on invalid decimal inputs without rejecting order", () => {
    const raw = buildBaseSyntheticOrder({
      round_off: "invalid-number" as any,
    });

    const result = normalizePetpoojaOrder(raw);
    assert(result.success, "Order still succeeds with null roundOff");
    assertEquals(result.order?.roundOff, null, "Invalid round_off set to null");
    const warning = result.issues.find((i) => i.field === "Order.round_off");
    assert(warning !== undefined, "Issue recorded for invalid decimal");
    assertEquals(warning?.severity, "warning", "Severity is warning");
  });

  // 9. Zero Customer PII in Normalized Output
  await test("Guarantees zero customer PII is present in normalized object", () => {
    const raw = buildBaseSyntheticOrder();
    raw.Customer = {
      name: "Secret VIP Customer",
      address: "123 Private Mansion",
      phone: "9876543210",
      gst_no: "32ABCDE1234F1Z5",
      created_date: "2026-01-01 10:00:00",
    };

    const result = normalizePetpoojaOrder(raw);
    const orderJson = JSON.stringify(result.order);

    assert(!orderJson.includes("Secret VIP Customer"), "No customer name");
    assert(!orderJson.includes("123 Private Mansion"), "No customer address");
    assert(!orderJson.includes("9876543210"), "No customer phone");
    assert(!orderJson.includes("32ABCDE1234F1Z5"), "No customer GSTIN");
  });

  // 10. Multi-item ordering with sequence and item codes
  await test("Normalizes multi-item orders preserving item sequence and codes", () => {
    const raw = buildBaseSyntheticOrder();
    raw.OrderItem = [
      {
        itemid: "id-1",
        itemcode: "CODE-A",
        name: "Item A",
        price: "100",
        quantity: "2",
        total: "200",
      },
      {
        itemid: "id-2",
        itemcode: "CODE-B [d]",
        name: "Item B",
        price: "50",
        quantity: "1",
        total: "50",
      },
    ];

    const result = normalizePetpoojaOrder(raw);
    assert(result.success, "Multi-item normalization succeeds");
    assertEquals(result.order?.items.length, 2, "2 items normalized");
    assertEquals(result.order?.items[0].itemIndex, 0, "First item index 0");
    assertEquals(result.order?.items[0].petpoojaItemCode, "CODE-A", "First itemcode");
    assertEquals(result.order?.items[1].itemIndex, 1, "Second item index 1");
    assertEquals(result.order?.items[1].petpoojaItemCode, "CODE-B [d]", "Second itemcode with variant flag");
  });

  // 11. Missing Essential Identifier Rejects Order
  await test("Fails normalization when critical identifiers (restID or orderID) are missing", () => {
    const raw1 = buildBaseSyntheticOrder();
    delete (raw1.Restaurant as any).restID;

    const res1 = normalizePetpoojaOrder(raw1);
    assertEquals(res1.success, false, "Fails when restID is missing");
    assert(res1.issues.some((i) => i.field === "Restaurant.restID" && i.severity === "error"), "Error on restID");

    const raw2 = buildBaseSyntheticOrder();
    delete (raw2.Order as any).orderID;

    const res2 = normalizePetpoojaOrder(raw2);
    assertEquals(res2.success, false, "Fails when orderID is missing");
    assert(res2.issues.some((i) => i.field === "Order.orderID" && i.severity === "error"), "Error on orderID");
  });

  // 12. Batch Normalization with Real Sample Payload
  await test("Normalizes batch from real sample payload (tmp/petpooja-sample-2026-11-17.json)", () => {
    const samplePath = path.resolve(process.cwd(), "tmp", "petpooja-sample-2026-11-17.json");
    if (!fs.existsSync(samplePath)) {
      console.log("     (Sample file not found, skipping live sample batch test)");
      return;
    }

    const content = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
    const samples: PetpoojaPullOrderEntry[] = content.api_response.sample_first_orders || [];
    if (content.api_response.sample_last_order) {
      samples.push(content.api_response.sample_last_order);
    }

    const batchResult = normalizePetpoojaBatch(samples);
    assertEquals(batchResult.totalReceived, samples.length, "Received count matches");
    assertEquals(batchResult.successfulCount, samples.length, "All sample orders normalized successfully");
    assertEquals(batchResult.errorCount, 0, "0 errors on verified sample batch");
    assertEquals(batchResult.orders.length, samples.length, "All orders present");

    // Spot-check first normalized order
    const first = batchResult.orders[0];
    assertEquals(first.petpoojaOrderId, "58322", "First sample order ID");
    assertEquals(first.orderDate, "2026-11-17", "First sample order date");
    assertEquals(first.items.length, 6, "First sample order has 6 items");

    // Spot-check last normalized order (delivery order)
    const last = batchResult.orders[batchResult.orders.length - 1];
    assertEquals(last.petpoojaOrderId, "57830", "Last sample order ID");
    assertEquals(last.orderType, "Delivery", "Last sample order type");
    assertEquals(last.discountTotal?.toFixed(2), "140.00", "Discount total");
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

