import "server-only";

import type { Department } from "@/types";
import { createCachedLoader } from "./reader";

const loadDepartments = createCachedLoader<Department[]>("departments.json");

export async function getDepartments(): Promise<Department[]> {
  return loadDepartments();
}
