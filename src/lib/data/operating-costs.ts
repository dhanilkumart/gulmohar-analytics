import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { OperatingCost } from "@/types";

/**
 * operating-costs.json loader:
 * In Phase 1, operating expenses (utilities, gas) do not have a dedicated PostgreSQL
 * ledger table.
 *
 * Per business rules:
 * - Keep `getOperatingCosts()` on its verified mock baseline path regardless of DATA_SOURCE.
 * - Do not invent arbitrary expense figures.
 * - Comprehensive general ledger / expense tracking is deferred to Phase 2.
 */
let cachedOperatingCosts: OperatingCost[] | undefined;

function loadOperatingCostsData(): OperatingCost[] {
  if (!cachedOperatingCosts) {
    const filePath = path.join(process.cwd(), "mock_data", "operating-costs.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    cachedOperatingCosts = JSON.parse(raw) as OperatingCost[];
  }
  return cachedOperatingCosts;
}

export async function getOperatingCosts(): Promise<OperatingCost[]> {
  return loadOperatingCostsData();
}