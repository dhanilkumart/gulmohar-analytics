import "server-only";

import type { Sale } from "@/types";
import { createCachedLoader } from "./reader";

/**
 * sales.json has ~179k rows (~30MB raw). This is loaded and cached
 * in-memory once per server process — it must only ever be called from
 * server-side code (Server Components, Route Handlers, or the analytics
 * layer), never passed down into a Client Component. See
 * docs/architecture.md for why.
 */
const loadSales = createCachedLoader<Sale[]>("sales.json");

export async function getSales(): Promise<Sale[]> {
  return loadSales();
}
