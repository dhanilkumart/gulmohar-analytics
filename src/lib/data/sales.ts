import "server-only";

import type { Sale } from "@/types";
import { prisma } from "@/lib/db/client";

/**
 * Filter options for reading sales from PostgreSQL.
 */
export interface SalesScope {
  organizationId?: string;
  outletId?: string;
  authorizedOutletIds?: string[];
}

export function getSalesOutletFilter(scope?: SalesScope) {
  if (scope?.authorizedOutletIds !== undefined) {
    return { in: scope.authorizedOutletIds };
  }
  return scope?.outletId === "all" ? undefined : scope?.outletId;
}

export interface SalesFilterOptions extends SalesScope {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

/**
 * Loads sales from PostgreSQL.
 *
 * Business Rules:
 * - Only orders with status = 'Success' are returned.
 * - Cancelled orders are strictly excluded from revenue/order counts.
 * - Missing financial values (core_total, discount_total, total_amount)
 *   are preserved without inventing artificial numbers.
 * - If database access fails, a clear error is thrown (never silent mock fallback).
 */
export async function getSales(options?: SalesFilterOptions): Promise<Sale[]> {
  try {
    const whereClause: {
      status: string;
      outletId?: ReturnType<typeof getSalesOutletFilter>;
      outlet?: {
        organizationId: string;
      };
      orderDate?: {
        gte?: Date;
        lte?: Date;
      };
    } = {
      status: "Success",
      outletId: getSalesOutletFilter(options),
    };

    if (options?.organizationId) {
      whereClause.outlet = { organizationId: options.organizationId };
    }

    if (options?.startDate || options?.endDate) {
      whereClause.orderDate = {};
      if (options.startDate) {
        whereClause.orderDate.gte = new Date(`${options.startDate}T00:00:00.000Z`);
      }
      if (options.endDate) {
        whereClause.orderDate.lte = new Date(`${options.endDate}T23:59:59.999Z`);
      }
    }

    const orders = await prisma.salesOrder.findMany({
      where: whereClause,
      orderBy: { orderedAt: "asc" },
    });

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return orders.map((order) => {
      // Format date as YYYY-MM-DD
      const dateStr = order.orderDate.toISOString().split("T")[0];
      // Format time as HH:MM in IST (Asia/Kolkata)
      const timeStr = timeFormatter.format(order.orderedAt);

      const grossAmount = order.coreTotal !== null ? Number(order.coreTotal) : null;
      const discount = order.discountTotal !== null ? Number(order.discountTotal) : null;
      const taxAmount = order.taxTotal !== null ? Number(order.taxTotal) : null;
      // Per business rules: Net sales = gross - discount. If totalAmount exists, use it;
      // otherwise compute gross - discount only if both are known.
      const netAmount = order.totalAmount !== null
        ? Number(order.totalAmount)
        : (grossAmount !== null && discount !== null ? grossAmount - discount : null);

      return {
        bill_id: order.petpoojaOrderId,
        date: dateStr,
        time: timeStr,
        order_type: order.orderType,
        gross_amount: grossAmount,
        discount: discount,
        net_amount: netAmount,
        payment_method: "Other", // Payment breakdown is deferred; placeholder matches Sale interface string
        tax: taxAmount,
      };
    });
  } catch (error) {
    throw new Error("Failed to load sales from PostgreSQL", { cause: error });
  }
}