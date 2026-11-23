import "server-only";

import { getSales, getSaleItems } from "@/lib/data";
import { prisma } from "@/lib/db/client";
import { getDataSourceMode } from "@/lib/data/reader";
import type { Sale, SaleItem } from "@/types";
import type { SalesFilterOptions } from "@/lib/data/sales";
import {
  filterByDateRange,
  resolveTrendGranularity,
  enumeratePeriods,
  sumByPeriod,
  type DateRange,
  type TrendGranularity,
} from "./date-range";

export interface SalesSummary {
  range: DateRange;
  orderCount: number;
  grossSales: number | null;
  netSales: number | null;
  totalDiscount: number | null;
  totalTax: number | null;
  itemQuantitySold: number;
  isComplete: boolean;
  incompleteSalesCount: number;
}

export interface OrderHealthStatusCount {
  status: string;
  label: string;
  count: number;
  percentage: number;
  totalAmount: number;
}

export interface OrderHealthMetrics {
  totalOrders: number;
  successfulOrders: number;
  complimentaryOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  cancellationRate: number; // percentage (0 - 100)
  failureRate: number;      // percentage (0 - 100)
  statusBreakdown: OrderHealthStatusCount[];
}

/** Sales (bill headers) within a date range with optional scope. */
export async function getSalesInRange(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<Sale[]> {
  const sales = await getSales({
    startDate: range.from,
    endDate: range.to,
    organizationId: options?.organizationId,
    outletId: options?.outletId,
  });
  return filterByDateRange(sales, range, (sale) => sale.date);
}

/**
 * Sale line items within a date range. `sale-items.json` has no `date` of
 * its own, so this joins through `sales` on `bill_id` — the intended way
 * to scope large item-level data without loading everything into a
 * component.
 */
export async function getSaleItemsInRange(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<SaleItem[]> {
  const salesInRange = await getSalesInRange(range, options);
  const billIdsInRange = new Set(salesInRange.map((sale) => sale.bill_id));
  const saleItems = await getSaleItems({
    startDate: range.from,
    endDate: range.to,
    organizationId: options?.organizationId,
    outletId: options?.outletId,
  });
  return saleItems.filter((item) => billIdsInRange.has(item.bill_id));
}

export function getGrossSales(sales: Sale[]): number | null {
  let sum = 0;
  for (const sale of sales) {
    if (sale.gross_amount === null) return null;
    sum += sale.gross_amount;
  }
  return sum;
}

/** Net sales = gross - discount (business-rules.md).
 * If any sale in the collection has an unknown net_amount, returns null
 * to prevent silent undercounting.
 */
export function getNetSales(sales: Sale[]): number | null {
  let sum = 0;
  for (const sale of sales) {
    if (sale.net_amount === null) return null;
    sum += sale.net_amount;
  }
  return sum;
}

export function getTotalDiscount(sales: Sale[]): number | null {
  let sum = 0;
  for (const sale of sales) {
    if (sale.discount === null) return null;
    sum += sale.discount;
  }
  return sum;
}

export function getTotalTax(sales: Sale[]): number | null {
  let sum = 0;
  let hasAnyTax = false;
  for (const sale of sales) {
    if (sale.tax !== undefined && sale.tax !== null) {
      sum += sale.tax;
      hasAnyTax = true;
    }
  }
  return hasAnyTax ? sum : null;
}

export function getOrderCount(sales: Sale[]): number {
  return sales.length;
}

export function getItemQuantitySold(saleItems: SaleItem[]): number {
  return saleItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Convenience aggregation for dashboard pages: fetches sales for a range
 * and returns the headline numbers in one call, instead of the page
 * loading raw `Sale[]` itself.
 */
export async function getSalesSummary(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<SalesSummary> {
  const [salesInRange, saleItemsInRange] = await Promise.all([
    getSalesInRange(range, options),
    getSaleItemsInRange(range, options),
  ]);

  const incompleteSalesCount = salesInRange.filter(
    (s) => s.gross_amount === null || s.discount === null || s.net_amount === null
  ).length;

  return {
    range,
    orderCount: getOrderCount(salesInRange),
    grossSales: getGrossSales(salesInRange),
    netSales: getNetSales(salesInRange),
    totalDiscount: getTotalDiscount(salesInRange),
    totalTax: getTotalTax(salesInRange),
    itemQuantitySold: getItemQuantitySold(saleItemsInRange),
    isComplete: incompleteSalesCount === 0,
    incompleteSalesCount,
  };
}

export interface SalesTrendPoint {
  period: string;
  netSales: number;
}

/**
 * Net sales over time, bucketed by day or week (see `resolveTrendGranularity`).
 * Periods with no sales are included with `netSales: 0` rather than omitted.
 */
export async function getSalesTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range),
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<SalesTrendPoint[]> {
  const salesInRange = await getSalesInRange(range, options);
  const sums = sumByPeriod(
    salesInRange,
    granularity,
    (sale) => sale.date,
    (sale) => (sale.net_amount !== null ? sale.net_amount : 0)
  );
  return enumeratePeriods(range, granularity).map((period) => ({
    period,
    netSales: sums.get(period) ?? 0,
  }));
}

export interface OrdersTrendPoint {
  period: string;
  orderCount: number;
}

/** Order (bill) count over time — same bucketing as `getSalesTrend`. */
export async function getOrdersTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range),
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<OrdersTrendPoint[]> {
  const salesInRange = await getSalesInRange(range, options);
  const sums = sumByPeriod(
    salesInRange,
    granularity,
    (sale) => sale.date,
    () => 1
  );
  return enumeratePeriods(range, granularity).map((period) => ({
    period,
    orderCount: sums.get(period) ?? 0,
  }));
}

export interface SalesByOrderType {
  orderType: string;
  netSales: number;
  orderCount: number;
}

/**
 * Net sales and order count grouped by `Sale.order_type`. Groups are
 * derived from whatever values actually appear in the data (currently
 * "Dine-in" | "Delivery" | "Takeaway") rather than a hardcoded list.
 */
export async function getSalesByOrderType(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<SalesByOrderType[]> {
  const salesInRange = await getSalesInRange(range, options);
  const byType = new Map<string, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
    if (sale.net_amount === null) continue;
    const existing = byType.get(sale.order_type) ?? { netSales: 0, orderCount: 0 };
    existing.netSales += sale.net_amount;
    existing.orderCount += 1;
    byType.set(sale.order_type, existing);
  }

  return Array.from(byType.entries()).map(([orderType, agg]) => ({ orderType, ...agg }));
}

export interface SalesByPaymentMethod {
  paymentMethod: string;
  netSales: number;
  orderCount: number;
}

/**
 * Net sales and order count grouped by `Sale.payment_method`. Groups are
 * derived from whatever values actually appear in the data (currently
 * "Cash" | "Card" | "UPI") rather than a hardcoded list.
 */
export async function getSalesByPaymentMethod(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<SalesByPaymentMethod[]> {
  const salesInRange = await getSalesInRange(range, options);
  const byMethod = new Map<string, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
    if (sale.net_amount === null) continue;
    const existing = byMethod.get(sale.payment_method) ?? { netSales: 0, orderCount: 0 };
    existing.netSales += sale.net_amount;
    existing.orderCount += 1;
    byMethod.set(sale.payment_method, existing);
  }

  return Array.from(byMethod.entries()).map(([paymentMethod, agg]) => ({
    paymentMethod,
    ...agg,
  }));
}

export interface HourlySales {
  /** 0-23, parsed from `Sale.time` ("HH:MM"). */
  hour: number;
  netSales: number;
  orderCount: number;
}

/**
 * Net sales and order count grouped by hour of day (0-23), parsed from
 * `Sale.time`. All 24 hours are returned (zero-filled) so a chart doesn't
 * have gaps for hours with no sales in the range.
 */
export async function getHourlySales(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<HourlySales[]> {
  const salesInRange = await getSalesInRange(range, options);
  const byHour = new Map<number, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
    if (sale.net_amount === null) continue;
    const hour = Number(sale.time.split(":")[0]);
    const existing = byHour.get(hour) ?? { netSales: 0, orderCount: 0 };
    existing.netSales += sale.net_amount;
    existing.orderCount += 1;
    byHour.set(hour, existing);
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    netSales: byHour.get(hour)?.netSales ?? 0,
    orderCount: byHour.get(hour)?.orderCount ?? 0,
  }));
}

