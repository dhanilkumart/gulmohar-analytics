import "server-only";

import type { SaleItem } from "@/types";
import { createCachedLoader } from "./reader";

/**
 * sale-items.json has ~341k rows (~44MB raw) — the largest dataset in the
 * demo. Same server-only, in-memory-cached-once treatment as sales.ts.
 * Prefer the aggregation functions in `src/lib/analytics` over calling
 * this directly from a page/route.
 */
const loadSaleItems = createCachedLoader<SaleItem[]>("sale-items.json");

export async function getSaleItems(): Promise<SaleItem[]> {
  return loadSaleItems();
}
