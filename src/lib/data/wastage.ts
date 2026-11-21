import "server-only";

import type { Wastage } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";

/**
 * Filter options for reading wastage records from PostgreSQL or mock data.
 */
export interface WastageFilterOptions {
  outletId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

const loadWastageMock = createCachedLoader<Wastage[]>("wastage.json");

/**
 * Loads wastage records from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
 *
 * Business Rules:
 * - Reads from `WastageRecord` in PostgreSQL.
 * - Supports outletId, startDate, and endDate filtering.
 * - Preserves NULL food costs without inventing artificial baseline numbers.
 *   `estimated_cost` reflects `record.estimatedCost !== null ? Number(record.estimatedCost) : (null as unknown as number)`.
 * - Maps `product.productCode` to `product_id` (fallback to `productId`).
 * - Maps `wastedQuantity` to `quantity`.
 * - If database access fails, throws an explicit error (never silent mock fallback).
 */
export async function getWastage(options?: WastageFilterOptions): Promise<Wastage[]> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    let records = loadWastageMock();
    if (options?.startDate || options?.endDate) {
      records = records.filter((r) => {
        if (options.startDate && r.date < options.startDate) return false;
        if (options.endDate && r.date > options.endDate) return false;
        return true;
      });
    }
    return records;
  }

  // Database mode: Read from PostgreSQL via Prisma
  try {
    const whereClause: {
      outletId?: string;
      date?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (options?.outletId && options.outletId !== "all") {
      whereClause.outletId = options.outletId;
    }

    if (options?.startDate || options?.endDate) {
      whereClause.date = {};
      if (options.startDate) {
        whereClause.date.gte = new Date(`${options.startDate}T00:00:00.000Z`);
      }
      if (options.endDate) {
        whereClause.date.lte = new Date(`${options.endDate}T23:59:59.999Z`);
      }
    }

    const records = await prisma.wastageRecord.findMany({
      where: whereClause,
      include: {
        preparationItem: {
          select: {
            code: true,
            name: true,
            unit: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    return records.map((r) => {
      const dateStr = r.date.toISOString().split("T")[0];
      const estimatedCost = r.estimatedCost !== null
        ? Number(r.estimatedCost)
        : null;

      return {
        wastage_id: r.id,
        date: dateStr,
        product_id: r.preparationItem?.code || r.preparationItemId,
        quantity: Number(r.wastedQuantity),
        unit: r.preparationItem?.unit || "portion",
        reason: r.reason,
        estimated_cost: estimatedCost,
        department_id: r.departmentId || "Kitchen",
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load wastage records from PostgreSQL: ${message}`);
  }
}