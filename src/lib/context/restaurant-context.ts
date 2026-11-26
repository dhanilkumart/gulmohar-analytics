import "server-only";

import { cache } from "react";
import { restaurantConfig } from "@/config/restaurant";
import { requireUser, type AuthenticatedUser } from "@/lib/auth/scope";
import { prisma } from "@/lib/db/client";

export interface RestaurantContext {
  restaurantName: string;
  organizationId: string;
  outletId: string;
  outletCode: string;
  outlet: { id: string; code: string; name: string; city: string };
}

// React cache is request-scoped in server rendering, never a shared authorization cache.
// API handlers resolve once with their authenticated user and pass the result downstream.
export const resolveRestaurantContext = cache(async (
  user: AuthenticatedUser
): Promise<RestaurantContext> => {
  if (!user.isActive) throw new Error("FORBIDDEN: Active user required");
  const outlet = await prisma.outlet.findUnique({
    where: { code: restaurantConfig.outletCode },
    select: { id: true, code: true, name: true, city: true, organizationId: true, isActive: true },
  });
  if (!outlet) throw new Error(`CONFIGURATION: Configured outlet ${restaurantConfig.outletCode} does not exist`);
  if (!outlet.isActive) throw new Error("CONFIGURATION: Configured outlet is inactive");
  if (outlet.organizationId !== user.organizationId) {
    throw new Error("FORBIDDEN: Configured outlet belongs to another organization");
  }
  if (user.role === "operator") {
    const assignment = await prisma.userOutletAssignment.findUnique({
      where: { userId_outletId: { userId: user.id, outletId: outlet.id } },
      select: { id: true },
    });
    if (!assignment) throw new Error("FORBIDDEN: Operator is not assigned to the configured outlet");
  }
  return {
    restaurantName: restaurantConfig.name,
    organizationId: outlet.organizationId,
    outletId: outlet.id,
    outletCode: outlet.code,
    outlet: { id: outlet.id, code: outlet.code, name: outlet.name, city: outlet.city },
  };
});

export const getRestaurantContext = cache(async () => resolveRestaurantContext(await requireUser()));

export function assertRestaurantRecord(context: RestaurantContext, record: { outletId: string }) {
  if (record.outletId !== context.outletId) {
    throw new Error("FORBIDDEN: Record does not belong to the configured outlet");
  }
}

export async function validateRestaurantDepartment(context: Pick<RestaurantContext, "outletId">, departmentId: string | null) {
  if (!departmentId) return;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, outletId: context.outletId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new Error("FORBIDDEN: Active department must belong to the configured outlet");
}
