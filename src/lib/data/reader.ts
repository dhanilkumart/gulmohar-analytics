import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * All mock data currently lives in the top-level `mock_data/` folder
 * (sibling to `src/`), which is the canonical source of truth for the
 * demo dataset. This is the ONLY module in the app that knows that path.
 *
 * `server-only` guarantees a build-time error if any of this ever gets
 * imported into a Client Component bundle — the raw JSON must never reach the browser.
 */
const MOCK_DATA_DIR = path.join(process.cwd(), "mock_data");

export type DataSourceMode = "mock" | "database";

/**
 * Returns the currently active data source mode.
 * Defaults to "mock" if process.env.DATA_SOURCE is unset.
 *
 * Strict Rules:
 * 1. Default ("mock"): Reads from local `mock_data/*.json` files.
 * 2. "database": Production database mode. Because the live database loader
 *    implementation is pending production Petpooja data and VPS deployment,
 *    `createCachedLoader` throws an explicit error when invoked in "database" mode
 *    rather than silently falling back to mock data or fabricating false numbers.
 */
export function getDataSourceMode(): DataSourceMode {
  const mode = process.env.DATA_SOURCE?.toLowerCase();
  return mode === "database" ? "database" : "mock";
}

function readMockDataFile<T>(filename: string): T {
  const filePath = path.join(MOCK_DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Creates a lazily-loaded, in-memory-cached accessor for a data file.
 * The file is read and parsed from disk at most once per server process.
 *
 * If DATA_SOURCE=database is set before the database loaders are built,
 * this throws an explicit error immediately to prevent silent mock fallback.
 */
export function createCachedLoader<T>(filename: string): () => T {
  let cached: T | undefined;
  return () => {
    const mode = getDataSourceMode();
    if (mode === "database") {
      throw new Error(
        `[DATA_SOURCE=database] Database loader for "${filename}" is not yet connected. ` +
        `Live order ingestion and database access are pending VPS deployment and confirmed Petpooja production credentials. ` +
        `Set DATA_SOURCE=mock to use mock data.`
      );
    }
    if (cached === undefined) {
      cached = readMockDataFile<T>(filename);
    }
    return cached;
  };
}
