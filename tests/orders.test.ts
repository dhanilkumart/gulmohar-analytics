import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { execFileSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { prisma } from "../src/lib/db/client";
import { sealSession } from "../src/lib/auth/session";
import { getOrderDetail, getOrdersPage, isOrderDate } from "../src/lib/data/orders";
import type { RestaurantContext } from "../src/lib/context/restaurant-context";
import { PetpoojaGetOrdersClient } from "../src/lib/petpooja/get-orders-client";
import { GET as details } from "../src/app/api/orders/[id]/route";
import { POST as preview } from "../src/app/api/orders/petpooja/route";
import type { PetpoojaGetOrdersResponse, PetpoojaPullOrderEntry } from "../src/types/petpooja";

const context: RestaurantContext = {
  restaurantName: "Gulmohar", organizationId: "org", outletId: "configured-outlet", outletCode: "KOZ-001",
  outlet: { id: "configured-outlet", code: "KOZ-001", name: "Gulmohar", city: "Kozhikode" },
};
const range = { from: "2026-11-19", to: "2026-11-20" };
const orderId = "12345678-1234-1234-1234-123456789abc";
const scoped = { outletId: context.outletId, outlet: { organizationId: context.organizationId } };
const row = {
  id: orderId, petpoojaOrderId: "59095", orderDate: new Date("2026-11-20T00:00:00Z"), orderedAt: new Date("2026-11-20T17:08:49Z"),
  orderType: "Dine In", status: "Cancelled", coreTotal: new Prisma.Decimal("980"), taxTotal: null,
  discountTotal: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal("1029"), _count: { items: 2 },
};
function replace(t: TestContext, target: object, name: string, fn: (...args: never[]) => unknown) {
  const original = Reflect.get(target, name);
  Reflect.set(target, name, fn);
  t.after(() => { Reflect.set(target, name, original); });
}

async function authenticated<T>(t: TestContext, action: () => Promise<T>, role: "admin" | "manager" | "operator" = "manager", signedIn = true): Promise<T> {
  const token = await sealSession({ sessionId: "test-session", userId: "user", role, username: "tester", displayName: "Tester", expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  replace(t, prisma.userSession, "findUnique", async () => ({
    revokedAt: null, expiresAt: new Date(Date.now() + 3600000),
    user: { id: "user", organizationId: context.organizationId, username: "tester", displayName: "Tester", role: role.toUpperCase(), isActive: true, outletAssignments: [] },
  }));
  replace(t, prisma.outlet, "findUnique", async () => ({ ...context.outlet, organizationId: context.organizationId, isActive: true }));
  return workAsyncStorage.run({ route: "/orders-test" } as Parameters<typeof workAsyncStorage.run>[0], () => workUnitAsyncStorage.run({ type: "request", phase: "render", cookies: { get: () => signedIn ? { value: token } : undefined } } as unknown as Parameters<typeof workUnitAsyncStorage.run>[0], action));
}

function previewRequest(body: object = { date: "2026-11-20" }, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/orders/petpooja", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
}
function entry(id = "59095", date = "2026-11-20"): PetpoojaPullOrderEntry {
  return {
    Restaurant: { restID: "9780nusx", restaurantid: "test", res_name: "Gulmohar", address: "", contact_information: "" }, Customer: { name: "", address: "", phone: "" },
    Order: { orderID: id, refId: `cursor-${id}`, order_date: date, created_on: "2026-11-20 22:38:49", status: "Success", order_type: "Dine In", core_total: "980", tax_total: "49", discount_total: "0", total: "1029", round_off: "0", delivery_charges: "0", payment_type: "Cash", order_from: "POS" },
    OrderItem: [{ itemid: "item", itemcode: "code", name: "Meal", quantity: "2", price: "490", total: "980", total_tax: "49", total_discount: "0" }],
  };
}
function configurePreview(t: TestContext) {
  replace(t, prisma.outlet, "findFirst", async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { id: context.outletId, organizationId: context.organizationId, isActive: true });
    return { petpoojaRestId: "9780nusx" };
  });
  replace(t, PetpoojaGetOrdersClient.prototype, "validateConfig", () => {});
  for (const target of [prisma.salesOrder, prisma.salesOrderItem]) {
    for (const method of ["create", "createMany", "update", "delete", "deleteMany", "upsert"]) {
      replace(t, target, method, async () => { assert.fail("Preview must never mutate the database"); });
    }
  }
}

test("orders list includes every status, scopes count/rows/bounds and paginates on server", async t => {
  replace(t, prisma.salesOrder, "count", async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { ...scoped, orderDate: { gte: new Date("2026-11-19T00:00:00Z"), lte: new Date("2026-11-20T00:00:00Z") } }); return 60;
  });
  replace(t, prisma.salesOrder, "aggregate", async (args: { where: unknown }) => { assert.deepEqual(args.where, scoped); return { _min: { orderDate: row.orderDate }, _max: { orderDate: row.orderDate } }; });
  replace(t, prisma.salesOrder, "findMany", async (args: { where: { status?: string }; take: number; skip: number; select: { items?: unknown }; orderBy: unknown }) => {
    assert.equal(args.where.status, undefined); assert.equal(args.take, 25); assert.equal(args.skip, 25);
    assert.equal(args.select.items, undefined); assert.ok(args.orderBy); return [row];
  });
  const result = await getOrdersPage(context, range, 2);
  assert.equal(result.page, 2); assert.equal(result.count, 60);
  assert.equal(result.orders[0].status, "Cancelled");
  assert.equal(result.orders[0].paymentMode, null); assert.equal(result.orders[0].tax, null);
  assert.equal(result.orders[0].discount, "0"); assert.equal(result.orders[0].itemCount, 2);
});

