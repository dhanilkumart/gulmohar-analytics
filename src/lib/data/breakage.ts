import "server-only";

import type { Breakage } from "@/types";
import { createCachedLoader } from "./reader";

const loadBreakage = createCachedLoader<Breakage[]>("breakage.json");

export async function getBreakage(): Promise<Breakage[]> {
  return loadBreakage();
}