export interface ItemSalesRanking {
  itemName: string;
  productId: string;
  quantitySold: number;
  revenue: number;
  averagePrice: number;
  revenueShare: number;
}

/**
 * Item sales ranking grouped directly by item name and product ID.
 * Works seamlessly with both mapped products and unmapped Petpooja items
 * (where productId = null / "").
 */
export async function getItemSalesRanking(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<ItemSalesRanking[]> {
  const saleItems = await getSaleItemsInRange(range, options);

  const byName = new Map<
    string,
    { itemName: string; productId: string; quantitySold: number; revenue: number }
  >();

  let totalRevenue = 0;

  for (const item of saleItems) {
    // Fall back to product_id if item_name is missing (e.g. In mock data)
    const displayName = item.item_name || item.product_id || "Unknown Item";
    const existing = byName.get(displayName) ?? {
      itemName: displayName,
      productId: item.product_id || "",
      quantitySold: 0,
      revenue: 0,
    };

    existing.quantitySold += item.quantity;
    existing.revenue += item.amount;
    if (!existing.productId && item.product_id) {
      existing.productId = item.product_id;
    }
    byName.set(displayName, existing);
    totalRevenue += item.amount;
  }

  const items = Array.from(byName.values()).map((entry) => ({
    itemName: entry.itemName,
    productId: entry.productId,
    quantitySold: entry.quantitySold,
    revenue: entry.revenue,
    averagePrice: entry.quantitySold > 0 ? entry.revenue / entry.quantitySold : 0,
    revenueShare: totalRevenue > 0 ? (entry.revenue / totalRevenue) * 100 : 0,
  }));

  // Sort descending by total revenue
  return items.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Computes Order Health metrics and status distribution for a given date range.
 *
 * Business Rules:
 * - In database mode: Aggregates real Petpooja order statuses from PostgreSQL.
 *   - Success: Completed, revenue-generating orders.
 *   - Complimentary: Completed operational orders with ₹0 billed or 100% comp; separated from ordinary sales.
 *   - Cancelled: Cancelled orders, excluded from completed sales and revenue.
 *   - Failed: Tracked if distinct 'Failed' status exists in DB; currently 0 in Petpooja dataset.
 * - In mock mode: All mock sales represent completed successful orders.
 */
export async function getOrderHealth(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<OrderHealthMetrics> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    const salesInRange = await getSalesInRange(range, options);
    const count = salesInRange.length;
    const totalAmount = salesInRange.reduce((sum, s) => sum + (s.net_amount ?? 0), 0);
    return {
      totalOrders: count,
      successfulOrders: count,
      complimentaryOrders: 0,
      cancelledOrders: 0,
      failedOrders: 0,
      cancellationRate: 0,
      failureRate: 0,
      statusBreakdown: count > 0 ? [
        {
          status: "Success",
          label: "Successful",
          count,
          percentage: 100,
          totalAmount,
        },
      ] : [],
    };
  }

  // Database mode
  const whereClause: {
    outletId?: string;
    outlet?: {
      organizationId: string;
    };
    orderDate?: {
      gte?: Date;
      lte?: Date;
    };
  } = {};

  if (options?.organizationId) {
    whereClause.outlet = { organizationId: options.organizationId };
  }

  if (options?.outletId && options.outletId !== "all") {
    whereClause.outletId = options.outletId;
  }

  if (range.from || range.to) {
    whereClause.orderDate = {};
    if (range.from) {
      whereClause.orderDate.gte = new Date(`${range.from}T00:00:00.000Z`);
    }
    if (range.to) {
      whereClause.orderDate.lte = new Date(`${range.to}T23:59:59.999Z`);
    }
  }

  const grouped = await prisma.salesOrder.groupBy({
    by: ["status"],
    where: whereClause,
    _count: { id: true },
    _sum: { totalAmount: true },
  });

  let totalOrders = 0;
  let successfulOrders = 0;
  let complimentaryOrders = 0;
  let cancelledOrders = 0;
  let failedOrders = 0;

  for (const group of grouped) {
    const count = group._count.id;
    totalOrders += count;
    if (group.status === "Success") {
      successfulOrders += count;
    } else if (group.status === "Complimentary") {
      complimentaryOrders += count;
    } else if (group.status === "Cancelled") {
      cancelledOrders += count;
    } else if (group.status === "Failed") {
      failedOrders += count;
    }
  }

  const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
  const failureRate = totalOrders > 0 ? (failedOrders / totalOrders) * 100 : 0;

  const statusBreakdown: OrderHealthStatusCount[] = grouped.map((group) => {
    const count = group._count.id;
    const pct = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
    const amount = group._sum.totalAmount !== null ? Number(group._sum.totalAmount) : 0;
    let label = group.status;
    if (group.status === "Success") label = "Successful";
    else if (group.status === "Complimentary") label = "Complimentary";
    else if (group.status === "Cancelled") label = "Cancelled";
    else if (group.status === "Failed") label = "Failed";

    return {
      status: group.status,
      label,
      count,
      percentage: Math.round(pct * 10) / 10,
      totalAmount: amount,
    };
  });

  // Sort breakdown with standard operational order: Success -> Complimentary -> Cancelled -> Failed -> other
  const statusOrderMap: Record<string, number> = {
    Success: 1,
    Complimentary: 2,
    Cancelled: 3,
    Failed: 4,
  };
  statusBreakdown.sort((a, b) => (statusOrderMap[a.status] ?? 99) - (statusOrderMap[b.status] ?? 99));

  return {
    totalOrders,
    successfulOrders,
    complimentaryOrders,
    cancelledOrders,
    failedOrders,
    cancellationRate: Math.round(cancellationRate * 100) / 100,
    failureRate: Math.round(failureRate * 100) / 100,
    statusBreakdown,
  };
}

export interface DailySalesKpiPoint {
  date: string;
  netSales: number;
  totalOrders: number;
  aov: number;
  itemsSold: number;
}

export interface DailySalesKpiTrends {
  points: DailySalesKpiPoint[];
  hasData: boolean;
}

/**
 * Returns actual daily aggregated trends for Sales Analytics KPI mini charts
 * (Total Sales, Total Orders, Average Order Value, Items Sold).
 *
 * Rules:
 * - Enumerates every calendar day in `range` so days with 0 activity are preserved.
 * - Total Sales: daily net revenue (Success orders).
 * - Total Orders: all valid ingested orders (Success, Complimentary, Cancelled, etc.), matching Total Orders KPI.
 * - AOV: daily net sales divided by successful orders count (or 0 if 0 successful orders).
 * - Items Sold: daily quantity of items sold from Success orders.
 * - Respects timezones (Asia/Kolkata date grouping).
 */
export async function getDailySalesKpiTrends(
  range: DateRange,
  options?: Pick<SalesFilterOptions, "organizationId" | "outletId">
): Promise<DailySalesKpiTrends> {
  const mode = getDataSourceMode();
  const allDays = enumeratePeriods(range, "day");

  if (mode === "mock") {
    const [salesInRange, saleItemsInRange] = await Promise.all([
      getSalesInRange(range, options),
      getSaleItemsInRange(range, options),
    ]);

    const salesByDay = sumByPeriod(
      salesInRange,
      "day",
      (s) => s.date,
      (s) => (s.net_amount !== null ? s.net_amount : 0)
    );
    const ordersByDay = sumByPeriod(
      salesInRange,
      "day",
      (s) => s.date,
      () => 1
    );

    const billDateMap = new Map(salesInRange.map((s) => [s.bill_id, s.date]));
    const itemsByDay = new Map<string, number>();
    for (const item of saleItemsInRange) {
      const date = billDateMap.get(item.bill_id);
      if (date) {
        itemsByDay.set(date, (itemsByDay.get(date) ?? 0) + item.quantity);
      }
    }

    let hasNonZero = false;
    const points: DailySalesKpiPoint[] = allDays.map((d) => {
      const netSales = salesByDay.get(d) ?? 0;
      const totalOrders = ordersByDay.get(d) ?? 0;
      const aov = totalOrders > 0 ? netSales / totalOrders : 0;
      const itemsSold = itemsByDay.get(d) ?? 0;
      if (netSales > 0 || totalOrders > 0 || itemsSold > 0) {
        hasNonZero = true;
      }
      return { date: d, netSales, totalOrders, aov, itemsSold };
    });

    return { points, hasData: hasNonZero && points.length > 0 };
  }

  // Database mode: PostgreSQL via Prisma
  try {
    const orderWhereClause: {
      outletId?: string;
      outlet?: {
        organizationId: string;
      };
      orderDate?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (options?.organizationId) {
      orderWhereClause.outlet = { organizationId: options.organizationId };
    }
    if (options?.outletId && options.outletId !== "all") {
      orderWhereClause.outletId = options.outletId;
    }
    if (range.from || range.to) {
      orderWhereClause.orderDate = {};
      if (range.from) {
        orderWhereClause.orderDate.gte = new Date(`${range.from}T00:00:00.000Z`);
      }
      if (range.to) {
        orderWhereClause.orderDate.lte = new Date(`${range.to}T23:59:59.999Z`);
      }
    }

    const [ordersGrouped, itemRows] = await Promise.all([
      prisma.salesOrder.groupBy({
        by: ["orderDate", "status"],
        where: orderWhereClause,
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.salesOrderItem.findMany({
        where: {
          salesOrder: {
            ...orderWhereClause,
            status: "Success",
          },
        },
        select: {
          quantity: true,
          salesOrder: {
            select: {
              orderDate: true,
            },
          },
        },
      }),
    ]);

    const dailyTotalOrders = new Map<string, number>();
    const dailyNetSales = new Map<string, number>();
    const dailySuccessOrders = new Map<string, number>();

    for (const group of ordersGrouped) {
      const d = group.orderDate.toISOString().slice(0, 10);
      const count = group._count.id;
      dailyTotalOrders.set(d, (dailyTotalOrders.get(d) ?? 0) + count);
      if (group.status === "Success") {
        dailySuccessOrders.set(d, (dailySuccessOrders.get(d) ?? 0) + count);
        dailyNetSales.set(d, (dailyNetSales.get(d) ?? 0) + (group._sum.totalAmount ? Number(group._sum.totalAmount) : 0));
      }
    }

    const dailyItemsSold = new Map<string, number>();
    for (const item of itemRows) {
      const d = item.salesOrder.orderDate.toISOString().slice(0, 10);
      dailyItemsSold.set(d, (dailyItemsSold.get(d) ?? 0) + Number(item.quantity));
    }

    let hasNonZero = false;
    const points: DailySalesKpiPoint[] = allDays.map((d) => {
      const netSales = dailyNetSales.get(d) ?? 0;
      const totalOrders = dailyTotalOrders.get(d) ?? 0;
      const successOrders = dailySuccessOrders.get(d) ?? 0;
      const aov = successOrders > 0 ? netSales / successOrders : 0;
      const itemsSold = dailyItemsSold.get(d) ?? 0;

      if (netSales > 0 || totalOrders > 0 || itemsSold > 0) {
        hasNonZero = true;
      }

      return { date: d, netSales, totalOrders, aov, itemsSold };
    });

    return { points, hasData: hasNonZero && points.length > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to compute daily sales KPI trends: ${message}`);
  }
}

