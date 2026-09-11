import "server-only";

import type { Ingredient } from "@/types";
import { createCachedLoader } from "./reader";

const loadIngredients = createCachedLoader<Ingredient[]>("ingredients.json");

export async function getIngredients(): Promise<Ingredient[]> {
  return loadIngredients();
}
