import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { PetpoojaSyncResult } from "./sync";

export function validSyncDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function istDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftSyncDate(date: string, days: number): string {
  const result = new Date(date + "T00:00:00Z");
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function syncDates(from: string, to: string, limit: number): string[] {
  if (!validSyncDate(from) || !validSyncDate(to) || from > to) throw new Error("invalid_dates");
  const dates: string[] = [];
  for (let day = from; day <= to; day = shiftSyncDate(day, 1)) {
    if (dates.length >= limit) throw new Error("backfill_limit");
    dates.push(day);
  }
  return dates;
}

export interface SyncState {
  version: 1;
  binding: string;
  lastCycleDate: string;
  pending: string[];
  completedRecovery: string[];
  running: string | null;
}

export type HistoryEvent = {
  event: string; runId: string; at: string; date?: string; outcome?: string;
  received?: number; created?: number; updated?: number; skipped?: number; failed?: number;
  pages?: number; unmappedItems?: number; durationMs?: number; errorStages?: string[]; diagnostic?: string; pending?: string[];
};

// State is atomically replaced; every history event is flushed before continuing.
// Only allowlisted metadata is written, never vendor payloads or exception messages.
export class SyncHistory {
  constructor(public readonly directory: string, private readonly log?: (event: HistoryEvent) => void) {}

  async load(binding: string, baseline: string): Promise<SyncState> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try { raw = await readFile(join(this.directory, "state.json"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("history_read_failed");
      return { version: 1, binding, lastCycleDate: shiftSyncDate(baseline, -1), pending: [], completedRecovery: [], running: null };
    }
    const state = JSON.parse(raw) as SyncState;
    if (state.version !== 1 || state.binding !== binding || !validSyncDate(state.lastCycleDate)
      || !Array.isArray(state.pending) || !Array.isArray(state.completedRecovery)
      || ![...state.pending, ...state.completedRecovery].every(validSyncDate)
      || !(state.running === null || typeof state.running === "string")) throw new Error("invalid_history_state");
    return state;
  }

  async save(state: SyncState) {
    const temporary = join(this.directory, "state.json.tmp");
    const file = await open(temporary, "w", 0o600);
    try { await file.writeFile(JSON.stringify(state) + "\n"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, join(this.directory, "state.json"));
    if (process.platform !== "win32") {
      const directory = await open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    }
  }

  async event(event: HistoryEvent) {
    const file = await open(join(this.directory, "history.jsonl"), "a", 0o600);
    try { await file.writeFile(JSON.stringify(event) + "\n"); await file.sync(); } finally { await file.close(); }
    this.log?.(event);
  }
}

export function completeSync(result: PetpoojaSyncResult): boolean {
  const counts = [result.totalOrdersReceived, result.created, result.updated, result.skipped, result.failed, result.pagesFetched];
  return result.success && counts.every(n => Number.isSafeInteger(n) && n >= 0)
    && result.failed === 0 && result.errors.length === 0
    && result.totalOrdersReceived === result.created + result.updated + result.skipped;
}

export interface DailySyncOptions {
  binding: string;
  now: Date;
  startDate?: string;
  maxBackfillDays: number;
  maxRecoveryDates: number;
  manual?: { from: string; to: string };
  signal: AbortSignal;
}

export async function runDailySync(options: DailySyncOptions, history: SyncHistory,
  syncDate: (date: string) => Promise<PetpoojaSyncResult>): Promise<number> {
  const today = istDate(options.now);
  const yesterday = shiftSyncDate(today, -1);
  const earliest = shiftSyncDate(today, -options.maxBackfillDays);
  const baseline = options.startDate ?? today;
  if (!validSyncDate(baseline) || baseline > today) throw new Error("invalid_baseline");
  const manual = options.manual ? syncDates(options.manual.from, options.manual.to, options.maxBackfillDays) : null;
  if (manual && (manual[0] < earliest || manual.at(-1)! > today)) throw new Error("backfill_limit");
  const state = await history.load(options.binding, baseline);
  if (state.lastCycleDate > today || state.pending.some(date => date > today)) throw new Error("history_date_in_future");
  const runId = randomUUID();
  const event = (fields: Omit<HistoryEvent, "runId" | "at">) => history.event({ ...fields, runId, at: new Date().toISOString() });
  if (state.running) await event({ event: "recovered_interrupted_run", outcome: "unfinished_targets_retained" });

  // Keep the cursor unchanged if the gap exceeds the configured window: never lose it.
  const gapBlocked = !manual && state.lastCycleDate < earliest;
  const missing = !manual && !gapBlocked && state.lastCycleDate < yesterday
    ? syncDates(state.lastCycleDate, shiftSyncDate(yesterday, -1), options.maxBackfillDays).filter(date => !state.completedRecovery.includes(date)) : [];
  const primary = manual ?? [yesterday, today];
  state.pending = [...new Set([...state.pending, ...missing, ...primary])].sort();
  const recovery = state.pending.filter(date => !primary.includes(date) && date >= earliest).slice(0, options.maxRecoveryDates);
  const targets = manual ?? [...primary, ...recovery];
  state.running = runId;
  await history.save(state);
  await event({ event: "run_started", pending: state.pending });

  for (const date of targets) {
    if (options.signal.aborted) break;
    await event({ event: "date_started", date });
    let result: PetpoojaSyncResult;
    try { result = await syncDate(date); }
    catch {
      await event({ event: "date_finished", date, outcome: options.signal.aborted ? "interrupted" : "failed" });
      continue;
    }
    const complete = !options.signal.aborted && completeSync(result);
    const apiDiagnostic = result.errors.find(error => error.stage === "api")?.diagnostic;
    await event({
      event: "date_finished", date, outcome: complete ? result.totalOrdersReceived ? "success" : "success_empty" : options.signal.aborted ? "interrupted" : "partial_or_failed",
      received: result.totalOrdersReceived, created: result.created, updated: result.updated,
      skipped: result.skipped, failed: result.failed, pages: result.pagesFetched, unmappedItems: result.unmappedItems, durationMs: result.durationMs,
      errorStages: [...new Set(result.errors.map(error => error.stage))],
      ...(apiDiagnostic ? { diagnostic: apiDiagnostic } : {}),
    });
    if (complete) {
      state.pending = state.pending.filter(value => value !== date);
      state.completedRecovery = [...new Set([...state.completedRecovery, date])];
    }
    await history.save(state);
  }

  const needsRecovery = state.pending.length > 0 || gapBlocked;
  if (!manual && !needsRecovery && !options.signal.aborted) {
    state.lastCycleDate = today;
    state.completedRecovery = [];
  }
  state.running = null;
  await history.save(state);
  const exitCode = options.signal.aborted ? 130 : needsRecovery ? 2 : 0;
  await event({ event: "run_finished", outcome: options.signal.aborted ? "interrupted" : gapBlocked ? "recovery_window_exceeded" : needsRecovery ? "recovery_required" : "success", pending: state.pending });
  return exitCode;
}
