import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/client";
import { NormalizedSalesOrder, NormalizedSalesOrderItem } from "@/types/petpooja";
import {
  OutletResolutionContext,
  PetpoojaResolver,
  ResolvedOutlet,
} from "./resolver";

/**
 * Minimal Prisma Transaction interface required by the ingestion service.
 */
export type IngestionTransactionClient = {
  salesOrder: {
    findUnique: (args: any) => Promise<any>;
    upsert: (args: any) => Promise<any>;
  };
  salesOrderItem: {
    deleteMany: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<any>;
  };
};

/**
 * Minimal Prisma interface for executing transactions and queries.
 */
export type IngestionPrismaClient = {
  $transaction: <T>(
    fn: (tx: IngestionTransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number }
  ) => Promise<T>;
  salesOrder: IngestionTransactionClient["salesOrder"];
  salesOrderItem: IngestionTransactionClient["salesOrderItem"];
};

/**
 * Result of ingesting a single normalized order.
 */
export type OrderIngestionResult =
  | {
      success: true;
      status: "created" | "updated" | "skipped";
      orderId: string;
      petpoojaOrderId: string;
      outletId: string;
      itemCount: number;
      unmappedItemCount: number;
    }
  | {
      success: false;
      status: "failed";
      petpoojaOrderId: string;
      outletId?: string;
      error: string;
    };

/**
 * Summary statistics returned after ingesting a batch of orders.
 */
export interface IngestionBatchStatistics {
  totalReceived: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  unmappedItems: number;
  results: OrderIngestionResult[];
}

/**
 * Ingestion options for configuring batch behavior.
 */
export interface IngestionOptions {
  /**
   * Pre-resolved outlet context to avoid redundant database lookups.
   */
  outletContext?: OutletResolutionContext;
  /**
   * If true, aborts the entire batch on the first failed order.
   * Defaults to false (per-order isolation: one failed order does not fail the batch).
   */
  stopOnError?: boolean;
}

/**
 * Petpooja Sales Order Ingestion Service
 *
 * Responsibilities:
 * 1. Upserts `SalesOrder` headers keyed on `@@unique([outletId, petpoojaOrderId])`.
 * 2. Manages atomic line-item replacement:
 *    - Deletes existing `SalesOrderItem` records for the order.
 *    - Inserts the latest normalized line items with resolved product mappings.
 * 3. Preserves `productId = null` for unmatched items without failing.
 * 4. Preserves nullable financial values without inventing false zeros.
 * 5. Supports cancelled orders and subsequent updates.
 * 6. Executes each order within an atomic database transaction.
 */
export class PetpoojaIngestionService {
  private prisma: IngestionPrismaClient;
  private resolver: PetpoojaResolver;

  constructor(
    prismaClient?: IngestionPrismaClient,
    resolver?: PetpoojaResolver
  ) {
    this.prisma = prismaClient ?? (defaultPrisma as unknown as IngestionPrismaClient);
    this.resolver = resolver ?? new PetpoojaResolver();
  }

