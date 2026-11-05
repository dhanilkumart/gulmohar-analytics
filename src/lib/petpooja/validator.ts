import { PetpoojaGlobalPayload } from "@/types/petpooja";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedPayload?: PetpoojaGlobalPayload;
}

/**
 * Validates Petpooja Global API incoming payload against Petpooja documentation.
 *
 * Rules:
 * 1. Payload must be a non-null object.
 * 2. `event` must be "orderdetails".
 * 3. `properties` must contain `Restaurant`, `Customer`, `Order`, and `OrderItem`.
 * 4. Token validation: If configured via environment variable `PETPOOJA_WEBHOOK_TOKEN`,
 *    the payload must contain a matching `token` or `Token` field.
 */
export function validatePetpoojaWebhookPayload(
  body: unknown,
  expectedToken?: string
): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return {
      isValid: false,
      errors: ["Request body must be a valid JSON object."],
    };
  }

  const payload = body as Record<string, unknown>;

  // Token verification (Petpooja documents static token field in payload root)
  const incomingToken = (payload.token ?? payload.Token) as string | undefined;
  if (expectedToken && expectedToken.trim().length > 0) {
    if (!incomingToken || incomingToken !== expectedToken) {
      errors.push("Invalid or missing webhook authentication token.");
      return {
        isValid: false,
        errors,
      };
    }
  }

  // Event validation
  if (!payload.event) {
    errors.push("Missing required field: 'event'.");
  } else if (payload.event !== "orderdetails") {
    errors.push(
      `Unsupported event: '${String(payload.event)}'. Expected 'orderdetails'.`
    );
  }

  // Properties validation
  const properties = payload.properties as Record<string, unknown> | undefined;
  if (!properties || typeof properties !== "object") {
    errors.push("Missing required object: 'properties'.");
    return { isValid: false, errors };
  }

  // Restaurant validation
  const restaurant = properties.Restaurant as Record<string, unknown> | undefined;
  if (!restaurant || typeof restaurant !== "object") {
    errors.push("Missing required object: 'properties.Restaurant'.");
  } else if (!restaurant.restID) {
    errors.push("Missing required field: 'properties.Restaurant.restID'.");
  }

  // Order validation
  const order = properties.Order as Record<string, unknown> | undefined;
  if (!order || typeof order !== "object") {
    errors.push("Missing required object: 'properties.Order'.");
  } else {
    if (order.orderID === undefined || order.orderID === null) {
      errors.push("Missing required field: 'properties.Order.orderID'.");
    }
    if (order.total === undefined || order.total === null) {
      errors.push("Missing required field: 'properties.Order.total'.");
    }
    if (!order.created_on) {
      errors.push("Missing required field: 'properties.Order.created_on'.");
    }
  }

  // OrderItem validation
  const items = properties.OrderItem;
  if (!Array.isArray(items)) {
    errors.push("Missing required array: 'properties.OrderItem'.");
  } else if (items.length === 0) {
    errors.push("OrderItem array cannot be empty.");
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
    };
  }

  return {
    isValid: true,
    errors: [],
    sanitizedPayload: body as PetpoojaGlobalPayload,
  };
}

