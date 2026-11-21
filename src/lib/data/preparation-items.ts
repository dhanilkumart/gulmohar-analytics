import "server-only";

import { prisma } from "@/lib/db/client";

export interface PreparationItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  standardCost: number | null;
  departmentId: string | null;
  departmentName?: string | null;
  isActive: boolean;
}

export async function getPreparationItems(organizationId?: string): Promise<PreparationItemOption[]> {
  const where: { organizationId?: string; isActive: boolean } = { isActive: true };
  if (organizationId) {
    where.organizationId = organizationId;
  }

  const items = await prisma.preparationItem.findMany({
    where,
    include: { department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return items.map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    unit: i.unit,
    standardCost: i.standardCost !== null ? Number(i.standardCost) : null,
    departmentId: i.departmentId,
    departmentName: i.department?.name || null,
    isActive: i.isActive,
  }));
}

