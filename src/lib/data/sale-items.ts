import "server-only";

import type { SaleItem } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";
import type { SalesFilterOptions } from "./sales";

/**
 * sale-items.json has ~341k rows (~44MB raw) — loaded and cached in-memory
 * once per server process in mock mode.
 */
const loadSaleItemsMock = createCachedLoader<SaleItem[]>("sale-items.json");

/**
 * Loads sale items from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
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
  const mode = getDataSourceMode();

  if (mode === "mock") {
    // In mock mode, sale-items do not have date/outlet directly on them;
    // mock analytics joins via bill_id through getSalesInRange().
    return loadSaleItemsMock();
  }

  // Database mode: Read from PostgreSQL via Prisma
  try {
    const orderWhereClause: {
      status: string;
      outletId?: string;
      outlet?: {
        organizationId: string;
      };
      orderDate?: {
        gte?: Date;
        lte?: Date;
      };
    } = {
      status: "Success",
    };

    if (options?.organizationId) {
      orderWhereClause.outlet = { organizationId: options.organizationId };
    }

    if (options?.outletId && options.outletId !== "all") {
      orderWhereClause.outletId = options.outletId;
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
          },
        },
        product: {
          select: {
            productCode: true,
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
        product_id: productId,
        item_name: item.itemName,
        quantity,
        unit_price: unitPrice,
        amount,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load sale items from PostgreSQL: ${message}`);
  }
}