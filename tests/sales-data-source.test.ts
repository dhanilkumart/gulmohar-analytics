import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { test, type TestContext } from "node:test";
import { resolveAuthorizedOutletScope } from "../src/lib/auth/scope";
import { prisma } from "../src/lib/db/client";
import { getSales } from "../src/lib/data/sales";
import { getSaleItems } from "../src/lib/data/sale-items";
import { getPreparationTrend, getPreparationVsSoldVsWasted } from "../src/lib/analytics/preparation";
import { getDailySalesKpiTrends, getOrderHealth, getSalesSummary } from "../src/lib/analytics/sales";

const range = { from: "2026-11-17", to: "2026-11-18" };
const scope = { organizationId: "org-1", outletId: "outlet-1" };
const options = { ...scope, startDate: range.from, endDate: range.to };
const scopedOrders = {
  outlet: { organizationId: scope.organizationId },
  outletId: scope.outletId,
  orderDate: {
    gte: new Date("2026-11-17T00:00:00.000Z"),
    lte: new Date("2026-11-18T23:59:59.999Z"),
  },
};

function replaceMethod(
  t: TestContext,
  delegate: object,
  name: string,
  replacement: (...args: never[]) => Promise<unknown>
) {
  const original = Reflect.get(delegate, name);
  assert.ok(Reflect.set(delegate, name, replacement));
  t.after(() => { Reflect.set(delegate, name, original); });
}

test("sales readers and KPI queries use scoped Prisma reads even in mock mode", async (t) => {
  const previousMode = process.env.DATA_SOURCE;
  process.env.DATA_SOURCE = "mock";
  t.after(() => {
    if (previousMode === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = previousMode;
  });

  const orders = t.mock.fn<(args: Prisma.SalesOrderFindManyArgs) => Promise<unknown[]>>(async () => []);
  const items = t.mock.fn<(args: Prisma.SalesOrderItemFindManyArgs) => Promise<unknown[]>>(async () => []);
  const groups = t.mock.fn<(args: Prisma.SalesOrderGroupByArgs) => Promise<unknown[]>>(async () => []);
  replaceMethod(t, prisma.salesOrder, "findMany", orders);
  replaceMethod(t, prisma.salesOrderItem, "findMany", items);
  replaceMethod(t, prisma.salesOrder, "groupBy", groups);

  assert.deepEqual(await getSales(options), []);
  assert.deepEqual(await getSaleItems(options), []);
  assert.equal((await getOrderHealth(range, scope)).totalOrders, 0);
  assert.equal((await getDailySalesKpiTrends(range, scope)).hasData, false);

  const successfulOrders = { ...scopedOrders, status: "Success" };
  assert.deepEqual(orders.mock.calls.map((call) => call.arguments[0]?.where), [successfulOrders]);
  assert.deepEqual(items.mock.calls.map((call) => call.arguments[0]?.where), [
    { salesOrder: successfulOrders },
    { salesOrder: successfulOrders },
  ]);
  assert.deepEqual(groups.mock.calls.map((call) => call.arguments[0]?.where), [
    scopedOrders,
    scopedOrders,
  ]);
});

test("sales readers and KPI queries reject database failures", async (t) => {
  const unavailable = async () => { throw new Error("database unavailable"); };
  replaceMethod(t, prisma.salesOrder, "findMany", unavailable);
  replaceMethod(t, prisma.salesOrderItem, "findMany", unavailable);
  replaceMethod(t, prisma.salesOrder, "groupBy", unavailable);

  await assert.rejects(getSales(options), /Failed to load sales from PostgreSQL/);
  await assert.rejects(getSaleItems(options), /Failed to load sale items from PostgreSQL/);
  await assert.rejects(getOrderHealth(range, scope), /Failed to load order health from PostgreSQL/);
  await assert.rejects(getDailySalesKpiTrends(range, scope), /Failed to load daily sales KPI trends from PostgreSQL/);
});


for (const authorizedOutletIds of [["active-outlet"], []]) {
  test("all sales queries preserve the authorized outlet list: " + JSON.stringify(authorizedOutletIds), async (t) => {
    const orders = t.mock.fn<(args: Prisma.SalesOrderFindManyArgs) => Promise<unknown[]>>(async () => []);
    const items = t.mock.fn<(args: Prisma.SalesOrderItemFindManyArgs) => Promise<unknown[]>>(async () => []);
    const groups = t.mock.fn<(args: Prisma.SalesOrderGroupByArgs) => Promise<unknown[]>>(async () => []);
    replaceMethod(t, prisma.salesOrder, "findMany", orders);
    replaceMethod(t, prisma.salesOrderItem, "findMany", items);
    replaceMethod(t, prisma.salesOrder, "groupBy", groups);
    const outlets = t.mock.fn<(args: Prisma.OutletFindManyArgs) => Promise<unknown[]>>(async () =>
      authorizedOutletIds.map((id) => ({ id }))
    );
    replaceMethod(t, prisma.outlet, "findMany", outlets);
    const authorization = await resolveAuthorizedOutletScope({
      id: "manager",
      organizationId: scope.organizationId,
      username: "manager",
      displayName: "Manager",
      role: "manager",
      isActive: true,
      assignedOutlets: [],
    }, "all");
    assert.deepEqual(outlets.mock.calls[0].arguments[0].where, {
      organizationId: scope.organizationId,
      isActive: true,
    });
    const consolidated = {
      organizationId: scope.organizationId,
      authorizedOutletIds: authorization.allowedOutlets.map((outlet) => outlet.id),
    };
    for (const period of [range, { from: "2026-11-15", to: "2026-11-16" }]) {
      await getSalesSummary(period, consolidated);
      await getOrderHealth(period, consolidated);
      await getDailySalesKpiTrends(period, consolidated);
    }
    const filter = { in: authorizedOutletIds };
    assert.deepEqual(orders.mock.calls.map(({ arguments: [args] }) => args.where?.outletId), [filter, filter]);
    for (const { arguments: [args] } of items.mock.calls) {
      assert.match(JSON.stringify(args.where?.salesOrder), /"status":"Success"/);
      assert.deepEqual(args.where?.salesOrder && "outletId" in args.where.salesOrder
        ? args.where.salesOrder.outletId : undefined, filter);
    }
    assert.equal(items.mock.callCount(), 4);
    assert.deepEqual(groups.mock.calls.map(({ arguments: [args] }) => args.where?.outletId), [filter, filter, filter, filter]);
  });
}

test("preparation charts show real sales after the fixture ends, including days without preparation", async (t) => {
  replaceMethod(t, prisma.preparationLog, "findMany", async () => []);
  replaceMethod(t, prisma.wastageRecord, "findMany", async () => []);
  replaceMethod(t, prisma.salesOrderItem, "findMany", async () => [{
    id: "line",
    itemName: "Recorded menu item",
    productId: null,
    quantity: 3,
    unitPrice: 100,
    totalAmount: 300,
    salesOrder: { petpoojaOrderId: "order", orderDate: new Date("2026-11-17") },
  }]);
  assert.deepEqual(await getPreparationTrend(range, "day", scope), [
    { period: range.from, preparedQuantity: 0, soldQuantity: 3, wastedQuantity: 0 },
    { period: range.to, preparedQuantity: 0, soldQuantity: 0, wastedQuantity: 0 },
  ]);
  const rows = await getPreparationVsSoldVsWasted(range, scope);
  assert.deepEqual(rows.map(({ name, soldQuantity }) => ({ name, soldQuantity })), [
    { name: "Recorded menu item", soldQuantity: 3 },
  ]);
});
