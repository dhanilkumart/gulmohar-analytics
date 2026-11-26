import "server-only";

import type { SalesScope } from "@/lib/data/sales";
import { requireUser, resolveAuthorizedOutletScope } from "./scope";

export async function getDashboardSalesScope(
  requestedOutlet: string | string[] | undefined
): Promise<SalesScope> {
  const user = await requireUser();
  const outletId = Array.isArray(requestedOutlet) ? requestedOutlet[0] : requestedOutlet;
  const { targetOutletId, allowedOutlets } = await resolveAuthorizedOutletScope(user, outletId);
  return {
    organizationId: user.organizationId,
    outletId: targetOutletId,
    authorizedOutletIds: targetOutletId === undefined ? allowedOutlets.map((outlet) => outlet.id) : undefined,
  };
}
