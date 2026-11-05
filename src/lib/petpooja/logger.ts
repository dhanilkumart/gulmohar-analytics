import { PetpoojaGlobalPayload } from "@/types/petpooja";

/**
 * Utility to mask sensitive PII (Phone numbers, GSTIN, detailed street addresses).
 */
export function maskSensitiveString(val?: string, visibleChars = 4): string {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.length <= visibleChars) return "*".repeat(trimmed.length);
  return (
    "*".repeat(trimmed.length - visibleChars) + trimmed.slice(-visibleChars)
  );
}

/**
 * Creates a safe, redacted summary of the incoming Petpooja payload for logging.
 * Never logs raw customer phone numbers, full addresses, or GSTIN.
 */
export function sanitizePayloadForLogging(payload: PetpoojaGlobalPayload): Record<string, unknown> {
  const restaurant = payload.properties?.Restaurant;
  const customer = payload.properties?.Customer;
  const order = payload.properties?.Order;
  const items = payload.properties?.OrderItem ?? [];

  return {
    event: payload.event,
    restaurant: {
      res_name: restaurant?.res_name,
      restID: restaurant?.restID,
    },
    customer: {
      // Retain first name only or masked name for debugging
      name: customer?.name ? `${customer.name.slice(0, 3)}***` : undefined,
      phone_masked: maskSensitiveString(customer?.phone),
      gstin_masked: maskSensitiveString(customer?.gstin),
      has_address: Boolean(customer?.address),
    },
    order: {
      orderID: order?.orderID,
      customer_invoice_id: order?.customer_invoice_id,
      order_type: order?.order_type,
      payment_type: order?.payment_type,
      total: order?.total,
      created_on: order?.created_on,
      order_from: order?.order_from,
      status: order?.status,
      items_count: items.length,
    },
    items_summary: items.map((i) => ({
      itemid: i.itemid,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      total: i.total,
    })),
  };
}

/**
 * Logs the webhook event cleanly using structured JSON.
 */
export function logWebhookEvent(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    service: "petpooja-webhook",
    level,
    message,
    ...meta,
  };

  if (level === "error") {
    console.error(JSON.stringify(logEntry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

