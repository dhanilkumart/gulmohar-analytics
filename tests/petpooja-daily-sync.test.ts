import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { completeSync, istDate, runDailySync, SyncHistory, validSyncDate, type DailySyncOptions } from "../src/lib/petpooja/daily-sync";
import { retrySync, ScheduledPetpoojaClient, transientSyncError } from "../src/lib/petpooja/sync-retry";
import { PetpoojaGetOrdersClient, PetpoojaHttpError, PetpoojaTimeoutError } from "../src/lib/petpooja/get-orders-client";
import type { PetpoojaSyncResult } from "../src/lib/petpooja/sync";
import type { PetpoojaGetOrdersResponse } from "../src/types/petpooja";

const result = (date: string, overrides: Partial<PetpoojaSyncResult> = {}): PetpoojaSyncResult => ({
  success: true, orderDate: date, pagesFetched: 1, totalOrdersReceived: 2, created: 1,
  updated: 1, skipped: 0, failed: 0, unmappedItems: 0, errors: [], durationMs: 1, ...overrides,
});
const options = (overrides: Partial<DailySyncOptions> = {}): DailySyncOptions => ({
  binding: "local/test/outlet", now: new Date("2026-11-26T17:30:00Z"),
  maxBackfillDays: 7, maxRecoveryDates: 2, signal: new AbortController().signal, ...overrides,
});
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), "gulmohar-sync-test-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true });
  });
  return new SyncHistory(directory);
}
async function events(history: SyncHistory) {
  return (await readFile(join(history.directory, "history.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
}

test("IST business dates and real calendar validation", () => {
  assert.equal(istDate(new Date("2026-11-26T18:29:59Z")), "2026-11-26");
  assert.equal(istDate(new Date("2026-11-26T18:30:00Z")), "2026-11-27");
  assert.equal(validSyncDate("2026-02-30"), false);
  assert.equal(validSyncDate("2028-02-29"), true);
});

test("strict classification rejects partial, unaccounted and API failures", () => {
  assert.equal(completeSync(result("2026-11-26")), true);
  assert.equal(completeSync(result("2026-11-26", { failed: 1 })), false);
  assert.equal(completeSync(result("2026-11-26", { created: 0 })), false);
  assert.equal(completeSync(result("2026-11-26", { errors: [{ stage: "api", message: "secret" }] })), false);
  assert.equal(completeSync(result("2026-11-26", { success: false, failed: 0 })), false);
});

test("daily runs yesterday first, today second, persists history and safely repeats", async t => {
  const history = await fixture(t);
  const called: string[] = [];
  const sync = async (date: string) => { called.push(date); return result(date); };
  assert.equal(await runDailySync(options(), history, sync), 0);
  assert.deepEqual(called, ["2026-11-25", "2026-11-26"]);
  assert.equal((await history.load(options().binding, "2026-11-26")).lastCycleDate, "2026-11-26");
  assert.equal(await runDailySync(options(), history, sync), 0);
  assert.deepEqual(called.slice(2), ["2026-11-25", "2026-11-26"]);
  assert.equal((await events(history)).filter(event => event.event === "run_finished").length, 2);
});

test("partial ingestion stays pending, returns nonzero, never logs error payloads", async t => {
  const history = await fixture(t);
  const code = await runDailySync(options(), history, async date => result(date, {
    failed: 1, errors: [{ stage: "ingestion", message: "customer-secret-credential" }],
  }));
  assert.equal(code, 2);
  assert.deepEqual((await history.load(options().binding, "2026-11-26")).pending, ["2026-11-25", "2026-11-26"]);
  assert.equal((await readFile(join(history.directory, "history.jsonl"), "utf8")).includes("customer-secret"), false);
});

test("bounded missed dates drain across runs after the daily pair", async t => {
  const history = await fixture(t);
  const settings = options({ startDate: "2026-11-21" });
  const first: string[] = [];
  assert.equal(await runDailySync(settings, history, async date => { first.push(date); return result(date); }), 2);
  assert.deepEqual(first, ["2026-11-25", "2026-11-26", "2026-11-20", "2026-11-21"]);
  const second: string[] = [];
  assert.equal(await runDailySync(settings, history, async date => { second.push(date); return result(date); }), 2);
  assert.deepEqual(second, ["2026-11-25", "2026-11-26", "2026-11-22", "2026-11-23"]);
  assert.equal(await runDailySync(settings, history, async date => result(date)), 0);
});

test("oversized recovery gap remains visible until bounds are deliberately raised", async t => {
  const history = await fixture(t);
  assert.equal(await runDailySync(options({ startDate: "2026-11-01" }), history, async date => result(date)), 2);
  const state = await history.load(options().binding, "2026-11-26");
  assert.equal(state.lastCycleDate, "2026-10-31");
  assert.equal((await events(history)).at(-1).outcome, "recovery_window_exceeded");
});

test("unfinished run survives restart and aborted work stays pending", async t => {
  const history = await fixture(t);
  const state = await history.load(options().binding, "2026-11-26");
  state.running = "interrupted-run";
  state.pending = ["2026-11-24"];
  await history.save(state);
  const called: string[] = [];
  assert.equal(await runDailySync(options(), history, async date => { called.push(date); return result(date); }), 0);
  assert.deepEqual(called, ["2026-11-25", "2026-11-26", "2026-11-24"]);
  assert.ok((await events(history)).some(event => event.event === "recovered_interrupted_run"));
  const abort = new AbortController();
  assert.equal(await runDailySync(options({ signal: abort.signal }), history, async date => {
    abort.abort(); return result(date);
  }), 130);
  assert.equal((await history.load(options().binding, "2026-11-26")).pending.length, 2);
});

test("manual range bounds and state binding fail before ingestion", async t => {
  const history = await fixture(t);
  const never = async () => { assert.fail("ingestion must not run"); };
  await assert.rejects(runDailySync(options({ manual: { from: "2026-10-01", to: "2026-11-26" } }), history, never), /backfill_limit/);
  await assert.rejects(runDailySync(options({ manual: { from: "2026-11-27", to: "2026-11-27" } }), history, never), /backfill_limit/);
  await runDailySync(options(), history, async date => result(date));
  await assert.rejects(runDailySync(options({ binding: "another/outlet" }), history, never), /invalid_history_state/);
  await writeFile(join(history.directory, "state.json"), "invalid-json");
  await assert.rejects(runDailySync(options(), history, never));
});

test("empty successful response is explicitly classified", async t => {
  const history = await fixture(t);
  assert.equal(await runDailySync(options(), history, async date => result(date, { totalOrdersReceived: 0, created: 0, updated: 0 })), 0);
  assert.equal((await events(history)).find(event => event.event === "date_finished").outcome, "success_empty");
});

test("transient retries are bounded with capped exponential backoff", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const retry = { attempts: 4, baseDelayMs: 10, maxDelayMs: 15, signal: new AbortController().signal,
    sleep: async (ms: number) => { delays.push(ms); } };
  assert.equal(await retrySync(async () => { if (++attempts < 4) throw new TypeError("network"); return "ok"; }, retry), "ok");
  assert.deepEqual(delays, [10, 15, 15]);
  attempts = 0;
  await assert.rejects(retrySync(async () => { attempts++; throw new TypeError("network"); }, retry));
  assert.equal(attempts, 4);
  assert.equal(transientSyncError({ code: "P2034" }), true);
  assert.equal(transientSyncError(new PetpoojaHttpError(401, "Unauthorized", "secret")), false);
  assert.equal(transientSyncError(new PetpoojaHttpError(503, "Unavailable", "secret")), true);
});

test("permanent errors and abort do not retry", async () => {
  const abort = new AbortController();
  let calls = 0;
  const retry = { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, signal: abort.signal };
  await assert.rejects(retrySync(async () => { calls++; throw new Error("validation"); }, retry));
  assert.equal(calls, 1);
  abort.abort();
  await assert.rejects(retrySync(async () => { calls++; }, retry));
  assert.equal(calls, 1);
});

test("scheduled adapter rejects wrong restaurant and incomplete response shape", async t => {
  const stub = t.mock.method(PetpoojaGetOrdersClient.prototype, "fetchPage", async () => ({ success: "1", order_json: [{ Restaurant: { restID: "other" } }] }) as PetpoojaGetOrdersResponse);
  const client = new ScheduledPetpoojaClient("configured", { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, signal: new AbortController().signal }, 100);
  await assert.rejects(client.fetchPage("2026-11-26"), /unexpected_restaurant/);
  stub.mock.mockImplementation(async () => ({ success: "1" }) as PetpoojaGetOrdersResponse);
  await assert.rejects(client.fetchPage("2026-11-26"), /missing_order_array/);
});

test("scheduled page deadline covers a stalled response body", async t => {
  t.mock.method(PetpoojaGetOrdersClient.prototype, "fetchPage", () => new Promise(() => {}));
  const client = new ScheduledPetpoojaClient("configured", { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, signal: new AbortController().signal }, 10);
  await assert.rejects(client.fetchPage("2026-11-26"), PetpoojaTimeoutError);
});

test("page retry preserves the cursor and complete pagination", async t => {
  const cursors: string[] = [];
  let retried = false;
  t.mock.method(PetpoojaGetOrdersClient.prototype, "fetchPage", async (_date: string, cursor = "") => {
    cursors.push(cursor);
    if (!cursor) return { success: "1", order_json: Array.from({ length: 1000 }, (_, index) => ({
      Restaurant: { restID: "configured" }, Order: { refId: String(index + 1) },
    })) } as PetpoojaGetOrdersResponse;
    if (!retried) { retried = true; throw new PetpoojaHttpError(503, "Unavailable", "private-body"); }
    return { success: "1", order_json: [] } as unknown as PetpoojaGetOrdersResponse;
  });
  const client = new ScheduledPetpoojaClient("configured", { attempts: 2, baseDelayMs: 1, maxDelayMs: 2,
    signal: new AbortController().signal, sleep: async () => {} }, 100);
  const page = await client.fetchAllOrders("2026-11-26");
  assert.equal(page.totalOrders, 1000);
  assert.equal(page.pagesFetched, 2);
  assert.deepEqual(cursors, ["", "1000", "1000"]);
});

test("abort during exponential backoff stops further attempts", async () => {
  const abort = new AbortController();
  let attempts = 0;
  await assert.rejects(retrySync(async () => { attempts++; throw new TypeError("network"); }, {
    attempts: 3, baseDelayMs: 1000, maxDelayMs: 1000, signal: abort.signal,
    onRetry: () => { setTimeout(() => abort.abort(), 1); },
  }));
  assert.equal(attempts, 1);
});

test("ambiguous and incomplete CLI arguments fail before connecting", () => {
  for (const args of [["--date="], ["--daily", "--check"], ["--from=2026-11-25"],
    ["--date=2026-11-24", "--date=2026-11-25"]]) {
    const child = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/petpooja-daily-sync.ts"), ...args], {
      encoding: "utf8", timeout: 15000,
      env: { ...process.env, DATABASE_URL: "postgresql://invalid:invalid@blocked.invalid/blocked" },
    });
    assert.equal(child.status, 1);
    assert.ok(child.stderr.includes('"reason":"invalid_arguments"'));
  }
});
