import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { restaurantConfig } from "../src/config/restaurant";
import { SyncHistory, istDate, runDailySync, shiftSyncDate } from "../src/lib/petpooja/daily-sync";
import { SyncLockBusyError, withSyncLock } from "../src/lib/petpooja/sync-lock";
import { retrySync, ScheduledPetpoojaClient } from "../src/lib/petpooja/sync-retry";
import { PetpoojaSyncOrchestrator } from "../src/lib/petpooja/sync";
import { PetpoojaResolver } from "../src/lib/petpooja/resolver";
import { PetpoojaIngestionService, type IngestionPrismaClient, type IngestionTransactionClient } from "../src/lib/petpooja/ingestion-service";

function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("invalid_worker_configuration");
  return value;
}

export async function main(args = process.argv.slice(2), legacy = false): Promise<void> {
  if (args.includes("--help")) {
    console.log("Petpooja worker: --check | --daily | --date=YYYY-MM-DD | --from=YYYY-MM-DD --to=YYYY-MM-DD. See docs/petpooja-synchronization.md.");
    return;
  }
  let client: PrismaClient | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const stop = () => { abort.abort(); shutdown ??= setTimeout(() => process.exit(130), 25000); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    // Shell/container settings take precedence; never persist or print loaded secrets.
    if (existsSync(".env")) {
      for (const [key, value] of Object.entries(parseEnv(readFileSync(".env", "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
    const now = new Date();
    const dateArgument = args.find(value => value.startsWith("--date="))?.slice(7) ?? args.find(value => /^\d{4}-\d{2}-\d{2}$/.test(value));
    const from = args.find(value => value.startsWith("--from="))?.slice(7);
    const to = args.find(value => value.startsWith("--to="))?.slice(5);
    const dateFlags = args.filter(value => value.startsWith("--date=") || /^\d{4}-\d{2}-\d{2}$/.test(value));
    if (args.some(value => !["--daily", "--check"].includes(value) && !/^--(date|from|to)=\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      || dateFlags.length > 1 || args.filter(value => value.startsWith("--from=")).length > 1
      || args.filter(value => value.startsWith("--to=")).length > 1 || new Set(args).size !== args.length
      || (!!from !== !!to) || (dateArgument && from)
      || (args.includes("--daily") && (dateArgument || from || args.includes("--check")))
      || (args.includes("--check") && (dateArgument || from))) throw new Error("invalid_arguments");
    const manualDate = dateArgument ?? (legacy && !from && !args.includes("--daily") ? shiftSyncDate(istDate(now), -1) : undefined);
    const manual = from && to ? { from, to } : manualDate ? { from: manualDate, to: manualDate } : undefined;
    const durationMs = integer("SYNC_MAX_RUN_SECONDS", 1800, 60, 7200) * 1000;
    const maxBackfillDays = integer("SYNC_MAX_BACKFILL_DAYS", 7, 1, 3650);
    const maxRecoveryDates = integer("SYNC_RECOVERY_DATES_PER_RUN", 3, 1, 31);
    deadline = setTimeout(() => { console.error(JSON.stringify({ event: "worker_timeout", exitCode: 124 })); process.exit(124); }, durationMs);
    const url = new URL(process.env.DATABASE_URL ?? "");
    const expectedHost = process.env.SYNC_EXPECTED_DB_HOST ?? "localhost";
    const expectedDatabase = process.env.SYNC_EXPECTED_DATABASE ?? "gulmohar_dev";
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== expectedHost || decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase) throw new Error("unexpected_database_target");
    client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
    const database = client;
    const retry = {
      attempts: integer("SYNC_RETRY_ATTEMPTS", 3, 1, 5), baseDelayMs: integer("SYNC_RETRY_BASE_MS", 1000, 1, 60000),
      maxDelayMs: integer("SYNC_RETRY_MAX_MS", 30000, 1, 300000), signal: abort.signal,
      onRetry: (attempt: number, delayMs: number) => { console.log(JSON.stringify({ event: "transient_retry", attempt, delayMs })); },
    };
    const execute = async () => {
      const actual = await database.$queryRaw<{ database: string }[]>`SELECT current_database() AS database`;
      if (actual[0]?.database !== expectedDatabase) throw new Error("unexpected_database_target");
      const outlet = await database.outlet.findUnique({ where: { code: restaurantConfig.outletCode }, select: { id: true, isActive: true, petpoojaRestId: true } });
      if (!outlet?.isActive || !outlet.petpoojaRestId || process.env.PETPOOJA_REST_ID !== outlet.petpoojaRestId) throw new Error("invalid_outlet_mapping");
      const api = new ScheduledPetpoojaClient(outlet.petpoojaRestId, retry, integer("SYNC_PAGE_TIMEOUT_MS", 30000, 100, 300000));
      api.validateConfig();
      if (args.includes("--check")) {
        console.log(JSON.stringify({ event: "preflight_passed", database: expectedDatabase, outlet: restaurantConfig.outletCode, sourceModificationTimestamp: "not_verified", syncExecuted: false }));
        return 0;
      }
      const binding = `${url.hostname}/${expectedDatabase}/${outlet.id}`;
      const history = new SyncHistory(process.env.SYNC_HISTORY_DIR ?? join(homedir(), ".gulmohar-sync", createHash("sha256").update(binding).digest("hex").slice(0, 16)), event => console.log(JSON.stringify(event)));
      const resolver = new PetpoojaResolver(database);
      const resilient: IngestionPrismaClient = {
        salesOrder: database.salesOrder, salesOrderItem: database.salesOrderItem,
        $transaction: <T>(fn: (tx: IngestionTransactionClient) => Promise<T>) => retrySync(() => database.$transaction(tx => fn(tx as unknown as IngestionTransactionClient), { maxWait: 5000, timeout: 10000 }), retry),
      };
      const ingestion = new PetpoojaIngestionService(resilient, resolver);
      const orchestrator = new PetpoojaSyncOrchestrator(api, resolver, ingestion);
      return runDailySync({ binding, now, startDate: process.env.SYNC_START_DATE, maxBackfillDays, maxRecoveryDates, manual, signal: abort.signal }, history,
        date => orchestrator.syncDate(date, { signal: abort.signal }));
    };
    process.exitCode = args.includes("--check") ? await execute() : await withSyncLock(url.toString(), durationMs, execute);
  } catch (error) {
    process.exitCode = abort.signal.aborted ? 130 : error instanceof SyncLockBusyError ? 75 : 1;
    const known = new Set(["invalid_arguments", "invalid_worker_configuration", "unexpected_database_target", "invalid_outlet_mapping", "backfill_limit", "invalid_dates", "invalid_baseline", "history_date_in_future", "history_read_failed", "invalid_history_state"]);
    const reason = error instanceof Error && known.has(error.message) ? error.message : error instanceof SyncLockBusyError ? "sync_lock_busy" : "configuration_or_runtime_failure";
    console.error(JSON.stringify({ event: "worker_failed", reason, exitCode: process.exitCode }));
  } finally {
    try { await client?.$disconnect(); } catch {
      process.exitCode = process.exitCode || 1;
      console.error(JSON.stringify({ event: "database_disconnect_failed", exitCode: process.exitCode }));
    } finally {
      if (deadline) clearTimeout(deadline);
      if (shutdown) clearTimeout(shutdown);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
    console.log(JSON.stringify({ event: "worker_exit", exitCode: process.exitCode ?? 0 }));
  }
}

if (basename(process.argv[1] ?? "") === "petpooja-daily-sync.ts") void main();
