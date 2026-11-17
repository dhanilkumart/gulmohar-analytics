import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Employee } from "@/types";

/**
 * employees.json loader:
 * In Phase 1, executive summary headcount and manpower analytics use the verified mock baseline.
 * Live staff synchronization and payroll calculations are deferred to Phase 2.
 */
let cachedEmployees: Employee[] | undefined;

function loadEmployeesData(): Employee[] {
  if (!cachedEmployees) {
    const filePath = path.join(process.cwd(), "mock_data", "employees.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    cachedEmployees = JSON.parse(raw) as Employee[];
  }
  return cachedEmployees;
}

export async function getEmployees(): Promise<Employee[]> {
  return loadEmployeesData();
}