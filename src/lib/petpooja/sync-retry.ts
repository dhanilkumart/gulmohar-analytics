import { PetpoojaGetOrdersClient, PetpoojaHttpError, PetpoojaTimeoutError } from "./get-orders-client";
import type { FetchOrdersOptions } from "@/types/petpooja";

export interface RetryOptions {
  attempts: number; baseDelayMs: number; maxDelayMs: number; signal: AbortSignal;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number) => void;
}

export function transientSyncError(error: unknown): boolean {
  if (error instanceof PetpoojaHttpError) return error.status === 429 || error.status >= 500;
  if (error instanceof PetpoojaTimeoutError || error instanceof TypeError) return true;
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"].includes(code);
}

export async function retrySync<T>(action: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? ((ms, signal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("interrupted")); return; }
    const abort = () => { clearTimeout(timer); reject(new Error("interrupted")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  }));
  for (let attempt = 1; ; attempt++) {
    if (options.signal.aborted) throw new Error("interrupted");
    try { return await action(); }
    catch (error) {
      if (options.signal.aborted || attempt >= options.attempts || !transientSyncError(error)) throw error;
      const delayMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.(attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }
}

export class ScheduledPetpoojaClient extends PetpoojaGetOrdersClient {
  constructor(private readonly restId: string, private readonly retry: RetryOptions, private readonly pageTimeoutMs: number) {
    super({ restId });
  }

  override async fetchPage(date: string, cursor = "", options?: FetchOrdersOptions) {
    return retrySync(async () => {
      const timeout = new AbortController();
      const signal = AbortSignal.any([this.retry.signal, timeout.signal, ...(options?.signal ? [options.signal] : [])]);
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { timeout.abort(); reject(new PetpoojaTimeoutError(this.pageTimeoutMs)); }, this.pageTimeoutMs);
      });
      try {
        const page = await Promise.race([super.fetchPage(date, cursor, { ...options, signal }), deadline]);
        if (!Array.isArray(page.order_json)) throw new Error("missing_order_array");
        if ((page.order_json ?? []).some(entry => entry.Restaurant?.restID?.trim() !== this.restId)) throw new Error("unexpected_restaurant");
        return page;
      } catch (error) {
        if (timeout.signal.aborted && !this.retry.signal.aborted) throw new PetpoojaTimeoutError(this.pageTimeoutMs);
        throw error;
      } finally { clearTimeout(timer!); }
    }, this.retry);
  }
}
