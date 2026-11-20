/**
 * Unit Test Suite for PetpoojaGetOrdersClient (Stage 1)
 *
 * Runs without network dependencies or database connections.
 * Uses synthetic mock payloads (zero customer PII).
 * Verifies:
 * 1. Configuration validation.
 * 2. Request headers, cookie, body structure.
 * 3. Single page fetching (< 1000 orders).
 * 4. Multi-page pagination (1000 orders -> next cursor -> remaining orders).
 * 5. Safeguard: Missing refId cursor on full page.
 * 6. Safeguard: Repeated cursor infinite loop detection.
 * 7. Safeguard: maxPages limit exceeded.
 * 8. Error handling: HTTP error (non-200).
 * 9. Error handling: Petpooja API error (success: "0").
 * 10. Error handling: Malformed JSON.
 *
 * Execute with:
 *   npx tsx tests/petpooja-get-orders-client.test.ts
 */

import {
  PetpoojaGetOrdersClient,
  PetpoojaApiError,
  PetpoojaHttpError,
  PetpoojaPaginationError,
  PetpoojaTimeoutError,
  PETPOOJA_PAGE_SIZE_LIMIT,
} from "../src/lib/petpooja/get-orders-client";
import { PetpoojaPullOrderEntry } from "../src/types/petpooja";

// -----------------------------------------------------------------------------
// Helper: Create synthetic order entries
// -----------------------------------------------------------------------------
function createSyntheticOrder(idNum: number, refId: string): PetpoojaPullOrderEntry {
  return {
    Restaurant: {
      restaurantid: "57175",
      res_name: "GULMOHAR TEST RESTAURANT",
      address: "Synthetic Address",
      contact_information: "Synthetic Contact",
      restID: "9780nusx",
    },
    Customer: {
      name: `Synthetic Customer ${idNum}`,
      address: "Synthetic Street",
      phone: "9999999999",
    },
    Order: {
      orderID: String(idNum),
      refId,
      delivery_charges: "0",
      order_type: "Dine In",
      payment_type: "Cash",
      discount_total: "0",
      tax_total: "10",
      round_off: "0",
      core_total: "200",
      total: "210",
      created_on: "2026-11-17 12:00:00",
      order_from: "POS",
      order_date: "2026-11-17",
      status: "Success",
    },
    OrderItem: [
      {
        itemid: `item-${idNum}`,
        itemcode: `CODE-${idNum}`,
        name: `Test Item ${idNum}`,
        price: "100",
        quantity: "2",
        total: "200",
        total_discount: 0,
        total_tax: 10,
      },
    ],
  };
}

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
// Mock fetch environment
// -----------------------------------------------------------------------------
const originalFetch = globalThis.fetch;

const validTestConfig = {
  endpointUrl: "https://api.petpooja.com/V1/thirdparty/generic_get_orders/",
  appKey: "test-app-key",
  appSecret: "test-app-secret",
  accessToken: "test-access-token",
  restId: "test-rest-id",
  apiCookie: "test-cookie=abc123xyz;",
};

