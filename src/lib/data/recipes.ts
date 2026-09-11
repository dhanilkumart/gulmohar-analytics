import "server-only";

import type { Recipe } from "@/types";
import { createCachedLoader } from "./reader";

const loadRecipes = createCachedLoader<Recipe[]>("recipes.json");

export async function getRecipes(): Promise<Recipe[]> {
  return loadRecipes();
}