test("single-date ranges are inclusive and pagination clamps to available pages", async t => {
  replace(t, prisma.salesOrder, "count", async (args: { where: { orderDate: { gte: Date; lte: Date } } }) => { assert.equal(+args.where.orderDate.gte, +args.where.orderDate.lte); return 1; });
  replace(t, prisma.salesOrder, "aggregate", async () => ({ _min: { orderDate: null }, _max: { orderDate: null } }));
  replace(t, prisma.salesOrder, "findMany", async (args: { skip: number }) => { assert.equal(args.skip, 0); return []; });
  const result = await getOrdersPage(context, { from: "2026-11-20", to: "2026-11-20" }, 999);
  assert.equal(result.page, 1); assert.equal(result.bounds, null);
});

test("invalid calendar dates and reversed ranges are rejected", async () => {
  assert.equal(isOrderDate("2026-02-30"), false); assert.equal(isOrderDate("2024-02-29"), true);
  await assert.rejects(getOrdersPage(context, { from: "2026-11-21", to: "2026-11-20" }), /VALIDATION/);
});

test("details keep all item lines without product matching or historical placeholders", async t => {
  replace(t, prisma.salesOrder, "findFirst", async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { ...scoped, id: orderId });
    return { ...row, items: [1, 2].map(id => ({ id: String(id), itemName: "Meal", quantity: new Prisma.Decimal("1.5"), unitPrice: new Prisma.Decimal(10), totalAmount: new Prisma.Decimal(15), itemTax: null, itemDiscount: new Prisma.Decimal(0) })) };
  });
  const detail = await getOrderDetail(context, orderId);
  assert.equal(detail?.items.length, 2); assert.equal(detail?.items[0].quantity, "1.5");
  assert.equal(detail?.tableNumber, null); assert.equal(detail?.paymentMode, null);
  assert.equal(detail?.items[0].tax, null);
});

test("foreign order lookup returns 404 with no-store", async t => {
  replace(t, prisma.salesOrder, "findFirst", async (args: { where: unknown }) => { assert.deepEqual(args.where, { ...scoped, id: orderId }); return null; });
  await authenticated(t, async () => {
    const response = await details(new Request("http://localhost/api/orders/foreign?outletId=foreign"), { params: Promise.resolve({ id: orderId }) });
    assert.equal(response.status, 404); assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  });
});

for (const [label, role, signedIn, expected] of [["operator", "operator", true, 403], ["anonymous", "manager", false, 401]] as const) {
  test(label + " cannot access either Orders endpoint", async t => {
    await authenticated(t, async () => {
      assert.equal((await details(new Request("http://localhost/api/orders/test"), { params: Promise.resolve({ id: orderId }) })).status, expected);
      assert.equal((await preview(previewRequest())).status, expected);
    }, role, signedIn);
  });
}

test("preview preserves original response, amounts, unknown fields and adjacent dates without writes", async t => {
  configurePreview(t);
  const responsePage = { code: "200", success: "1", message: "", vendor_extension: { untouched: true }, order_json: [entry(), entry("58547", "2026-11-19")] };
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async function (this: PetpoojaGetOrdersClient, date: string, cursor: string) {
    assert.equal(date, "2026-11-20"); assert.equal(cursor, "");
    assert.equal(this.buildRequestBody(date).restID, "9780nusx"); return responsePage;
  });
  await authenticated(t, async () => {
    const response = await preview(previewRequest({ date: "2026-11-20", restID: "foreign", outletId: "foreign" }));
    assert.equal(response.status, 200); assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.deepEqual(await response.json(), { requestedDate: "2026-11-20", pages: [responsePage] });
  }, "admin");
});