async function runAllTests() {
  console.log("==================================================================");
  console.log("🧪 RUNNING PETPOOJA GET ORDERS CLIENT UNIT TESTS (STAGE 1)");
  console.log("==================================================================");

  // 1. Config Validation
  await test("Throws error when required configuration is missing", () => {
    const incompleteClient = new PetpoojaGetOrdersClient({
      endpointUrl: "https://api.petpooja.com/test",
      appKey: "key",
      // missing secret, token, restId, cookie
    });

    let caught = false;
    try {
      incompleteClient.buildRequestBody("2026-11-17");
    } catch (e: any) {
      caught = true;
      assert(
        e.message.includes("Petpooja client configuration incomplete"),
        "Expected config incomplete error"
      );
    }
    assert(caught, "Should have thrown configuration error");
  });

  // 2. Request Construction & Headers
  await test("Dispatches POST with correct headers, Cookie and JSON payload", async () => {
    let capturedUrl = "";
    let capturedOptions: any = {};

    globalThis.fetch = (async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return new Response(
        JSON.stringify({
          code: "200",
          success: "1",
          message: "",
          order_json: [createSyntheticOrder(1, "ref-001")],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    const result = await client.fetchPage("2026-11-17", "initial-ref");

    assertEquals(capturedUrl, validTestConfig.endpointUrl, "URL must match configured endpoint");
    assertEquals(capturedOptions.method, "POST", "HTTP method must be POST");
    assertEquals(
      capturedOptions.headers["Cookie"],
      validTestConfig.apiCookie,
      "Cookie header must match config"
    );
    assertEquals(
      capturedOptions.headers["Content-Type"],
      "application/json",
      "Content-Type must be application/json"
    );

    const body = JSON.parse(capturedOptions.body);
    assertEquals(body.app_key, "test-app-key", "app_key matches");
    assertEquals(body.app_secret, "test-app-secret", "app_secret matches");
    assertEquals(body.access_token, "test-access-token", "access_token matches");
    assertEquals(body.restID, "test-rest-id", "restID matches");
    assertEquals(body.order_date, "2026-11-17", "order_date matches");
    assertEquals(body.refId, "initial-ref", "refId cursor matches");

    assertEquals(result.order_json?.length, 1, "Returns order array");
  });

  // 3. Single-Page Fetch Termination (< 1,000 records)
  await test("fetchAllOrders terminates in 1 page when records < 1,000", async () => {
    const ordersBatch = Array.from({ length: 507 }, (_, i) =>
      createSyntheticOrder(i + 1, `ref-${1000 + i}`)
    );

    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          code: "200",
          success: "1",
          message: "",
          order_json: ordersBatch,
        }),
        { status: 200 }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    const result = await client.fetchAllOrders("2026-11-17");

    assertEquals(callCount, 1, "Must make exactly 1 call");
    assertEquals(result.pagesFetched, 1, "pagesFetched must be 1");
    assertEquals(result.totalOrders, 507, "totalOrders must be 507");
    assertEquals(result.hasMore, false, "hasMore must be false");
  });

  // 4. Multi-Page Pagination (Page 1 = 1,000 records, Page 2 = 250 records)
  await test("fetchAllOrders paginates when exactly 1,000 records returned", async () => {
    let callCount = 0;
    const requestedCursors: string[] = [];

    globalThis.fetch = (async (_url: any, options: any) => {
      callCount++;
      const body = JSON.parse(options.body);
      requestedCursors.push(body.refId);

      if (callCount === 1) {
        // Page 1: exactly 1,000 orders
        const page1Orders = Array.from({ length: PETPOOJA_PAGE_SIZE_LIMIT }, (_, i) =>
          createSyntheticOrder(i + 1, `cursor-p1-${i + 1}`)
        );
        return new Response(
          JSON.stringify({
            code: "200",
            success: "1",
            message: "",
            order_json: page1Orders,
          }),
          { status: 200 }
        );
      } else {
        // Page 2: 250 orders (< 1,000, final page)
        const page2Orders = Array.from({ length: 250 }, (_, i) =>
          createSyntheticOrder(1000 + i + 1, `cursor-p2-${i + 1}`)
        );
        return new Response(
          JSON.stringify({
            code: "200",
            success: "1",
            message: "",
            order_json: page2Orders,
          }),
          { status: 200 }
        );
      }
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    const result = await client.fetchAllOrders("2026-11-17");

    assertEquals(callCount, 2, "Must make 2 calls");
    assertEquals(result.pagesFetched, 2, "pagesFetched must be 2");
    assertEquals(result.totalOrders, 1250, "totalOrders must be 1,250");
    assertEquals(result.hasMore, false, "hasMore must be false");
    assertEquals(requestedCursors[0], "", "First call sends empty refId");
    assertEquals(
      requestedCursors[1],
      `cursor-p1-${PETPOOJA_PAGE_SIZE_LIMIT}`,
      "Second call sends last record's refId as cursor"
    );
  });

  // 5. Safeguard: Full page (1,000 records) with missing/empty refId
  await test("Throws PetpoojaPaginationError if 1,000 records returned with empty refId cursor", async () => {
    globalThis.fetch = (async () => {
      const orders = Array.from({ length: PETPOOJA_PAGE_SIZE_LIMIT }, (_, i) =>
        createSyntheticOrder(i + 1, "") // empty refId
      );
      return new Response(
        JSON.stringify({
          code: "200",
          success: "1",
          message: "",
          order_json: orders,
        }),
        { status: 200 }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchAllOrders("2026-11-17");
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaPaginationError, "Must throw PetpoojaPaginationError");
      assert(e.message.includes("missing or empty refId"), "Explains empty refId");
    }
    assert(threw, "Must throw error");
  });

  // 6. Safeguard: Infinite Loop / Repeated Cursor Detection
  await test("Throws PetpoojaPaginationError if same cursor repeats", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      // Return 1,000 orders every time with the exact same last refId "static-cursor"
      const orders = Array.from({ length: PETPOOJA_PAGE_SIZE_LIMIT }, (_, i) =>
        createSyntheticOrder(i + 1, "static-cursor")
      );
      return new Response(
        JSON.stringify({
          code: "200",
          success: "1",
          message: "",
          order_json: orders,
        }),
        { status: 200 }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchAllOrders("2026-11-17");
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaPaginationError, "Must throw PetpoojaPaginationError");
      assert(e.message.includes("Repeated pagination cursor detected"), "Explains repeated cursor");
    }
    assert(threw, "Must throw error on repeated cursor");
    assertEquals(callCount, 2, "Stops on second call when repeat is detected");
  });

  // 7. Safeguard: maxPages Limit Exceeded
  await test("Throws PetpoojaPaginationError if maxPages exceeded", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      const orders = Array.from({ length: PETPOOJA_PAGE_SIZE_LIMIT }, (_, i) =>
        createSyntheticOrder(i + 1, `cursor-call-${callCount}-${i}`)
      );
      return new Response(
        JSON.stringify({
          code: "200",
          success: "1",
          message: "",
          order_json: orders,
        }),
        { status: 200 }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchAllOrders("2026-11-17", { maxPages: 3 });
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaPaginationError, "Must throw PetpoojaPaginationError");
      assert(e.message.includes("Exceeded maximum allowed pagination pages"), "Explains maxPages");
    }
    assert(threw, "Must throw error when maxPages exceeded");
    assertEquals(callCount, 3, "Fetched up to maxPages of 3 before aborting on attempt 4");
  });

  // 8. HTTP Error Handling (e.g. 500 or 404)
  await test("Throws PetpoojaHttpError on non-200 HTTP response", async () => {
    globalThis.fetch = (async () => {
      return new Response("Internal Server Error", { status: 500, statusText: "Server Error" });
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchPage("2026-11-17");
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaHttpError, "Must throw PetpoojaHttpError");
      assertEquals(e.status, 500, "Status is 500");
    }
    assert(threw, "Must throw error on HTTP 500");
  });

  // 9. Petpooja API Business Failure (success: "0")
  await test("Throws PetpoojaApiError on API-level failure (success = 0)", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          code: "401",
          success: "0",
          message: "Authentication failure: Invalid app_key or app_secret",
        }),
        { status: 200 }
      );
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchPage("2026-11-17");
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaApiError, "Must throw PetpoojaApiError");
      assert(e.message.includes("Authentication failure"), "Contains API message");
      assertEquals(e.code, "401", "Contains API code");
      assertEquals(e.success, "0", "Contains API success flag");
    }
    assert(threw, "Must throw PetpoojaApiError");
  });

  // 10. Malformed JSON Body
  await test("Throws PetpoojaApiError when response is invalid JSON", async () => {
    globalThis.fetch = (async () => {
      return new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }) as any;

    const client = new PetpoojaGetOrdersClient(validTestConfig);
    let threw = false;
    try {
      await client.fetchPage("2026-11-17");
    } catch (e: any) {
      threw = true;
      assert(e instanceof PetpoojaApiError, "Must throw PetpoojaApiError on parse error");
      assert(e.message.includes("Failed to parse"), "Mentions JSON parse error");
    }
    assert(threw, "Must throw error on non-JSON body");
  });

  // ---------------------------------------------------------------------------
  // Teardown & Summary
  // ---------------------------------------------------------------------------
  globalThis.fetch = originalFetch;

  console.log("==================================================================");
  console.log(`Results: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);
  console.log("==================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  globalThis.fetch = originalFetch;
  console.error("Fatal test runner crash:", e);
  process.exit(1);
});
