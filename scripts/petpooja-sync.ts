/**
 * Petpooja Sales Synchronization CLI Script
 *
 * PURPOSE:
 *   CLI runner for Petpooja Generic Get Orders API pull sync.
 *   Transactionally ingests orders into PostgreSQL via Prisma.
 *
 * USAGE:
 *   # Sync specific date:
 *   npm run petpooja:sync -- --date=2026-11-20
 *   or:
 *   npm run petpooja:sync -- 2026-11-20
 *
 *   # Sync historical date range (inclusive):
 *   npm run petpooja:sync -- --from=2026-11-01 --to=2026-11-22
 *
 *   # Default (yesterday / T-1):
 *   npm run petpooja:sync
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PetpoojaSyncOrchestrator } from "../src/lib/petpooja/sync";

// -----------------------------------------------------------------------------
// 1. Environment Variable Loader (Safe fallback if .env not pre-loaded by shell)
// -----------------------------------------------------------------------------
function loadEnvFile(envPath: string) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env"));

// -----------------------------------------------------------------------------
// 2. Command Line Argument Parsing
// -----------------------------------------------------------------------------
function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

const args = process.argv.slice(2);
let fromDate: string | null = null;
let toDate: string | null = null;
let singleDate: string | null = null;

for (const arg of args) {
  if (arg.startsWith("--from=")) {
    fromDate = arg.split("=")[1].trim();
  } else if (arg.startsWith("--to=")) {
    toDate = arg.split("=")[1].trim();
  } else if (arg.startsWith("--date=")) {
    singleDate = arg.split("=")[1].trim();
  } else if (!arg.startsWith("--") && /^\d{4}-\d{2}-\d{2}$/.test(arg.trim())) {
    singleDate = arg.trim();
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

if (fromDate && !DATE_REGEX.test(fromDate)) {
  console.error(`❌ Invalid --from date: '${fromDate}'. Expected YYYY-MM-DD.`);
  process.exit(1);
}

if (toDate && !DATE_REGEX.test(toDate)) {
  console.error(`❌ Invalid --to date: '${toDate}'. Expected YYYY-MM-DD.`);
  process.exit(1);
}

if (singleDate && !DATE_REGEX.test(singleDate)) {
  console.error(`❌ Invalid date: '${singleDate}'. Expected YYYY-MM-DD.`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 3. Main Execution
// -----------------------------------------------------------------------------
async function main() {
  const orchestrator = new PetpoojaSyncOrchestrator();

  console.log("==================================================================");
  console.log("🚀 PETPOOJA SALES SYNCHRONIZATION PIPELINE");
  console.log("==================================================================");

  let targetDates: string[] = [];

  if (fromDate && toDate) {
    console.log(`• Mode: Date Range (${fromDate} to ${toDate})`);
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    if (from > to) {
      console.error(`❌ Error: --from (${fromDate}) cannot be after --to (${toDate}).`);
      process.exit(1);
    }
    const curr = new Date(from);
    while (curr <= to) {
      targetDates.push(curr.toISOString().split("T")[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
  } else if (fromDate || toDate) {
    console.error("❌ Both --from and --to must be specified together for range sync.");
    process.exit(1);
  } else if (singleDate) {
    console.log(`• Mode: Single Date (${singleDate})`);
    targetDates = [singleDate];
  } else {
    const defaultDate = getYesterdayDateString();
    console.log(`• Mode: Default Yesterday (${defaultDate})`);
    targetDates = [defaultDate];
  }

  console.log(`• Total Dates to Process: ${targetDates.length}`);
  console.log("------------------------------------------------------------------");

  let grandTotalOrders = 0;
  let grandTotalCreated = 0;
  let grandTotalUpdated = 0;
  let grandTotalSkipped = 0;
  let grandTotalFailed = 0;

  for (const date of targetDates) {
    console.log(`\n⏳ [${date}] Starting pull sync...`);
    const result = await orchestrator.syncDate(date);

    grandTotalOrders += result.totalOrdersReceived;
    grandTotalCreated += result.created;
    grandTotalUpdated += result.updated;
    grandTotalSkipped += result.skipped;
    grandTotalFailed += result.failed;

    if (result.success) {
      console.log(
        `✅ [${date}] Success | Received: ${result.totalOrdersReceived} | Created: ${result.created} | Updated: ${result.updated} | Failed: ${result.failed} | Pages: ${result.pagesFetched} (${result.durationMs}ms)`
      );
    } else {
      console.log(
        `⚠️ [${date}] Completed with errors | Received: ${result.totalOrdersReceived} | Created: ${result.created} | Updated: ${result.updated} | Failed: ${result.failed} (${result.durationMs}ms)`
      );
      for (const err of result.errors.slice(0, 3)) {
        console.log(`   - [${err.stage}] ${err.message}`);
      }
    }
  }

  console.log("\n==================================================================");
  console.log("📊 SYNC PIPELINE SUMMARY");
  console.log("==================================================================");
  console.log(`• Processed Dates:    ${targetDates.length}`);
  console.log(`• Total Received:     ${grandTotalOrders}`);
  console.log(`• Created Orders:     ${grandTotalCreated}`);
  console.log(`• Updated Orders:     ${grandTotalUpdated}`);
  console.log(`• Skipped Orders:     ${grandTotalSkipped}`);
  console.log(`• Failed Orders:      ${grandTotalFailed}`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("❌ Fatal Error in Petpooja Sync:", err);
  process.exit(1);
});

