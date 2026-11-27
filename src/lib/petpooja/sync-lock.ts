import { PrismaClient } from "@prisma/client";

export class SyncLockBusyError extends Error {
  constructor() { super("sync_lock_busy"); }
}

// Shared by daily and legacy manual entry points; PostgreSQL releases it on disconnect.
// A separate one-connection pool pins the transaction lock without starving ingestion.
export async function withSyncLock<T>(databaseUrl: string, durationMs: number, action: () => Promise<T>): Promise<T> {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", "1");
  const lock = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    return await lock.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1196772429, 1347639630) AS acquired`;
      if (!rows[0]?.acquired) throw new SyncLockBusyError();
      return action();
    }, { maxWait: 5000, timeout: durationMs + 60000 });
  } finally { await lock.$disconnect(); }
}
