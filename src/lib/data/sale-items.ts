import "server-only";

import type { SaleItem } from "@/types";
import { prisma } from "@/lib/db/client";
import { getSalesOutletFilter, type SalesFilterOptions } from "./sales";

/**
 * Loads sale items from PostgreSQL.
 *
 * Business Rules:
 * - Only items belonging to orders with status = 'Success' are returned.
 * - Items from cancelled orders are strictly excluded.
 * - Respects outlet and date filtering applied to parent sales orders.
 * - If product is unmapped (product_id is null), product_id falls back to empty string
 *   or item name, preserving unmapped state without inventing false mappings.
 * - If database access fails, a clear error is thrown (never silent mock fallback).
 */
export async function getSaleItems(options?: SalesFilterOptions): Promise<SaleItem[]> {
  try {
    const orderWhereClause: {
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
      orderWhereClause.outlet = { organizationId: options.organizationId };
    }

    if (options?.startDate || options?.endDate) {
      orderWhereClause.orderDate = {};
      if (options.startDate) {
        orderWhereClause.orderDate.gte = new Date(`${options.startDate}T00:00:00.000Z`);
      }
      if (options.endDate) {
        orderWhereClause.orderDate.lte = new Date(`${options.endDate}T23:59:59.999Z`);
      }
    }

    const items = await prisma.salesOrderItem.findMany({
      where: {
        salesOrder: orderWhereClause,
      },
      include: {
        salesOrder: {
          select: {
            petpoojaOrderId: true,
            orderDate: true,
          },
        },
        product: {
          select: {
            productCode: true,
            name: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return items.map((item) => {
      // If item is linked to a Product, use productCode or product ID;
      // otherwise fallback to empty string to indicate unmapped product.
      const productId = item.product?.productCode || item.productId || "";
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const amount = Number(item.totalAmount);

      return {
        sale_item_id: item.id,
        bill_id: item.salesOrder.petpoojaOrderId,
        date: item.salesOrder.orderDate.toISOString().slice(0, 10),
        product_id: productId,
        item_name: item.itemName,
        product_name: item.product?.name,
        quantity,
        unit_price: unitPrice,
        amount,
      };
    });
  } catch (error) {
    throw new Error("Failed to load sale items from PostgreSQL", { cause: error });
  }
}