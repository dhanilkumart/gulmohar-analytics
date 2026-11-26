import "next/dist/server/node-environment-baseline";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { prisma } from "../src/lib/db/client";
import { resolveRestaurantContext, validateRestaurantDepartment } from "../src/lib/context/restaurant-context";
import { resolveAuthorizedOutletScope, type AuthenticatedUser } from "../src/lib/auth/scope";
import { sealSession } from "../src/lib/auth/session";
import { getDashboardSalesScope } from "../src/lib/auth/dashboard-sales-scope";
import { getSales } from "../src/lib/data/sales";
import { getLiveWastagePreparationMetrics } from "../src/lib/analytics/live-wastage-prep";
import { getWastageInRange } from "../src/lib/analytics/wastage";
import { getBreakageInRange } from "../src/lib/analytics/breakage";
import * as preparation from "../src/app/api/dashboard/preparation/route";
import * as wastage from "../src/app/api/dashboard/wastage/route";
import * as breakage from "../src/app/api/dashboard/breakage/route";
import * as operatorWastage from "../src/app/api/operator/wastage/route";
import * as operatorBreakage from "../src/app/api/operator/breakage/route";
import * as operatorMeta from "../src/app/api/operator/meta/route";

const outlet = { id: "configured-uuid", code: "KOZ-001", organizationId: "org", name: "Restaurant", city: "Kozhikode", isActive: true };
const user: AuthenticatedUser = { id: "user", organizationId: "org", username: "manager", displayName: "Manager", role: "manager", isActive: true, assignedOutlets: [] };
function replace(t: TestContext, delegate: object, method: string, fn: (...args: never[]) => unknown) {
  const original = Reflect.get(delegate, method);
  Reflect.set(delegate, method, fn);
  t.after(() => { Reflect.set(delegate, method, original); });
}
function configured(t: TestContext) {
  replace(t, prisma.outlet, "findUnique", async (args: { where: { code: string } }) => {
    assert.equal(args.where.code, "KOZ-001");
    return outlet;
  });
}
// Exercise real cookie/session authentication and route handlers without any database writes.
async function authenticated<T>(t: TestContext, action: () => Promise<T>, role = "manager"): Promise<T> {
  const token = await sealSession({ sessionId: "session", userId: user.id, role: role as "manager", username: user.username, displayName: user.displayName, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  replace(t, prisma.userSession, "findUnique", async () => ({ revokedAt: null, expiresAt: new Date(Date.now() + 3600000), user: { ...user, role: role.toUpperCase(), outletAssignments: [] } }));
  // Next normally installs AsyncLocalStorage before loading its request storage.
  return workAsyncStorage.run({ route: "/test" } as Parameters<typeof workAsyncStorage.run>[0], () => workUnitAsyncStorage.run({ type: "request", phase: "render", cookies: { get: () => ({ value: token }) } } as unknown as Parameters<typeof workUnitAsyncStorage.run>[0], action));
}
function request(method: string, body?: object) {
  return new Request("http://localhost/api/dashboard/entry?outletId=other-uuid&id=foreign-record", { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
}

test("configured outlet resolves database identity and restaurant name", async (t) => {
  configured(t);
  const result = await resolveRestaurantContext(user);
  assert.equal(result.outletId, outlet.id);
  assert.equal(result.organizationId, "org");
  assert.equal(result.restaurantName, "Ashirvad Gulmohar");
  assert.equal(result.outletCode, "KOZ-001");
});
for (const [label, value, message] of [
  ["missing", null, /CONFIGURATION:.*does not exist/],
  ["inactive", { ...outlet, isActive: false }, /CONFIGURATION:.*inactive/],
  ["another organization", { ...outlet, organizationId: "foreign" }, /FORBIDDEN:.*another organization/],
] as const) {
  test("resolver rejects " + label, async (t) => {
    replace(t, prisma.outlet, "findUnique", async () => value);
    await assert.rejects(resolveRestaurantContext(user), message);
  });
}
test("operator requires current assignment to this exact outlet, regardless of first assignment", async (t) => {
  configured(t);
  const operator: AuthenticatedUser = { ...user, role: "operator", assignedOutlets: [{ ...outlet, id: "other", isDefault: true }] };
  let assigned = false;
  replace(t, prisma.userOutletAssignment, "findUnique", async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { userId_outletId: { userId: user.id, outletId: outlet.id } });
    return assigned ? { id: "assignment" } : null;
  });
  await assert.rejects(resolveRestaurantContext(operator), /FORBIDDEN:.*not assigned/);
  assigned = true;
  assert.equal((await resolveRestaurantContext(operator)).outletId, outlet.id);
});
test("current and comparison sales and operational reads use the configured outlet", async (t) => {
  configured(t);
  const previousMode = process.env.DATA_SOURCE;
  process.env.DATA_SOURCE = "database";
  t.after(() => { if (previousMode === undefined) delete process.env.DATA_SOURCE; else process.env.DATA_SOURCE = previousMode; });
  const seen: { outletId?: unknown; outlet?: unknown }[] = [];
  for (const delegate of [prisma.salesOrder, prisma.preparationLog, prisma.wastageRecord, prisma.breakageRecord]) {
    replace(t, delegate, "findMany", async (args: { where: { outletId?: unknown; outlet?: unknown } }) => { seen.push(args.where); return []; });
  }
  await authenticated(t, async () => {
    const scope = await getDashboardSalesScope();
    const context = await resolveRestaurantContext(user);
    for (const range of [{ from: "2026-11-01", to: "2026-11-10" }, { from: "2026-10-22", to: "2026-10-31" }]) {
      await getSales({ ...scope, startDate: range.from, endDate: range.to });
      await getWastageInRange(range, scope);
      await getBreakageInRange(range, scope);
      await getLiveWastagePreparationMetrics(range, context);
    }
  });
  assert.equal(seen.length, 10);
  for (const where of seen) { assert.equal(where.outletId, outlet.id); assert.deepEqual(where.outlet, { organizationId: "org" }); }
});
for (const [name, routes, delegate] of [["preparation", preparation, prisma.preparationLog], ["wastage", wastage, prisma.wastageRecord], ["breakage", breakage, prisma.breakageRecord]] as const) {
  test(name + " ignores browser outlet filters and refuses foreign-record edits/deletes", async (t) => {
    configured(t);
    replace(t, delegate, "findMany", async (args: { where: { outletId: string } }) => { assert.equal(args.where.outletId, outlet.id); return []; });
    replace(t, delegate, "findUnique", async () => ({ id: "foreign-record", outletId: "other-uuid" }));
    replace(t, delegate, "update", async () => { assert.fail("must not update"); });
    replace(t, delegate, "delete", async () => { assert.fail("must not delete"); });
    await authenticated(t, async () => {
      assert.equal((await routes.GET(request("GET"))).status, 200);
      assert.equal((await routes.PUT(request("PUT", { id: "foreign-record", outletId: outlet.id }))).status, 403);
      assert.equal((await routes.DELETE(request("DELETE"))).status, 403);
    });
  });
  test(name + " create derives outlet on server even with conflicting browser ID", async (t) => {
    configured(t);
    replace(t, prisma.preparationItem, "findFirst", async () => ({ id: "item", standardCost: null, departmentId: null }));
    replace(t, prisma.department, "findFirst", async () => ({ id: "dept" }));
    replace(t, prisma.breakageItem, "findFirst", async () => null);
    replace(t, prisma.preparationLog, "aggregate", async () => ({ _sum: { quantity: 100 } }));
    replace(t, prisma.wastageRecord, "aggregate", async () => ({ _sum: { wastedQuantity: 0 } }));
    replace(t, prisma, "$transaction", async (action: (tx: typeof prisma) => unknown) => action(prisma));
    let wrote = false;
    replace(t, delegate, "create", async (args: { data: { outletId: string } }) => {
      assert.equal(args.data.outletId, outlet.id); wrote = true;
      return { id: "new", date: new Date(), ...args.data, preparationItem: { name: "Item" }, outlet: { code: outlet.code }, department: { name: "Dept" }, quantity: 1, wastedQuantity: 1, brokenQty: 1, totalCost: null, unitCost: null, estimatedCost: null };
    });
    await authenticated(t, async () => {
      const response = await routes.POST(request("POST", { outletId: "other-uuid", itemId: "item", item: "Cup", departmentId: "dept", quantity: 1, wastedQuantity: 1, reason: "Test", date: "2026-11-01" }));
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
    });
    assert.ok(wrote);
  });
}
test("foreign departments are rejected", async (t) => {
  configured(t);
  replace(t, prisma.department, "findFirst", async (args: { where: { outletId: string } }) => { assert.equal(args.where.outletId, outlet.id); return null; });
  await assert.rejects(validateRestaurantDepartment(await resolveRestaurantContext(user), "foreign-dept"), /FORBIDDEN:.*department/);
});
for (const [name, route] of [["metadata", operatorMeta], ["wastage", operatorWastage], ["breakage", operatorBreakage]] as const) {
  test("operator " + name + " rejects missing configured assignment before doing business queries", async (t) => {
    configured(t);
    replace(t, prisma.userOutletAssignment, "findUnique", async () => null);
    await authenticated(t, async () => {
      const response = "POST" in route ? await route.POST(request("POST", { outletId: "other-uuid" })) : await route.GET();
      assert.equal(response.status, 403);
    }, "operator");
  });
}
test("generic multi-outlet admin authorization remains available", async (t) => {
  replace(t, prisma.outlet, "findMany", async () => [outlet, { ...outlet, id: "other", code: "KOZ-002" }]);
  const admin = { ...user, role: "admin" as const };
  assert.equal((await resolveAuthorizedOutletScope(admin, "other")).targetOutletId, "other");
  const all = await resolveAuthorizedOutletScope(admin, "all");
  assert.equal(all.isConsolidated, true);
  assert.equal(all.allowedOutlets.length, 2);
});

for (const [name, route, delegate] of [["wastage", operatorWastage, prisma.wastageRecord], ["breakage", operatorBreakage, prisma.breakageRecord]] as const) {
  test("operator " + name + " writes to configured outlet despite conflicting browser outlet", async (t) => {
    configured(t);
    replace(t, prisma.userOutletAssignment, "findUnique", async () => ({ id: "assigned" }));
    replace(t, prisma.breakageItem, "findFirst", async () => null);
    replace(t, prisma.preparationItem, "findFirst", async () => ({ id: "item", standardCost: null, departmentId: null }));
    replace(t, prisma.department, "findFirst", async () => ({ id: "dept" }));
    replace(t, prisma.preparationLog, "aggregate", async () => ({ _sum: { quantity: 100 } }));
    replace(t, prisma.wastageRecord, "aggregate", async () => ({ _sum: { wastedQuantity: 0 } }));
    replace(t, prisma, "$transaction", async (action: (tx: typeof prisma) => unknown) => action(prisma));
    let wrote = false;
    replace(t, delegate, "create", async (args: { data: { outletId: string } }) => {
      assert.equal(args.data.outletId, outlet.id); wrote = true;
      return { id: "created", ...args.data, date: new Date(), preparationItem: { name: "Item" }, department: { name: "Dept" }, outlet: { code: outlet.code } };
    });
    await authenticated(t, async () => {
      const response = await route.POST(request("POST", { outletId: "foreign", itemId: "item", item: "Cup", departmentId: "dept", wastedQuantity: 1, brokenQuantity: 1, reason: "Test" }));
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
    }, "operator");
    assert.ok(wrote);
  });
}
