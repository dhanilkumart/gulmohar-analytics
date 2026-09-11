import "server-only";

import type { Product } from "@/types";
import { createCachedLoader } from "./reader";

const loadProducts = createCachedLoader<Product[]>("products.json");

export async function getProducts(): Promise<Product[]> {
  return loadProducts();
}
