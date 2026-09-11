import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * All mock data currently lives in the top-level `mock_data/` folder
 * (sibling to `src/`), which is the canonical source of truth for the
 * demo dataset. This is the ONLY module in the app that knows that path.
 *
 * `server-only` guarantees a build-time error if any of this ever gets
 * imported into a Client Component bundle — the raw JSON (sales.json /
 * sale-items.json in particular) must never reach the browser.
 */
const MOCK_DATA_DIR = path.join(process.cwd(), "mock_data");

function readMockDataFile<T>(filename: string): T {
  const filePath = path.join(MOCK_DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Creates a lazily-loaded, in-memory-cached accessor for a mock data
 * file. The file is read and parsed from disk at most once per server
 * process — subsequent calls return the same parsed value. This matters
 * for the large datasets (sales.json, sale-items.json) where re-reading
 * and re-parsing on every call would be wasteful.
 */
export function createCachedLoader<T>(filename: string): () => T {
  let cached: T | undefined;
  return () => {
    if (cached === undefined) {
      cached = readMockDataFile<T>(filename);
    }
    return cached;
  };
}
