import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Preparation } from "@/types";

/**
 * preparation.json loader:
 * In Phase 1, daily kitchen preparation logs and batch schedule tracking do not have
 * a dedicated PostgreSQL table (only WastageRecord exists).
 *
 * Per business rules:
 * - Keep `getPreparation()` on its existing mock-data path regardless of DATA_SOURCE.
 * - Do not invent preparation records or calculate prepared = sold + wasted.
 * - Database-backed preparation tracking is explicitly deferred to Phase 2.
 */
let cachedPreparation: Preparation[] | undefined;

function loadPreparationData(): Preparation[] {
  if (!cachedPreparation) {
    const filePath = path.join(process.cwd(), "mock_data", "preparation.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    cachedPreparation = JSON.parse(raw) as Preparation[];
  }
  return cachedPreparation;
}

export async function getPreparation(): Promise<Preparation[]> {
  return loadPreparationData();
}