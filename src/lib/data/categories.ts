import "server-only";

import type { Category } from "@/types";
import { createCachedLoader } from "./reader";

const loadCategories = createCachedLoader<Category[]>("categories.json");

export async function getCategories(): Promise<Category[]> {
  return loadCategories();
}
