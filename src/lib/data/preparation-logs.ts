import "server-only";

import { prisma } from "@/lib/db/client";

export interface PreparationFilterOptions {
  outletId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  itemId?: string;
}

export interface PreparationRecordItem {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  standardCost: number | null;
  notes: string;
  outletId: string;
  outletCode: string;
  departmentId: string | null;
  departmentName: string | null;
  recordedBy: string;
}

/**
 * Loads preparation logs from PostgreSQL.
 */
export async function getPreparationLogs(options?: PreparationFilterOptions): Promise<PreparationRecordItem[]> {
  const whereClause: {
    outletId?: string;
    preparationItemId?: string;
    date?: {
      gte?: Date;
      lte?: Date;
    };
  } = {};

  if (options?.outletId && options.outletId !== "all") {
    whereClause.outletId = options.outletId;
  }

  if (options?.itemId && options.itemId !== "all") {
    whereClause.preparationItemId = options.itemId;
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

  const logs = await prisma.preparationLog.findMany({
    where: whereClause,
    include: {
      preparationItem: {
        select: { id: true, name: true, code: true, unit: true, standardCost: true },
      },
      outlet: { select: { id: true, code: true } },
      department: { select: { id: true, name: true } },
      recordedBy: { select: { displayName: true } },
    },
    orderBy: { date: "asc" },
  });

  return logs.map((log) => ({
    id: log.id,
    date: log.date.toISOString().split("T")[0],
    itemId: log.preparationItemId,
    itemName: log.preparationItem.name,
    itemCode: log.preparationItem.code,
    unit: log.preparationItem.unit,
    quantity: Number(log.quantity),
    standardCost: log.preparationItem.standardCost !== null ? Number(log.preparationItem.standardCost) : null,
    notes: log.notes || "",
    outletId: log.outletId,
    outletCode: log.outlet.code,
    departmentId: log.departmentId,
    departmentName: log.department?.name || null,
    recordedBy: log.recordedBy.displayName,
  }));
}

