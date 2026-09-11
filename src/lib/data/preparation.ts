import "server-only";

import type { Preparation } from "@/types";
import { createCachedLoader } from "./reader";

const loadPreparation = createCachedLoader<Preparation[]>("preparation.json");

export async function getPreparation(): Promise<Preparation[]> {
  return loadPreparation();
}
