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
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Petpooja Global API Webhook Receiver with Supabase Persistence
 *
 * Endpoint: POST /api/webhooks/petpooja
 *
 * Processing flow:
 * 1. Receive incoming POST request.
 * 2. Parse and validate JSON against Petpooja Global API specification.
 * 3. Extract event_type ("orderdetails") and order_reference (Order.orderID or Order.customer_invoice_id).
 * 4. Connect to Supabase using SUPABASE_URL and SUPABASE_SECRET_KEY.
 * 5. Persist the complete, untransformed JSON payload to `public.petpooja_webhook_events`.
 * 6. Set `processing_status` to 'received'.
 * 7. Return HTTP 200 with success status only after successful database insertion.
 *    If database persistence fails, return HTTP 500 error response.
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

    // Extract event type and order reference
    const eventType = payload.event;
    const orderID = payload.properties.Order.orderID;
    const customerInvoiceId = payload.properties.Order.customer_invoice_id;
    const orderReference = String(orderID ?? customerInvoiceId ?? "");

    // Persist complete original payload to Supabase
    let insertedEventId: number | undefined;
    try {
      const supabase = getSupabaseServerClient();
      const insertRecord = {
        event_type: eventType,
        order_reference: orderReference,
        payload: body, // Persist entire original unmodified JSON body
        received_at: new Date().toISOString(),
        processing_status: "received",
      };

      const { data, error: insertError, status: httpStatus } = await supabase
        .from("petpooja_webhook_events")
        .insert(insertRecord)
        .select("id")
        .single();

      if (insertError) {
        logWebhookEvent("error", "Failed to persist Petpooja webhook to Supabase", {
          operation: "insert_petpooja_webhook_events",
          order_reference: orderReference,
          db_error_code: insertError.code,
          db_error_message: insertError.message,
          db_error_details: insertError.details,
          db_error_hint: insertError.hint,
          http_status: httpStatus,
        });

        // Determine a safe diagnostic category without exposing raw SQL or internal messages
        let diagnosticCategory = "DATABASE_INSERT_FAILED";
        if (insertError.code === "PGRST301") {
          diagnosticCategory = "AUTHENTICATION_FAILED";
        } else if (insertError.code === "42501") {
          diagnosticCategory = "PERMISSION_DENIED";
        } else if (insertError.code === "42P01" || insertError.code === "PGRST204") {
          diagnosticCategory = "TABLE_OR_COLUMN_NOT_FOUND";
        } else if (insertError.code === "23505") {
          diagnosticCategory = "DUPLICATE_KEY_VIOLATION";
        } else if (insertError.code === "23502") {
          diagnosticCategory = "NOT_NULL_VIOLATION";
        }

        return NextResponse.json(
          {
            status: "error",
            message: "Failed to persist webhook event to database",
            error_code: insertError.code,
            diagnostic_category: diagnosticCategory,
          },
          { status: 500 }
        );
      }

      insertedEventId = data?.id;
    } catch (dbInitError) {
      const dbErrorMessage =
        dbInitError instanceof Error ? dbInitError.message : "Database connection error";

      logWebhookEvent("error", "Database client initialization or connection failed", {
        operation: "init_or_connect_supabase",
        order_reference: orderReference,
        error: dbErrorMessage,
      });

      return NextResponse.json(
        {
          status: "error",
          message: "Database service unavailable",
          diagnostic_category: "CONNECTION_FAILED",
        },
        { status: 500 }
      );
    }

    // Structured logging for diagnostic tracking (without PII)
    logWebhookEvent("info", "Petpooja order details received and persisted", {
      event_id: insertedEventId,
      order: safeSummary,
    });

    return NextResponse.json(
      {
        status: "success",
        message: "Order received and persisted successfully",
        order_id: orderID,
        event_id: insertedEventId,
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
 * Health check handler to confirm endpoint accessibility and configuration status.
 */
export async function GET(): Promise<NextResponse> {
  const isSupabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  );

  return NextResponse.json(
    {
      status: "ready",
      endpoint: "/api/webhooks/petpooja",
      service: "Gulmohar Analytics - Petpooja Global API Webhook",
      database_configured: isSupabaseConfigured,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
