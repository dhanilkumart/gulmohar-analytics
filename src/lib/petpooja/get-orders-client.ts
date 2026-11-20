import {
  FetchAllOrdersOptions,
  FetchOrdersOptions,
  PetpoojaGetOrdersRequest,
  PetpoojaGetOrdersResponse,
  PetpoojaPaginationResult,
  PetpoojaPullOrderEntry,
} from "@/types/petpooja";

export interface PetpoojaClientConfig {
  endpointUrl?: string;
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  restId?: string;
  apiCookie?: string;
}

export class PetpoojaApiError extends Error {
  public readonly code?: string;
  public readonly success?: string;

  constructor(message: string, code?: string, success?: string) {
    super(message);
    this.name = "PetpoojaApiError";
    this.code = code;
    this.success = success;
  }
}

export class PetpoojaHttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly bodyText?: string;

  constructor(status: number, statusText: string, bodyText?: string) {
    super(`Petpooja HTTP Error ${status}: ${statusText}`);
    this.name = "PetpoojaHttpError";
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

export class PetpoojaTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Petpooja API request timed out after ${timeoutMs}ms.`);
    this.name = "PetpoojaTimeoutError";
  }
}

export class PetpoojaPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PetpoojaPaginationError";
  }
}

/**
 * Production verified default endpoint for Petpooja Generic Get Orders API.
 */
export const DEFAULT_GET_ORDERS_ENDPOINT =
  "https://api.petpooja.com/V1/thirdparty/generic_get_orders/";

/**
 * Petpooja Get Orders API limits each page to at most 1,000 records.
 */
export const PETPOOJA_PAGE_SIZE_LIMIT = 1000;

/**
 * Default safeguard timeout per request.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

/**
 * Default maximum number of pages to prevent runaway loops.
 */
export const DEFAULT_MAX_PAGES = 50;

/**
 * Petpooja Get Orders API Client
 *
 * Implements:
 * 1. POST request against production endpoint with Cookie header.
 * 2. Single-page fetch (`fetchPage`).
 * 3. Paginated multi-page fetch (`fetchAllOrders`) using cursor `Order.refId`.
 * 4. Rigorous validation of HTTP status, payload format, and business success flag.
 * 5. Safeguards against repeated cursors, invalid cursors, and runaway pagination.
 */
export class PetpoojaGetOrdersClient {
  private config: PetpoojaClientConfig;

  constructor(config?: PetpoojaClientConfig) {
    this.config = {
      endpointUrl:
        config?.endpointUrl ||
        process.env.PETPOOJA_GET_ORDERS_ENDPOINT ||
        DEFAULT_GET_ORDERS_ENDPOINT,
      appKey: config?.appKey || process.env.PETPOOJA_APP_KEY,
      appSecret: config?.appSecret || process.env.PETPOOJA_APP_SECRET,
      accessToken: config?.accessToken || process.env.PETPOOJA_ACCESS_TOKEN,
      restId: config?.restId || process.env.PETPOOJA_REST_ID,
      apiCookie: config?.apiCookie || process.env.PETPOOJA_API_COOKIE,
    };
  }

  /**
   * Validates that all required credentials and headers are available.
   * Throws Error if any required credential is missing.
   */
  public validateConfig(): void {
    const missing: string[] = [];
    if (!this.config.endpointUrl) missing.push("endpointUrl");
    if (!this.config.appKey) missing.push("appKey");
    if (!this.config.appSecret) missing.push("appSecret");
    if (!this.config.accessToken) missing.push("accessToken");
    if (!this.config.restId) missing.push("restId");
    if (!this.config.apiCookie) missing.push("apiCookie");

    if (missing.length > 0) {
      throw new Error(
        `Petpooja client configuration incomplete: missing [${missing.join(", ")}].`
      );
    }
  }

  /**
   * Builds the POST request body.
   */
  public buildRequestBody(queryDate: string, refId = ""): PetpoojaGetOrdersRequest {
    this.validateConfig();

    return {
      app_key: this.config.appKey!,
      app_secret: this.config.appSecret!,
      access_token: this.config.accessToken!,
      restID: this.config.restId!,
      order_date: queryDate,
      refId,
    };
  }

  /**
   * Fetches a single page of orders from the Petpooja Get Orders API.
   *
   * @param orderDate Target operational day in YYYY-MM-DD format
   * @param refId Pagination cursor (empty string "" for initial page)
   * @param options Timeout and abort signal options
   */
  public async fetchPage(
    orderDate: string,
    refId = "",
    options?: FetchOrdersOptions
  ): Promise<PetpoojaGetOrdersResponse> {
    const requestBody = this.buildRequestBody(orderDate, refId);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If caller provided an external AbortSignal, forward its abort
    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetch(this.config.endpointUrl!, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Cookie: this.config.apiCookie!,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError" && !options?.signal?.aborted) {
        throw new PetpoojaTimeoutError(timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new PetpoojaHttpError(response.status, response.statusText, errorText);
    }

    const rawText = await response.text();
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new PetpoojaApiError(
        `Failed to parse Petpooja response as JSON: ${rawText.substring(0, 200)}`
      );
    }

    // Validate payload shape
    if (!parsed || typeof parsed !== "object") {
      throw new PetpoojaApiError("Petpooja API returned a non-object payload.");
    }

    // Check business success status
    // Petpooja documents success = "1" as success, "0" as failure
    if (parsed.success !== "1" && parsed.success !== 1) {
      const msg = parsed.message || "Unknown error returned by Petpooja API";
      throw new PetpoojaApiError(msg, String(parsed.code ?? ""), String(parsed.success ?? ""));
    }

    if (parsed.order_json !== undefined && !Array.isArray(parsed.order_json)) {
      throw new PetpoojaApiError(
        "Invalid response schema: 'order_json' is present but is not an array."
      );
    }

    return parsed as PetpoojaGetOrdersResponse;
  }

  /**
   * Fetches all orders for a target operational day across all pages.
   *
   * Pagination logic:
   * 1. Starts with refId = "".
   * 2. Continues requesting next pages while exactly 1,000 records are returned.
   * 3. Stops when fewer than 1,000 records are returned (< 1,000 indicates final page).
   * 4. Enforces safeguards:
   *    - Validates cursor presence and non-emptiness on full pages.
   *    - Detects repeated cursors to prevent infinite loops.
   *    - Enforces maxPages limit.
   *    - Does not swallow errors or treat failed requests as empty arrays.
   *
   * @param orderDate Target operational day in YYYY-MM-DD format
   * @param options Pagination and timeout configuration
   */
  public async fetchAllOrders(
    orderDate: string,
    options?: FetchAllOrdersOptions
  ): Promise<PetpoojaPaginationResult> {
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
    const allOrders: PetpoojaPullOrderEntry[] = [];
    const seenCursors = new Set<string>();

    let currentCursor = "";
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore) {
      pagesFetched++;
      if (pagesFetched > maxPages) {
        throw new PetpoojaPaginationError(
          `Exceeded maximum allowed pagination pages (${maxPages}). Sync aborted to prevent infinite loop.`
        );
      }

      const response = await this.fetchPage(orderDate, currentCursor, options);
      const orders = response.order_json ?? [];

      for (const order of orders) {
        allOrders.push(order);
      }

      // Check termination based on 1,000-record threshold
      if (orders.length < PETPOOJA_PAGE_SIZE_LIMIT) {
        hasMore = false;
        break;
      }

      // Exactly 1,000 records returned -> prepare next page
      const lastEntry = orders[orders.length - 1];
      const nextRefId = lastEntry?.Order?.refId?.trim();

      if (!nextRefId) {
        throw new PetpoojaPaginationError(
          `Page ${pagesFetched} returned ${PETPOOJA_PAGE_SIZE_LIMIT} orders, but last record has missing or empty refId.`
        );
      }

      if (seenCursors.has(nextRefId)) {
        throw new PetpoojaPaginationError(
          `Repeated pagination cursor detected: '${nextRefId}'. Aborting to prevent infinite loop.`
        );
      }

      seenCursors.add(nextRefId);
      currentCursor = nextRefId;
    }

    return {
      orders: allOrders,
      totalOrders: allOrders.length,
      pagesFetched,
      lastRefId: currentCursor || undefined,
      hasMore,
    };
  }
}
