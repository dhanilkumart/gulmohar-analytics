import "server-only";

import type { SalesScope } from "@/lib/data/sales";
import { getRestaurantContext } from "@/lib/context/restaurant-context";

export async function getDashboardSalesScope(): Promise<SalesScope> {
  const { organizationId, outletId } = await getRestaurantContext();
  return { organizationId, outletId };
}