  /**
   * Ingests a single normalized order inside a dedicated database transaction.
   *
   * @param order Normalized order from Stage 2
   * @param context Pre-fetched resolution context for the outlet (optional)
   */
  public async ingestOrder(
    order: NormalizedSalesOrder,
    context?: OutletResolutionContext
  ): Promise<OrderIngestionResult> {
    try {
      // 1. Resolve outlet if context not provided
      let currentContext = context;
      let resolvedOutlet: ResolvedOutlet;

      if (currentContext) {
        resolvedOutlet = currentContext.outlet;
      } else {
        const outletRes = await this.resolver.resolveOutlet(order.petpoojaRestId);
        if (!outletRes.success) {
          return {
            success: false,
            status: "failed",
            petpoojaOrderId: order.petpoojaOrderId,
            error: `Failed to resolve outlet for restID '${order.petpoojaRestId}': ${outletRes.message}`,
          };
        }
        resolvedOutlet = outletRes.outlet;
        currentContext = await this.resolver.buildOutletResolutionContext(resolvedOutlet);
      }

      // 2. Resolve product items
      let unmappedItemCount = 0;
      const resolvedLineItems = order.items.map((item) => {
        const productRes = this.resolver.resolveProductWithContext(currentContext!, {
          petpoojaItemId: item.petpoojaItemId,
          petpoojaItemCode: item.petpoojaItemCode,
          itemName: item.itemName,
        });

        if (!productRes.productId) {
          unmappedItemCount++;
        }

        return {
          productId: productRes.productId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          itemTax: item.itemTax,
          itemDiscount: item.itemDiscount,
        };
      });

      const matchingStatus =
        unmappedItemCount === 0
          ? "matched"
          : unmappedItemCount === order.items.length
          ? "unmatched"
          : "partially_matched";

      // 3. Execute atomic upsert and line-item replacement in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Check whether the order already exists to determine created vs updated
        const existing = await tx.salesOrder.findUnique({
          where: {
            outletId_petpoojaOrderId: {
              outletId: resolvedOutlet.outletId,
              petpoojaOrderId: order.petpoojaOrderId,
            },
          },
          select: { id: true },
        });

        const isUpdate = Boolean(existing);

        // Date conversions:
        // orderDate is stored as midnight UTC Date (PostgreSQL @db.Date)
        const orderDateObj = new Date(`${order.orderDate}T00:00:00.000Z`);

        // Upsert SalesOrder header
        const salesOrder = await tx.salesOrder.upsert({
          where: {
            outletId_petpoojaOrderId: {
              outletId: resolvedOutlet.outletId,
              petpoojaOrderId: order.petpoojaOrderId,
            },
          },
          create: {
            outletId: resolvedOutlet.outletId,
            petpoojaOrderId: order.petpoojaOrderId,
            orderDate: orderDateObj,
            orderedAt: order.orderedAt,
            orderType: order.orderType,
            status: order.status,
            coreTotal: order.coreTotal,
            taxTotal: order.taxTotal,
            discountTotal: order.discountTotal,
            totalAmount: order.totalAmount,
            financialStatus: "reconciled",
            matchingStatus,
          },
          update: {
            orderDate: orderDateObj,
            orderedAt: order.orderedAt,
            orderType: order.orderType,
            status: order.status,
            coreTotal: order.coreTotal,
            taxTotal: order.taxTotal,
            discountTotal: order.discountTotal,
            totalAmount: order.totalAmount,
            financialStatus: "reconciled",
            matchingStatus,
          },
        });

        // Atomic child replacement:
        // 1. Delete existing line items for this order
        await tx.salesOrderItem.deleteMany({
          where: { salesOrderId: salesOrder.id },
        });

        // 2. Insert refreshed line items
        if (resolvedLineItems.length > 0) {
          await tx.salesOrderItem.createMany({
            data: resolvedLineItems.map((item) => ({
              salesOrderId: salesOrder.id,
              productId: item.productId,
              itemName: item.itemName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
              itemTax: item.itemTax,
              itemDiscount: item.itemDiscount,
            })),
          });
        }

        return {
          salesOrderId: salesOrder.id,
          isUpdate,
        };
      });

      return {
        success: true,
        status: result.isUpdate ? "updated" : "created",
        orderId: result.salesOrderId,
        petpoojaOrderId: order.petpoojaOrderId,
        outletId: resolvedOutlet.outletId,
        itemCount: resolvedLineItems.length,
        unmappedItemCount,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "failed",
        petpoojaOrderId: order.petpoojaOrderId,
        outletId: context?.outlet.outletId,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Ingests a batch of normalized orders.
   *
   * By default, processes orders with per-order transaction isolation:
   * A failure in one order will not corrupt or roll back previously ingested orders.
   *
   * @param orders Array of normalized orders
   * @param options Batch ingestion options
   */
  public async ingestBatch(
    orders: NormalizedSalesOrder[],
    options?: IngestionOptions
  ): Promise<IngestionBatchStatistics> {
    const stats: IngestionBatchStatistics = {
      totalReceived: orders.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      unmappedItems: 0,
      results: [],
    };

    // Group or resolve outlet context if all orders share the same restID
    let context = options?.outletContext;
    if (!context && orders.length > 0) {
      const firstRestId = orders[0].petpoojaRestId;
      const allSameRestId = orders.every((o) => o.petpoojaRestId === firstRestId);
      if (allSameRestId) {
        const outletRes = await this.resolver.resolveOutlet(firstRestId);
        if (outletRes.success) {
          context = await this.resolver.buildOutletResolutionContext(outletRes.outlet);
        }
      }
    }

    for (const order of orders) {
      const orderResult = await this.ingestOrder(order, context);
      stats.results.push(orderResult);

      if (orderResult.success) {
        if (orderResult.status === "created") stats.created++;
        else if (orderResult.status === "updated") stats.updated++;
        else if (orderResult.status === "skipped") stats.skipped++;

        stats.unmappedItems += orderResult.unmappedItemCount;
      } else {
        stats.failed++;
        if (options?.stopOnError) {
          break;
        }
      }
    }

    return stats;
  }
}

