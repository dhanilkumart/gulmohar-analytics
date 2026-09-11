import "server-only";

import type { Restaurant } from "@/types";
import { createCachedLoader } from "./reader";

const loadRestaurant = createCachedLoader<Restaurant>("restaurant.json");

/**
 * Restaurant metadata (single record). Swap this implementation to call
 * a backend API/database without changing the function signature — see
 * docs/architecture.md.
 */
export async function getRestaurant(): Promise<Restaurant> {
  return loadRestaurant();
}
