import "server-only";

import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/scope";
import { resolveRestaurantContext, type RestaurantContext } from "@/lib/context/restaurant-context";
import { prisma } from "@/lib/db/client";
import type { DateRange } from "@/lib/analytics/date-range";
import type { OrderDetail, OrderSummary, OrdersPageData } from "@/types/order";

export async function requireOrdersContext() {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "manager") {
    throw new Error("FORBIDDEN: Orders require management access");
  }
  return resolveRestaurantContext(user);
}

export function isOrderDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const summarySelect = {
  id: true, petpoojaOrderId: true, orderDate: true, orderedAt: true,
  orderType: true, status: true, coreTotal: true, taxTotal: true,
  discountTotal: true, totalAmount: true, _count: { select: { items: true } },
} satisfies Prisma.SalesOrderSelect;

type SummaryRecord = Prisma.SalesOrderGetPayload<{ select: typeof summarySelect }>;

function summary(row: SummaryRecord): OrderSummary {
  return {
    id: row.id, orderId: row.petpoojaOrderId,
    businessDate: row.orderDate.toISOString().slice(0, 10),
    orderedAt: row.orderedAt.toISOString(), orderType: row.orderType,
    status: row.status, itemCount: row._count.items,
    subtotal: row.coreTotal?.toString() ?? null, tax: row.taxTotal?.toString() ?? null,
    discount: row.discountTotal?.toString() ?? null, total: row.totalAmount?.toString() ?? null,
    paymentMode: null,
  };
}

function outletWhere(context: RestaurantContext): Prisma.SalesOrderWhereInput {
  return { outletId: context.outletId, outlet: { organizationId: context.organizationId } };
}

export async function getOrdersPage(context: RestaurantContext, range: DateRange, requestedPage = 1): Promise<OrdersPageData> {
  if (!isOrderDate(range.from) || !isOrderDate(range.to) || range.from > range.to) {
    throw new Error("VALIDATION: Choose a valid inclusive business-date range");
  }
  const where = {
    ...outletWhere(context),
    orderDate: { gte: new Date(range.from + "T00:00:00.000Z"), lte: new Date(range.to + "T00:00:00.000Z") },
  };
  const [count, bounds] = await Promise.all([
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.aggregate({ where: outletWhere(context), _min: { orderDate: true }, _max: { orderDate: true } }),
  ]);
  const pageSize = 25;
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(count / pageSize)));
  const orders = await prisma.salesOrder.findMany({
    where, select: summarySelect, orderBy: [{ orderDate: "desc" }, { orderedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize, take: pageSize,
  });
  return {
    orders: orders.map(summary), count, page, pageSize,
    bounds: bounds._min.orderDate && bounds._max.orderDate
      ? { from: bounds._min.orderDate.toISOString().slice(0, 10), to: bounds._max.orderDate.toISOString().slice(0, 10) } : null,
  };
}

export async function getOrderDetail(context: RestaurantContext, id: string): Promise<OrderDetail | null> {
  const row = await prisma.salesOrder.findFirst({
    where: { ...outletWhere(context), id },
    select: {
      ...summarySelect,
      items: { orderBy: { id: "asc" }, select: { id: true, itemName: true, quantity: true, unitPrice: true, totalAmount: true, itemTax: true, itemDiscount: true } },
    },
  });
  if (!row) return null;
  return {
    ...summary(row), tableNumber: null, roundOff: null, serviceCharge: null, deliveryCharge: null, packagingCharge: null,
    items: row.items.map(item => ({
      id: item.id, name: item.itemName, quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(), total: item.totalAmount.toString(),
      tax: item.itemTax?.toString() ?? null, discount: item.itemDiscount?.toString() ?? null,
    })),
  };
}