test("preview retains each raw page and uses refId, not orderID, for pagination", async t => {
  configurePreview(t);
  const full: PetpoojaGetOrdersResponse = { code: "200", success: "1", message: "page one", order_json: Array.from({ length: 1000 }, (_, i) => entry(String(i))) };
  const final = { code: "200", success: "1", message: "page two", order_json: [entry("last")] };
  const calls: string[] = [];
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async (_date: string, cursor: string) => { calls.push(cursor); return calls.length === 1 ? full : final; });
  await authenticated(t, async () => {
    const response = await preview(previewRequest()); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).pages, [full, final]);
  });
  assert.deepEqual(calls, ["", "cursor-999"]);
});

test("preview rejects incomplete pagination instead of presenting partial data", async t => {
  configurePreview(t);
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => ({ code: "200", success: "1", message: "", order_json: Array.from({ length: 1000 }, () => entry()) }));
  await authenticated(t, async () => { const response = await preview(previewRequest()); assert.equal(response.status, 502); assert.equal("pages" in await response.json(), false); });
});

test("preview rejects a mismatched restaurant response", async t => {
  configurePreview(t);
  const order = entry(); order.Restaurant.restID = "foreign";
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => ({ code: "200", success: "1", message: "", order_json: [order] }));
  await authenticated(t, async () => { assert.equal((await preview(previewRequest())).status, 502); });
});

test("preview validates dates and cross-origin requests before vendor fetch", async t => {
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => { assert.fail("must not fetch"); });
  await authenticated(t, async () => {
    assert.equal((await preview(previewRequest({ date: "2026-02-30" }))).status, 400);
    assert.equal((await preview(previewRequest({ date: "2026-11-20" }, "https://foreign.example"))).status, 403);
  });
});

test("preview never exposes upstream error bodies or credential values", async t => {
  configurePreview(t);
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => { throw new Error("SECRET-upstream-response"); });
  await authenticated(t, async () => { const response = await preview(previewRequest()); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /SECRET/); });
});

test("Orders endpoints reject a configured outlet from another organization", async t => {
  await authenticated(t, async () => {
    replace(t, prisma.outlet, "findUnique", async () => ({ ...context.outlet, organizationId: "foreign-org", isActive: true }));
    assert.equal((await details(new Request("http://localhost/api/orders/test"), { params: Promise.resolve({ id: orderId }) })).status, 403);
    assert.equal((await preview(previewRequest())).status, 403);
  });
});

test("preview reports a missing merchant mapping without fetching", async t => {
  replace(t, prisma.outlet, "findFirst", async () => ({ petpoojaRestId: null }));
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => { assert.fail("must not fetch"); });
  await authenticated(t, async () => { assert.equal((await preview(previewRequest())).status, 500); });
});

test("empty Petpooja response remains an intact, successful empty preview", async t => {
  configurePreview(t);
  const page = { code: "200", success: "1", message: "No orders", order_json: [] };
  replace(t, PetpoojaGetOrdersClient.prototype, "fetchPage", async () => page);
  await authenticated(t, async () => { const response = await preview(previewRequest()); assert.equal(response.status, 200); assert.deepEqual((await response.json()).pages, [page]); });
});

test("preview view model preserves pricing/quantity, converts IST and renders one row per order", () => {
  // UI modules require React's client exports; exercise them in a separate ordinary Node runtime.
  const fixture = entry();
  fixture.Order.table_no = "T4";
  fixture.OrderItem.push({ ...fixture.OrderItem[0], name: "Half portion", quantity: "0.5", total: "245", total_tax: undefined });
  const source = `
    const assert = require('node:assert/strict');
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { petpoojaOrderDetail, OrdersTable, orderTime, orderAmount } = require('./src/components/orders/orders-table.tsx');
    const raw = JSON.parse(process.argv[1]);
    const before = JSON.stringify(raw);
    const order = petpoojaOrderDetail(raw, 0);
    assert.equal(JSON.stringify(raw), before);
    assert.equal(order.itemCount, 2);
    assert.equal(order.items[1].quantity, '0.5');
    assert.equal(order.items[1].tax, null);
    assert.equal(order.total, '1029');
    assert.equal(order.tableNumber, 'T4');
    assert.equal(order.paymentMode, 'Cash');
    assert.equal(orderTime(order.orderedAt), '22:38:49');
    assert.equal(orderAmount(null), 'Not available');
    const html = renderToStaticMarkup(React.createElement(OrdersTable, {orders:[order],count:1,page:1,pageSize:25,onPageChange:()=>{},onSelect:()=>{}}));
    assert.equal((html.split('<tbody')[1].match(/<tr/g)||[]).length, 1);
    assert.match(html, /59095/);
    assert.match(html, /Cash/);
    console.log('view-model and table render passed');
  `;
  assert.match(execFileSync(process.execPath, ["--import", "tsx", "-e", source, JSON.stringify(fixture)], { cwd: process.cwd(), encoding: "utf8" }), /passed/);
});
