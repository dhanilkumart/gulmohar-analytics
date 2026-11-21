import "server-only";

import { prisma } from "@/lib/db/client";

export interface MasterOptions {
  preparationItems: { id: string; code: string; name: string; unit: string; standardCost: number | null; departmentId: string | null }[];
  breakageItems: { id: string; code: string; name: string; category: string; replacementCost: number | null }[];
  wastageReasons: { id: string; code: string; label: string }[];
  breakageReasons: { id: string; code: string; label: string }[];
}

/**
 * Loads all active master dropdown options for an organization.
 * Used by server components and form loaders to populate selects strictly from PostgreSQL.
 */
export async function getActiveMasterOptions(organizationId?: string): Promise<MasterOptions> {
  const orgFilter = organizationId ? { organizationId } : {};

  const [preparationItems, breakageItems, wastageReasons, breakageReasons] = await Promise.all([
    prisma.preparationItem.findMany({
      where: { ...orgFilter, isActive: true },
      select: { id: true, code: true, name: true, unit: true, standardCost: true, departmentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.breakageItem.findMany({
      where: { ...orgFilter, isActive: true },
      select: { id: true, code: true, name: true, category: true, replacementCost: true },
      orderBy: { name: "asc" },
    }),
    prisma.wastageReason.findMany({
      where: { ...orgFilter, isActive: true },
      select: { id: true, code: true, label: true },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    }),
    prisma.breakageReason.findMany({
      where: { ...orgFilter, isActive: true },
      select: { id: true, code: true, label: true },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    }),
  ]);

  return {
    preparationItems: preparationItems.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      standardCost: i.standardCost !== null ? Number(i.standardCost) : null,
      departmentId: i.departmentId,
    })),
    breakageItems: breakageItems.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      replacementCost: i.replacementCost !== null ? Number(i.replacementCost) : null,
    })),
    wastageReasons,
    breakageReasons,
  };
}

