import "server-only";

import type { OperatingCost } from "@/types";
import { createCachedLoader } from "./reader";

const loadOperatingCosts = createCachedLoader<OperatingCost[]>(
  "operating-costs.json"
);

export async function getOperatingCosts(): Promise<OperatingCost[]> {
  return loadOperatingCosts();
}
