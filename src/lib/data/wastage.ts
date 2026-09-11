import "server-only";

import type { Wastage } from "@/types";
import { createCachedLoader } from "./reader";

const loadWastage = createCachedLoader<Wastage[]>("wastage.json");

export async function getWastage(): Promise<Wastage[]> {
  return loadWastage();
}
