import {
  FetchAllOrdersOptions,
  PetpoojaPaginationResult,
  PetpoojaPullOrderEntry,
} from "@/types/petpooja";
import { PetpoojaGetOrdersClient } from "./get-orders-client";
import { normalizePetpoojaBatch } from "./normalizer";
import { PetpoojaResolver } from "./resolver";
import {
  IngestionBatchStatistics,
  IngestionOptions,
  PetpoojaIngestionService,
} from "./ingestion-service";

/**
 * Structured error details captured during synchronization without PII.
 */
export interface SyncErrorDetail {
  stage: "api" | "normalization" | "outlet_resolution" | "ingestion";
  petpoojaOrderId?: string;
  field?: string;
  message: string;
}

/**
 * Comprehensive statistics and results returned from a synchronization run.
 */
export interface PetpoojaSyncResult {
  success: boolean;
  orderDate: string;
  pagesFetched: number;
  totalOrdersReceived: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  unmappedItems: number;
  errors: SyncErrorDetail[];
  durationMs: number;
}

/**
 * Options for configuring synchronization.
 */
export interface SyncOptions extends FetchAllOrdersOptions, IngestionOptions {
  /**
   * If true, aborts the entire synchronization run if an API or fatal error occurs.
   * Defaults to false (best-effort processing for individual orders).
   */
  abortOnFatal?: boolean;
}

/**
 * Petpooja Synchronization Orchestrator (Stage 3D)
 *
 * Pipeline Flow:
 * 1. PetpoojaGetOrdersClient: Fetches all paginated raw order records for a specified operational date.
 * 2. Normalizer: Converts raw envelopes into typed, PII-free NormalizedSalesOrder objects.
 * 3. Resolver: Resolves Outlet via `petpoojaRestId` and Products via priority hierarchy.
 * 4. Ingestion Service: Transactionally upserts SalesOrder headers and atomic line-items.
 */
export class PetpoojaSyncOrchestrator {
  private client: PetpoojaGetOrdersClient;
  private resolver: PetpoojaResolver;
  private ingestionService: PetpoojaIngestionService;

  constructor(
    client?: PetpoojaGetOrdersClient,
    resolver?: PetpoojaResolver,
    ingestionService?: PetpoojaIngestionService
  ) {
    this.client = client ?? new PetpoojaGetOrdersClient();
    this.resolver = resolver ?? new PetpoojaResolver();
    this.ingestionService =
      ingestionService ?? new PetpoojaIngestionService(undefined, this.resolver);
  }

  /**
   * Synchronizes orders for an explicitly requested operational date (YYYY-MM-DD).
   *
   * Used identically for:
   * - Daily synchronization (running post-business hours for day T).
   * - Historical synchronization (backfilling any historical date).
   *
   * @param orderDate Operational business date formatted as "YYYY-MM-DD"
   * @param options Sync options (pagination limits, timeouts)
   */
  public async syncDate(
    orderDate: string,
    options?: SyncOptions
  ): Promise<PetpoojaSyncResult> {
    const startTime = Date.now();
    const errors: SyncErrorDetail[] = [];

    // Validate date format strictly
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!orderDate || !DATE_REGEX.test(orderDate.trim())) {
      return {
        success: false,
        orderDate: orderDate ?? "",
        pagesFetched: 0,
        totalOrdersReceived: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        unmappedItems: 0,
        errors: [
          {
            stage: "api",
            message: `Invalid orderDate format: '${orderDate}'. Expected YYYY-MM-DD.`,
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }

    const trimmedDate = orderDate.trim();

    // -------------------------------------------------------------------------
    // Step 1: Fetch all pages using existing API client pagination
    // -------------------------------------------------------------------------
    let pullResult: PetpoojaPaginationResult;
    try {
      pullResult = await this.client.fetchAllOrders(trimmedDate, options);
    } catch (apiErr: any) {
      errors.push({
        stage: "api",
        message: apiErr.message || String(apiErr),
      });

      return {
        success: false,
        orderDate: trimmedDate,
        pagesFetched: 0,
        totalOrdersReceived: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        unmappedItems: 0,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    const rawOrders: PetpoojaPullOrderEntry[] = pullResult.orders;
    const pagesFetched = pullResult.pagesFetched;

    if (rawOrders.length === 0) {
      return {
        success: true,
        orderDate: trimmedDate,
        pagesFetched,
        totalOrdersReceived: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        unmappedItems: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    // -------------------------------------------------------------------------
    // Step 2: Normalize the batch
    // -------------------------------------------------------------------------
    const normResult = normalizePetpoojaBatch(rawOrders);

    // Record normalization errors (distinguishing fatal errors vs warnings)
    for (const issueEntry of normResult.issues) {
      for (const issue of issueEntry.issues) {
        if (issue.severity === "error") {
          errors.push({
            stage: "normalization",
            petpoojaOrderId: issueEntry.petpoojaOrderId,
            field: issue.field,
            message: issue.message,
          });
        }
      }
    }

    // If all received orders failed normalization
    if (normResult.orders.length === 0) {
      return {
        success: false,
        orderDate: trimmedDate,
        pagesFetched,
        totalOrdersReceived: rawOrders.length,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: normResult.errorCount,
        unmappedItems: 0,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    // -------------------------------------------------------------------------
    // Step 3 & 4: Ingestion (Resolve and Upsert)
    // -------------------------------------------------------------------------
    let ingestStats: IngestionBatchStatistics;
    try {
      ingestStats = await this.ingestionService.ingestBatch(
        normResult.orders,
        options
      );
    } catch (ingestErr: any) {
      errors.push({
        stage: "ingestion",
        message: ingestErr.message || String(ingestErr),
      });

      return {
        success: false,
        orderDate: trimmedDate,
        pagesFetched,
        totalOrdersReceived: rawOrders.length,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: rawOrders.length,
        unmappedItems: 0,
        errors,
        durationMs: Date.now() - startTime,
      };
    }

    // Collect order-level ingestion failures
    for (const res of ingestStats.results) {
      if (!res.success) {
        errors.push({
          stage: "ingestion",
          petpoojaOrderId: res.petpoojaOrderId,
          message: res.error,
        });
      }
    }

    const totalFailed = normResult.errorCount + ingestStats.failed;
    const hasSuccessfulOrders = ingestStats.created > 0 || ingestStats.updated > 0;

    return {
      // Overall success is true if at least some orders succeeded and no unhandled crashes occurred
      success: totalFailed === 0 || hasSuccessfulOrders,
      orderDate: trimmedDate,
      pagesFetched,
      totalOrdersReceived: rawOrders.length,
      created: ingestStats.created,
      updated: ingestStats.updated,
      skipped: ingestStats.skipped,
      failed: totalFailed,
      unmappedItems: ingestStats.unmappedItems,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}

