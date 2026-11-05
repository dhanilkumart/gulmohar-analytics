import { NextRequest, NextResponse } from "next/server";
import {
  PetpoojaWebhookSuccessResponse,
  PetpoojaWebhookErrorResponse,
} from "@/types/petpooja";
import { validatePetpoojaWebhookPayload } from "@/lib/petpooja/validator";
import {
  logWebhookEvent,
  sanitizePayloadForLogging,
} from "@/lib/petpooja/logger";

/**
 * Petpooja Global API Webhook Receiver
 *
 * Endpoint: POST /api/webhooks/petpooja
 *
 * Behavior:
 * - Triggered by Petpooja POS upon bill print ("SAVE AND PRINT").
 * - Validates payload structure according to Petpooja Global API documentation.
 * - Enforces static webhook token validation when PETPOOJA_WEBHOOK_TOKEN is configured.
 * - Safely logs demo payloads with customer PII (phone, GSTIN, full address) redacted.
 * - Returns 200 JSON acknowledgment on success, or 400/401 on validation failure.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<PetpoojaWebhookSuccessResponse | PetpoojaWebhookErrorResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logWebhookEvent("warn", "Received malformed non-JSON payload");
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid JSON in request body",
        },
        { status: 400 }
      );
    }

    const expectedToken = process.env.PETPOOJA_WEBHOOK_TOKEN;
    const validation = validatePetpoojaWebhookPayload(body, expectedToken);

    if (!validation.isValid || !validation.sanitizedPayload) {
      logWebhookEvent("warn", "Webhook validation failed", {
        errors: validation.errors,
      });

      // If token validation specifically failed
      const isAuthError = validation.errors.some((e) =>
        e.toLowerCase().includes("token")
      );

      return NextResponse.json(
        {
          status: "error",
          message: isAuthError ? "Unauthorized" : "Payload validation failed",
          details: validation.errors,
        },
        { status: isAuthError ? 401 : 400 }
      );
    }

    const payload = validation.sanitizedPayload;
    const safeSummary = sanitizePayloadForLogging(payload);

    // Structured logging for demo & integration testing
    logWebhookEvent("info", "Petpooja order details received", {
      order: safeSummary,
    });

    return NextResponse.json(
      {
        status: "success",
        message: "Order received successfully",
        order_id: payload.properties.Order.orderID,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown internal server error";

    logWebhookEvent("error", "Unexpected error processing Petpooja webhook", {
      error: errorMessage,
    });

    return NextResponse.json(
      {
        status: "error",
        message: "Internal server error processing webhook",
      },
      { status: 500 }
    );
  }
}

/**
 * Health check handler to confirm endpoint accessibility.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: "ready",
      endpoint: "/api/webhooks/petpooja",
      service: "Gulmohar Analytics - Petpooja Global API Webhook",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

