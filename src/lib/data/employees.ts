import "server-only";

import type { Employee } from "@/types";
import { createCachedLoader } from "./reader";

const loadEmployees = createCachedLoader<Employee[]>("employees.json");

export async function getEmployees(): Promise<Employee[]> {
  return loadEmployees();
}
