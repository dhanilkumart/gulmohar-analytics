import "server-only";

import type { Breakage } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";

/**
 * Filter options for reading breakage records from PostgreSQL or mock data.
 */
export interface BreakageFilterOptions {
  outletId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

const loadBreakageMock = createCachedLoader<Breakage[]>("breakage.json");

/**
 * Loads breakage records from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
 *
 * Business Rules:
 * - Reads from `BreakageRecord` in PostgreSQL.
 * - Supports outletId, startDate, and endDate filtering.
 * - Preserves NULL unit cost and total cost: adheres to strict NULL-cost policy until
 *   an approved tableware replacement cost catalog exists. Never invents baseline costs.
 *   `estimated_cost` reflects `record.totalCost !== null ? Number(record.totalCost) : (null as unknown as number)`.
 * - Maps `department.departmentCode` to `department_id` (fallback to `departmentId`).
 * - Maps `broken_qty` to `quantity`.
 * - If database access fails, throws an explicit error (never silent mock fallback).
 */
export async function getBreakage(options?: BreakageFilterOptions): Promise<Breakage[]> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    let records = loadBreakageMock();
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

    const records = await prisma.breakageRecord.findMany({
      where: whereClause,
      include: {
        department: {
          select: {
            departmentCode: true,
            name: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    return records.map((r) => {
      const dateStr = r.date.toISOString().split("T")[0];
      const estimatedCost = r.totalCost !== null
        ? Number(r.totalCost)
        : null;

      return {
        breakage_id: r.id,
        date: dateStr,
        item: r.item,
        quantity: r.brokenQty,
        estimated_cost: estimatedCost,
        department_id: r.department?.departmentCode || r.departmentId,
        reason: r.reason,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load breakage records from PostgreSQL: ${message}`);
  }
}