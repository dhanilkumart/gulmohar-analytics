import { PetpoojaGetOrdersRequest, PetpoojaGetOrdersResponse } from "@/types/petpooja";

export interface PetpoojaClientConfig {
  endpointUrl?: string;
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  restId?: string;
}

/**
 * Petpooja Get Orders API Client (Architecture Scaffold).
 *
 * Designed according to Petpooja's "Get Orders API Documentation":
 * - Pull-based model using HTTP POST with JSON body.
 * - Handles T-1 querying window:
 *     Calling on date T (e.g. 2026-03-16) returns complete historical orders for T-1 (2026-03-15).
 *     Intended to run after business closing hours.
 * - Pagination via `refId`.
 *
 * NOTE: This client is designed for future ingestion once production credentials
 * (app_key, app_secret, access_token, restID) are provisioned.
 * It does not execute live API calls at this stage.
 */
export class PetpoojaGetOrdersClient {
  private config: PetpoojaClientConfig;

  constructor(config?: PetpoojaClientConfig) {
    this.config = {
      endpointUrl: config?.endpointUrl || process.env.PETPOOJA_GET_ORDERS_ENDPOINT,
      appKey: config?.appKey || process.env.PETPOOJA_APP_KEY,
      appSecret: config?.appSecret || process.env.PETPOOJA_APP_SECRET,
      accessToken: config?.accessToken || process.env.PETPOOJA_ACCESS_TOKEN,
      restId: config?.restId || process.env.PETPOOJA_REST_ID,
    };
  }

  /**
   * Builds the strictly typed POST body expected by Petpooja Get Orders API.
   *
   * @param queryDate Date string formatted as "YYYY-MM-DD"
   * @param refId Pagination cursor or empty string
   */
  public buildRequestBody(queryDate: string, refId = ""): PetpoojaGetOrdersRequest {
    if (!this.config.appKey || !this.config.appSecret || !this.config.accessToken || !this.config.restId) {
      throw new Error(
        "Petpooja credentials missing: appKey, appSecret, accessToken, and restId are required."
      );
    }

    return {
      app_key: this.config.appKey,
      app_secret: this.config.appSecret,
      access_token: this.config.accessToken,
      restID: this.config.restId,
      order_date: queryDate,
      refId,
    };
  }

  /**
   * Method signature for pulling orders once credentials and endpoints are activated.
   */
  public async fetchOrders(
    queryDate: string,
    refId = ""
  ): Promise<PetpoojaGetOrdersResponse> {
    void queryDate;
    void refId;
    throw new Error(
      "Petpooja Get Orders API call skipped: Production credentials and endpoint not yet configured."
    );
  }
}
