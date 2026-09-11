import "server-only";

import { getSales, getSaleItems } from "@/lib/data";
import type { Sale, SaleItem } from "@/types";
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
  grossSales: number;
  netSales: number;
  totalDiscount: number;
  itemQuantitySold: number;
}

/** Sales (bill headers) within a date range. */
export async function getSalesInRange(range: DateRange): Promise<Sale[]> {
  const sales = await getSales();
  return filterByDateRange(sales, range, (sale) => sale.date);
}

/**
 * Sale line items within a date range. `sale-items.json` has no `date` of
 * its own, so this joins through `sales` on `bill_id` — the intended way
 * to scope large item-level data without loading everything into a
 * component.
 */
export async function getSaleItemsInRange(range: DateRange): Promise<SaleItem[]> {
  const salesInRange = await getSalesInRange(range);
  const billIdsInRange = new Set(salesInRange.map((sale) => sale.bill_id));
  const saleItems = await getSaleItems();
  return saleItems.filter((item) => billIdsInRange.has(item.bill_id));
}

export function getGrossSales(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + sale.gross_amount, 0);
}

/** Net sales = gross - discount (business-rules.md). */
export function getNetSales(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + sale.net_amount, 0);
}

export function getTotalDiscount(sales: Sale[]): number {
  return sales.reduce((sum, sale) => sum + sale.discount, 0);
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
export async function getSalesSummary(range: DateRange): Promise<SalesSummary> {
  const [salesInRange, saleItemsInRange] = await Promise.all([
    getSalesInRange(range),
    getSaleItemsInRange(range),
  ]);

  return {
    range,
    orderCount: getOrderCount(salesInRange),
    grossSales: getGrossSales(salesInRange),
    netSales: getNetSales(salesInRange),
    totalDiscount: getTotalDiscount(salesInRange),
    itemQuantitySold: getItemQuantitySold(saleItemsInRange),
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
  granularity: TrendGranularity = resolveTrendGranularity(range)
): Promise<SalesTrendPoint[]> {
  const salesInRange = await getSalesInRange(range);
  const sums = sumByPeriod(
    salesInRange,
    granularity,
    (sale) => sale.date,
    (sale) => sale.net_amount
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
  granularity: TrendGranularity = resolveTrendGranularity(range)
): Promise<OrdersTrendPoint[]> {
  const salesInRange = await getSalesInRange(range);
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
export async function getSalesByOrderType(range: DateRange): Promise<SalesByOrderType[]> {
  const salesInRange = await getSalesInRange(range);
  const byType = new Map<string, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
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
export async function getSalesByPaymentMethod(range: DateRange): Promise<SalesByPaymentMethod[]> {
  const salesInRange = await getSalesInRange(range);
  const byMethod = new Map<string, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
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
export async function getHourlySales(range: DateRange): Promise<HourlySales[]> {
  const salesInRange = await getSalesInRange(range);
  const byHour = new Map<number, { netSales: number; orderCount: number }>();

  for (const sale of salesInRange) {
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
