# Petpooja Integration Guide: Gulmohar Analytics

This guide details the integration configuration, webhook sharing process, Supabase persistence layer, payload verification, testing steps, and the migration roadmap for Petpooja POS APIs.

---

## 1. Webhook Endpoint URL

### Path:
```
/api/webhooks/petpooja
```

### Full Production URLs:
- **Vercel Deployment (Current):**
  ```
  https://<your-vercel-deployment-domain>/api/webhooks/petpooja
  ```
- **Custom Domain (Production):**
  ```
  https://analytics.gulmohar.restaurant/api/webhooks/petpooja
  ```
- **DigitalOcean VPS (Future):**
  ```
  https://<vps-domain-or-ip>/api/webhooks/petpooja
  ```

---

## 2. Supabase Project Integration Architecture

To ensure auditability, raw data inspection, and seamless reconciliation before loading into production analytics tables, incoming Petpooja Global API requests are persisted in a staging events table in Supabase.

### Environment Configuration:
The server reads secrets exclusively through server-side environment variables:
- `SUPABASE_URL`: The HTTPS URL of the Supabase project.
- `SUPABASE_SECRET_KEY`: The Supabase secret key (Service Role Key) used server-side to bypass RLS policies for ingestion.
- `PETPOOJA_WEBHOOK_TOKEN`: Optional static token agreed upon with Petpooja for webhook validation.

> [!CAUTION]
> Neither `SUPABASE_SECRET_KEY` nor `PETPOOJA_WEBHOOK_TOKEN` should ever be given a `NEXT_PUBLIC_` prefix or exposed to browser code. The Supabase client is enforced as server-only via `import "server-only"`.

### Database Schema:
Table: `public.petpooja_webhook_events` (with RLS enabled)

| Column Name | Data Type | Constraints | Description |
|---|---|---|---|
| `id` | BIGINT | PRIMARY KEY, IDENTITY | Unique event auto-incrementing ID |
| `event_type` | TEXT | | Extracted from payload `event` (e.g. `orderdetails`) |
| `order_reference` | TEXT | | Extracted from `properties.Order.orderID` or `customer_invoice_id` |
| `payload` | JSONB | NOT NULL | Complete, unmodified original JSON payload received from Petpooja |
| `received_at` | TIMESTAMPTZ | | Timestamp when the request was ingested |
| `processing_status` | TEXT | | Initial status set to `received` |

---

## 3. Webhook-to-Database Processing Flow

```
Incoming Webhook (Petpooja POS "SAVE AND PRINT")
                       │
                       ▼
         [POST /api/webhooks/petpooja]
                       │
                       ├─► [1] Parse JSON (returns 400 if malformed)
                       │
                       ├─► [2] Validate Structure & Static Token (returns 400/401 if invalid)
                       │
                       ├─► [3] Extract event_type & order_reference
                       │
                       ├─► [4] Check Supabase Server Configuration (SUPABASE_URL & SUPABASE_SECRET_KEY)
                       │
                       ├─► [5] INSERT complete raw JSON into public.petpooja_webhook_events
                       │       │
                       │       ├─► On DB Error: Log error (no PII), return HTTP 500
                       │       └─► On DB Success: Proceed
                       │
                       ├─► [6] Log sanitized diagnostic event (PII redacted)
                       │
                       ▼
         Return HTTP 200 {"status": "success", "order_id": ..., "event_id": ...}
```

### Key Integrity & Reliability Rules:
1. **Zero Transformation Before Storage:** The entire unmodified JSON payload is stored directly in the `payload` JSONB column.
2. **Persistence Guarantee:** The webhook returns HTTP 200 **only after** the row is successfully committed to Supabase. If the database is unreachable or the insert fails, an HTTP 500 is returned, prompting Petpooja's retry mechanism.
3. **No Premature De-duplication:** All deliveries are recorded even if duplicated, preserving the full audit trail for future reconciliation.

---

## 4. Privacy & Data Protection Safeguards

To protect customer privacy:
- Full customer phone numbers, street addresses, and GSTIN numbers are **never** logged to server consoles or stored in plaintext logs.
- The logger automatically redacts sensitive PII (`*` masking for phone and GSTIN, retaining only the first 3 letters of names).
- Raw demo payloads are stored exclusively within the encrypted Supabase database instance.

---

## 5. How to Test the Webhook

### A. Health Check (GET)
To verify endpoint accessibility and database configuration status:
```bash
curl -X GET https://<your-domain>/api/webhooks/petpooja
```
Expected response:
```json
{
  "status": "ready",
  "endpoint": "/api/webhooks/petpooja",
  "service": "Gulmohar Analytics - Petpooja Global API Webhook",
  "database_configured": true,
  "timestamp": "2026-11-05T18:20:00.000Z"
}
```

### B. Synthetic Order Push (POST)
Send a synthetic payload mirroring Petpooja's documentation:
```bash
curl -X POST https://<your-domain>/api/webhooks/petpooja \
  -H "Content-Type: application/json" \
  -d '{
    "token": "",
    "event": "orderdetails",
    "properties": {
      "Restaurant": {
        "res_name": "Gulmohar Restaurant",
        "address": "Ahmedabad",
        "contact_information": "9876543210",
        "restID": "cp81ghin"
      },
      "Customer": {
        "name": "Rohan",
        "address": "Ahmedabad",
        "phone": "9876543210"
      },
      "Order": {
        "orderID": 101,
        "customer_invoice_id": "101",
        "delivery_charges": 0,
        "order_type": "Dine In",
        "payment_type": "Cash",
        "discount_total": 0,
        "tax_total": 0,
        "round_off": "0",
        "core_total": 500,
        "total": 500,
        "created_on": "2026-03-15 13:00:00",
        "order_from": "POS",
        "status": "Success"
      },
      "OrderItem": [
        {
          "name": "Paneer Butter Masala",
          "itemid": 1001,
          "itemcode": "PBM",
          "price": 500,
          "quantity": 1,
          "total": 500
        }
      ]
    }
  }'
```
Expected response:
```json
{
  "status": "success",
  "message": "Order received and persisted successfully",
  "order_id": 101,
  "event_id": 1
}
```

### C. Verify in Supabase
Run the following SQL query in the Supabase SQL editor:
```sql
SELECT id, event_type, order_reference, processing_status, received_at, payload
FROM public.petpooja_webhook_events
ORDER BY id DESC
LIMIT 5;
```

---

## 6. Information to Share with Petpooja

1. **Webhook URL:** `https://<your-domain>/api/webhooks/petpooja`
2. **HTTP Method:** `POST`
3. **Payload Format:** `application/json`
4. **Authentication:**
   - State whether the webhook is **non-authenticated** (default) or if a static string token should be sent in the `"token"` field.
5. **Request:** Ask Petpooja to trigger a test push (demo order) to verify end-to-end receipt.

---

## 7. What Information is Still Required from Petpooja

1. **Production Get Orders API Endpoint URL** (Petpooja provides this upon contract activation).
2. **Outlet Credentials:**
   - `restID` (Mapping code per outlet)
   - `app_key`
   - `app_secret`
   - `access_token`
3. **Demo Push Confirmation:** Confirmation that Petpooja team has initiated a test push to our `/api/webhooks/petpooja` URL.

---

## 8. Troubleshooting & Diagnostics: Database Insert Failures

### Issue: "Failed to persist webhook event to database" (HTTP 500)
When the webhook validation succeeds but Supabase persistence fails, the route returns:
```json
{
  "status": "error",
  "message": "Failed to persist webhook event to database",
  "error_code": "...",
  "diagnostic_category": "..."
}
```

### Diagnostic Logging Architecture:
To identify the actual database error without exposing raw database error strings or customer personal information to external callers:
1. **Server-Side Structured Logs:**
   The full Supabase error object is recorded strictly in server-side logs:
   - `operation`: Database operation being performed (`insert_petpooja_webhook_events` or `init_or_connect_supabase`).
   - `order_reference`: The order reference ID.
   - `db_error_code`: The database/PostgREST error code (e.g. `42501`, `PGRST204`, `42P01`).
   - `db_error_message`: Sanitized error text.
   - `db_error_details` and `db_error_hint`: Additional diagnostic hints from PostgreSQL/PostgREST.
   - `http_status`: HTTP status code returned by PostgREST.
2. **Public Diagnostic Response (Safe):**
   The public HTTP response never exposes internal database schemas, table names, or raw SQL errors. It provides only:
   - `error_code`: High-level code (e.g. `PGRST301`, `42501`, `PGRST204`).
   - `diagnostic_category`: Safe classification enum:
     - `AUTHENTICATION_FAILED` (`PGRST301` - JWT authentication or validation failure)
     - `PERMISSION_DENIED` (`42501` - RLS policy violation or missing role permissions)
     - `TABLE_OR_COLUMN_NOT_FOUND` (`42P01` / `PGRST204` - missing table or schema column mismatch)
     - `DUPLICATE_KEY_VIOLATION` (`23505`)
     - `NOT_NULL_VIOLATION` (`23502`)
     - `DATABASE_INSERT_FAILED` (general fallback)
     - `CONNECTION_FAILED` (network or client initialization failure)

### Diagnostic Investigation Checklist:
1. **Supabase Key Format (`sb_secret_`):**
   Supabase uses the new `sb_secret_` format for secret/service keys alongside traditional JWT tokens. When inspecting server logs:
   - If `error_code` is `PGRST301` (`AUTHENTICATION_FAILED`): The API gateway/PostgREST could not validate or parse the provided token format.
   - If `error_code` is `42501` (`PERMISSION_DENIED`): The token is valid, but the resolved database role lacks table permissions or violates Row Level Security.
2. **PostgreSQL / PostgREST Error Codes:**
   - `PGRST301`: JWT authentication or token validation failure.
   - `42501`: Permission denied / RLS violation.
   - `42P01` / `PGRST204`: Table or column missing or not in the `public` schema.
   - `23502`: A non-null column constraint was not satisfied.
   - `23505`: Unique constraint violation.
3. **No Unrestricted RLS Policies:**
   Do not add open `true` RLS policies. The exact root cause must first be confirmed from the server log output.

---

## 9. Transition Plan to DigitalOcean VPS

When migrating the application from Vercel to a self-hosted DigitalOcean VPS:

1. **Zero Route Alteration:**
   The webhook route uses standard Next.js App Router route handlers with Node.js runtime compatibility. It functions identically inside a Docker container, PM2 process, or standalone Next.js server (`output: 'standalone'`).
2. **Environment Portability:**
   Transfer `SUPABASE_URL` and `SUPABASE_SECRET_KEY` into the VPS `.env` or system environment.
3. **Reverse Proxy (Nginx/Caddy):**
   Expose port 443 with an SSL certificate (Let's Encrypt / Certbot) and proxy `/api/webhooks/petpooja` to `localhost:3000`.
4. **Persistent Logging & Ingestion:**
   In the VPS environment, logs can be forwarded to standard log sinks (e.g. systemd journal, Vector, or file log rotation).
5. **Future Transformation Worker:**
   A background worker or scheduled job can read `received` rows from `petpooja_webhook_events`, parse items, reconcile them against T-1 Get Orders pulls, and populate dashboard analytics models.

---

## 10. Phase A: Production Database Design & Order Processing Specification (Final Architecture)

*Status: Architecture Design Proposal (Pending Implementation Approval)*

### 10.1 Petpooja Payload & Field Analysis

Based on the actual demo order payload (`orderID = 279`, `customer_invoice_id = 279`), sample payloads, and official Petpooja documentation:

1. **Exact HTTP Request Body Preservation vs. Parsed JSONB (Integrity vs. Origin Authentication):**
   - **Byte-for-Byte Preservation:** Every incoming HTTP webhook delivery is strictly persisted as a separate record in `public.petpooja_webhook_events`. No delivery is discarded or dropped at the gate.
   - To guarantee complete auditability without loss of byte ordering, whitespace, or floating point formatting:
     - `raw_body`: `BYTEA NOT NULL` stores the exact raw HTTP request body bytes received over the wire.
     - `payload`: `JSONB NOT NULL` stores the parsed JSON structure for efficient Postgres indexing and querying.
     - `payload_sha256`: `TEXT NOT NULL` stores the hex-encoded SHA-256 hash.
   - **Where Hashing & Integrity Verification Occur:**
     - **Ingestion Hashing (Application Layer):** The webhook Route Handler (`src/app/api/webhooks/petpooja/route.ts`) reads the raw request buffer via `req.arrayBuffer()`, converts it to a Node.js `Buffer`, and computes `payload_sha256 = crypto.createHash('sha256').update(buffer).digest('hex')`. It then inserts both the raw buffer (as `BYTEA`) and the pre-computed hash. This eliminates any runtime dependency on PostgreSQL server-side extensions (such as `pgcrypto`) during high-frequency ingestion.
     - **Database-Side Tamper Audit (Optional / Verification Layer):** When auditing historical records in PostgreSQL, operators can re-verify stored byte integrity using `encode(digest(raw_body, 'sha256'), 'hex')`, which requires enabling the standard `pgcrypto` extension (`CREATE EXTENSION IF NOT EXISTS pgcrypto;`).
   - **Distinction Between Integrity and Authenticated Origin:**
     - Computing SHA-256 over `raw_body` verifies **data integrity at rest and in transit** (detecting whether stored bytes have been altered or corrupted when re-hashed and compared with the trusted stored hash).
     - **Important Security Distinction:** A plain SHA-256 hash alone does **NOT** prove sender identity, prevent an in-transit man-in-the-middle modification prior to arrival, or establish cryptographic non-repudiation, because Petpooja does not sign Global API webhook payloads with an HMAC secret or private digital signature. Origin validation and access control rely on application-level restaurant mapping authentication against registered `restID` credentials and network-level security controls.
   - **Handling Repeat Deliveries:** If Petpooja's infrastructure retries delivery of the exact same payload due to a network timeout, the subsequent delivery is inserted into `public.petpooja_webhook_events` with `processing_status = 'duplicate'` and `duplicate_of_event_id` referencing the first delivery. It retains full receipt history while preventing duplicate worker queue processing.
   - Crucially, **payload-level deduplication is distinct from business-order identity**. An order may legitimately receive multiple distinct webhook events over its lifecycle (e.g. initial bill punch, KOT edit, reprint, status transition to `'Cancelled'`). Each such delivery has a different payload/timestamp, is staged independently, and is processed sequentially to update the canonical order.
2. **Order Identity, Deduplication & Cross-API Matching Strategy:**
   - **Petpooja Identifier Realities:**
     - In Petpooja POS, `orderID` is an outlet-scoped identifier (typically sequential within a terminal or outlet).
     - Global API payloads include `Restaurant.restID` (e.g. `cp81ghin`) and `Order.orderID`, but `ref_id` is absent (`NULL`).
     - In the Get Orders API, each order record contains `orderID`, `customer_invoice_id`, and a `refId` (e.g. `"7342987696"`). Petpooja's written documentation explicitly defines `refId` as a pagination/continuation cursor ("Pass refId: '' for initial call; returns next set from refId"), while also serving as an internal backend reference. **`refId` is not confirmed to be a permanent, immutable business key.**
   - **Matching Without Silent Merges or Unconfirmed Assumptions:**
     - We do **not** assume `orderID` is globally monotonic or that it resets strictly annually on April 1st.
     - We do **not** bind `sales_orders` to a hard, unalterable database unique constraint on `(restaurant_id, petpooja_order_id)` or `ref_id`.
     - **Configurable Cross-API Order Resolution Pipeline:**
       When an order arrives via either Global API webhook or Get Orders API:
       1. **Step 1 (Outlet Isolation):** Resolve `restaurant_id` from `Restaurant.restID`.
       2. **Step 2 (Active Window Lookup):** Search `sales_orders` for existing candidates matching `restaurant_id = :restaurant_id` AND `petpooja_order_id = :order_id` within a configurable business date window:
          $$\text{order\_date} \in [\text{incoming\_date} - 1\,\text{day},\, \text{incoming\_date} + 1\,\text{day}]$$
       3. **Step 3 (Ambiguity Resolution & Manual Review Safeguard):**
          - **Case A: Exactly 1 Candidate Matches:** Compare business fingerprints (`table_no`, `order_type`, `ordered_at` within $\pm 12$ hours, and line-item match score). If fingerprints match, confirm as the same order. If incoming from Get Orders API, backfill `ref_id`, set `matching_status = 'matched'`, and update status/totals idempotently without creating a duplicate.
          - **Case B: Multiple Candidates Match (Ambiguous Match):** If more than one existing `sales_orders` row matches the same outlet and `orderID` within the window (e.g. counter reset during the day or terminal duplicate), **never silently merge**. Preserve all candidate records untouched. Create the new record with `matching_status = 'ambiguous_match'` and store all candidate IDs and comparison metrics in `matching_evidence` for manual operator review.
          - **Case C: Zero Candidates Match:** Treat the incoming order as a **new distinct historical order** with `matching_status = 'unmatched'`.
       4. **Preserving Source Identifiers & Evidence:**
          - `sales_orders` records `source_api` (`'global_webhook'`, `'get_orders_api'`, `'reconciled_both'`), `matching_status` (`'unmatched'`, `'matched'`, `'ambiguous_match'`, `'manual_review'`), `first_received_at`, `last_synced_at`, `matching_evidence` (JSONB storing the match criteria, e.g. `{"matched_by": "order_id_and_date_window", "webhook_event_id": 104, "get_orders_ref_id": "ABC123"}`), and `latest_raw_event_id`.
3. **Item Identification & Menu Mapping (Handling Missing Food Costs):**
   - Each order item carries `itemid` (numeric string/integer, e.g. `136978202`), `name`, `itemcode`, and optional `category_name`, `categoryid`, `sap_code`, and `vendoritemcode`.
   - Prices in Petpooja: `price` (base unit price), `quantity`, `total` (line item subtotal before item-level taxes/discounts).
   - **Historical Integrity:** When POS item names or prices change, past orders must retain their original historical snapshot (`item_name`, `unit_price`, `line_total`) while linking via `menu_item_id` to our canonical catalog for recipe/food cost mapping.
   - **Crucial Rule on Food Costs:** `menu_items.food_cost` is **nullable** (`NUMERIC(12, 2) NULL`). If an item is unmapped or recipe ingredients have not been costed, **food cost is NOT zero**. Storing zero would report false 100% gross margins.
   - **Analytics Treatment:** When calculating recipe food margin, items with `NULL` food cost are excluded from the food cost sum, and the analytics summary reports an explicit coverage metric: `food_cost_coverage_pct = (known_cost_sales / total_sales) * 100`. Profitability views visually flag unmapped dishes rather than displaying misleading margins.
4. **Discounts and Taxes (Preserving Both Order and Item Levels without Double-Counting):**
   - **Order-Level Tax:** Root `Tax[]` array contains aggregated order taxes with `title`, `type` ("P" percentage / "F" fixed), `rate`, and `amount` (e.g. CGST 2.5% = ₹12.68, SGST 2.5% = ₹12.68, total = ₹25.36).
   - **Order-Level Discount:** Root `Discount[]` array contains voucher/bill-level reductions.
   - **Item-Level Tax & Discount:** Each `OrderItem` contains its own `tax` and `discount` numeric fields, as well as an `item_tax_info` breakdown (e.g., item CGST/SGST amounts).
   - **Analytics Double-Counting Rule:** Order-level taxes/discounts are stored in child tables (`sales_order_taxes`, `sales_order_discounts`) linked to `sales_orders`, while item-level taxes/discounts are stored in `sales_order_items`. Analytics aggregation functions must query **either** the order header summaries (`sales_orders.tax_total`, `sales_orders.discount_total`) **or** the line-item breakdowns (`sales_order_items.tax_amount`, `sales_order_items.discount_amount`), but **never combine both levels in the same aggregate query**.
5. **Add-ons:**
   - Line items can have an `addon[]` array containing `name`, `price`, `quantity`, `group_name`, `addon_id`, and `addon_group_id`.
   - In Petpooja, add-on amounts are included in the bill's `core_total`. Add-ons increase effective line revenue and are tracked in dedicated child table `sales_order_item_addons`. Add-on quantities represent modifier units and are tracked distinctly from parent dish quantities.
6. **Payment Handling & Settlement Integrity:**
   - **Never Infer Settlement from Order Status:** Petpooja's `Order.status = "Success"` indicates that the order was accepted/punched at the POS terminal, **not** that payment has been reconciled or settled.
   - **Explicit Separation of Dimensions:**
     1. **Order Status (`sales_orders.status`):** POS lifecycle status (`'Success'`, `'Cancelled'`). Preserves raw Petpooja `Order.status`.
     2. **Payment Method (`sales_orders.payment_type`):** Tender method reported by POS (`"Cash"`, `"Card"`, `"Online"`, `"Part Payment"`). Preserves raw Petpooja `Order.payment_type`.
     3. **Payment Settlement Status (`sales_orders.payment_status`):** Tracks financial settlement reconciliation. Default value is `'unknown'` when Petpooja does not supply settlement confirmation. Only set to `'settled'`, `'unsettled'`, `'partially_settled'`, or `'refunded'` when verified through gateway webhooks, explicit settlement payloads, or bank reconciliation.
   - **Preserving Tender Breakdowns without Fabrication:**
     - For standard single-payment bills where only `Order.payment_type` is provided, we store `payment_type` on the order header, mark `has_payment_breakdown = false`, and **do not fabricate** synthetic records in `sales_order_payments`.
     - The dedicated child table `sales_order_payments` is populated **only** when Petpooja provides explicit tender breakdown data (e.g. `Order.part_payments[]`). Each tender is recorded with its actual provided amount, `payment_type`, and `custom_payment_type`, and `sales_orders.has_payment_breakdown = true`.

---

### 10.2 Complete PostgreSQL Relational Schema (All 10 Tables)

All tables are designed under the `public` schema in Supabase PostgreSQL:

#### Table 1: `public.petpooja_webhook_events` (Raw Event Staging & Lifecycle Queue)
*Purpose:* Durable, append-only staging capturing **every** raw webhook delivery, byte-for-byte `BYTEA` request preservation, worker lease locking, and retry management.
- `id`: `BIGINT NOT NULL GENERATED ALWAYS AS IDENTITY`
- `event_type`: `TEXT NOT NULL` — e.g. `'orderdetails'`
- `order_reference`: `TEXT NULL` — Petpooja orderID / invoice ID (Nullable if unparseable/missing in malformed push)
- `petpooja_rest_id`: `TEXT NULL` — Extracted restaurant mapping code for fast indexing
- `raw_body`: `BYTEA NOT NULL` — Exact original HTTP request body bytes received over the wire
- `payload`: `JSONB NOT NULL` — Parsed JSON payload for relational queries and JSON path indexing
- `payload_sha256`: `TEXT NOT NULL` — Cryptographic SHA-256 hash computed directly from `raw_body` bytes
- `received_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `processing_status`: `TEXT NOT NULL DEFAULT 'received'` — Check constraint: `processing_status IN ('received', 'processing', 'processed', 'failed', 'permanently_failed', 'duplicate', 'unregistered_restaurant')`
- `processing_attempts`: `INTEGER NOT NULL DEFAULT 0`
- `next_retry_at`: `TIMESTAMPTZ NULL` — Exponential backoff retry timestamp
- `locked_at`: `TIMESTAMPTZ NULL` — Worker concurrency lease timestamp
- `locked_by`: `TEXT NULL` — Worker instance identifier for lease fencing
- `lease_token`: `UUID NULL` — Unique fencing token generated per claim to prevent stale worker writes
- `last_error`: `TEXT NULL` — Most recent diagnostic error message
- `processed_at`: `TIMESTAMPTZ NULL`
- `duplicate_of_event_id`: `BIGINT NULL REFERENCES public.petpooja_webhook_events(id) ON DELETE SET NULL`
- `sales_order_id`: `UUID NULL` — Foreign key to `public.sales_orders(id)` added via ALTER TABLE migration (see Section 10.7)
*Primary Key:* `PRIMARY KEY (id)`
*Table Check Constraints:*
- `chk_webhook_events_status`: `CHECK (processing_status IN ('received', 'processing', 'processed', 'failed', 'permanently_failed', 'duplicate', 'unregistered_restaurant'))`
- `chk_webhook_events_lease`: `CHECK (processing_status != 'processing' OR (locked_at IS NOT NULL AND locked_by IS NOT NULL AND lease_token IS NOT NULL))`
*Foreign Keys:*
- `duplicate_of_event_id` $\to$ `petpooja_webhook_events(id)` `ON DELETE SET NULL`
- `sales_order_id` $\to$ `sales_orders(id)` `ON DELETE SET NULL` (circular reference created post-table creation)
*Indexes:*
- `idx_webhook_events_claim` ON `(processing_status, next_retry_at, received_at)`
- `idx_webhook_events_order_seq` ON `(petpooja_rest_id, order_reference, received_at ASC)` WHERE order_reference IS NOT NULL
- `idx_webhook_events_hash` ON `(payload_sha256, received_at DESC)`
- `idx_webhook_events_sales_order` ON `(sales_order_id)`

#### Table 2: `public.petpooja_event_errors` (Audit Trail & Error History)
*Purpose:* Complete historical audit trail of processing failures across all attempts, preserving stack traces and error codes.
- `id`: `BIGINT NOT NULL GENERATED ALWAYS AS IDENTITY`
- `event_id`: `BIGINT NOT NULL REFERENCES public.petpooja_webhook_events(id) ON DELETE CASCADE`
- `attempt_number`: `INTEGER NOT NULL`
- `error_code`: `TEXT NULL` — e.g. `'PG_SERIALIZATION_FAILURE'`, `'INVALID_PAYLOAD_STRUCTURE'`
- `error_message`: `TEXT NOT NULL`
- `error_stack`: `TEXT NULL`
- `occurred_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `event_id` $\to$ `petpooja_webhook_events(id)` `ON DELETE CASCADE`
*Indexes:* `idx_event_errors_event_id` ON `(event_id, occurred_at DESC)`

#### Table 3: `public.restaurants`
*Purpose:* Strict registry of authorized restaurant outlets. **Unknown restaurant IDs are never auto-created.**
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `petpooja_rest_id`: `TEXT NOT NULL` — e.g. `"cp81ghin"`
- `name`: `TEXT NOT NULL` — e.g. `"Gulmohar Restaurant"`
- `address`: `TEXT NULL`
- `contact_phone`: `TEXT NULL`
- `currency`: `TEXT NOT NULL DEFAULT 'INR'`
- `timezone`: `TEXT NOT NULL DEFAULT 'Asia/Kolkata'`
- `is_active`: `BOOLEAN NOT NULL DEFAULT true`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Unique Constraints:* `UNIQUE (petpooja_rest_id)`
*Indexes:* `idx_restaurants_petpooja_id` ON `(petpooja_rest_id)`

#### Table 4: `public.menu_items`
*Purpose:* Canonical product catalog mapping Petpooja POS items to internal recipes and food costs.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT`
- `petpooja_item_id`: `TEXT NOT NULL` — e.g. `"136978202"`
- `item_code`: `TEXT NULL` — e.g. `"cds"`
- `name`: `TEXT NOT NULL`
- `category_name`: `TEXT NULL`
- `current_price`: `NUMERIC(12, 2) NULL` — Nullable if price omitted in POS catalog
- `food_cost`: `NUMERIC(12, 2) NULL` — Nullable: UNKNOWN food cost is NULL, NEVER zero
- `is_active`: `BOOLEAN NOT NULL DEFAULT true`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `restaurant_id` $\to$ `restaurants(id)` `ON DELETE RESTRICT`
*Unique Constraints:* `UNIQUE (restaurant_id, petpooja_item_id)`
*Indexes:* `idx_menu_items_rest_code` ON `(restaurant_id, item_code)`

#### Table 5: `public.sales_orders`
*Purpose:* Normalized order headers. Relates 1:N to `petpooja_webhook_events`. Preserves original Petpooja fields alongside normalized operational attributes.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `restaurant_id`: `UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT`
- `petpooja_order_id`: `TEXT NOT NULL` — Raw Petpooja `orderID` (e.g. `"279"`)
- `customer_invoice_id`: `TEXT NULL` — Raw Petpooja `customer_invoice_id` (e.g. `"279"`)
- `ref_id`: `TEXT NULL` — Petpooja reference cursor (present in Get Orders API, backfilled on reconciliation)
- `order_date`: `DATE NOT NULL` — Calendar date derived from `ordered_at` for partitioned analytics
- `ordered_at`: `TIMESTAMPTZ NOT NULL` — Raw Petpooja `Order.created_on`
- `order_type`: `TEXT NOT NULL` — Raw Petpooja `order_type` (`"Dine In"`, `"Delivery"`, `"Pick Up"`)
- `order_from`: `TEXT NOT NULL` — Raw Petpooja `order_from` (`"POS"`, `"Zomato"`, `"Swiggy"`)
- `sub_order_type`: `TEXT NULL` — Area (`"AC"`, `"Garden"`) or aggregator subtype
- `table_no`: `TEXT NULL`
- `status`: `TEXT NOT NULL DEFAULT 'Success'` — Raw Petpooja `Order.status` (`"Success"`, `"Cancelled"`)
- `cancel_reason`: `TEXT NULL`
- `payment_type`: `TEXT NOT NULL` — Raw Petpooja `Order.payment_type` (`"Cash"`, `"Card"`, `"Online"`, `"Part Payment"`)
- `payment_status`: `TEXT NOT NULL DEFAULT 'unknown'` — Check constraint: `payment_status IN ('unknown', 'settled', 'unsettled', 'partially_settled', 'refunded')`
- `has_payment_breakdown`: `BOOLEAN NOT NULL DEFAULT false` — True only when explicit tender breakdowns exist
- `core_total`: `NUMERIC(12, 2) NULL` — Raw Petpooja `core_total` (Nullable if missing in raw payload)
- `discount_total`: `NUMERIC(12, 2) NULL` — Raw Petpooja `discount_total` (Nullable if missing)
- `tax_total`: `NUMERIC(12, 2) NULL` — Raw Petpooja `tax_total` (Nullable if missing)
- `delivery_charges`: `NUMERIC(12, 2) NULL` — Raw Petpooja delivery fee (Nullable if missing)
- `packaging_charges`: `NUMERIC(12, 2) NULL` — Raw Petpooja container fee (Nullable if missing)
- `service_charges`: `NUMERIC(12, 2) NULL` — Raw Petpooja restaurant service charge (Nullable if missing)
- `round_off`: `NUMERIC(12, 2) NULL` — Raw Petpooja rounding adjustment (Nullable if missing)
- `total_amount`: `NUMERIC(12, 2) NULL` — Raw Petpooja `total` (Nullable if missing)
- `financial_status`: `TEXT NOT NULL DEFAULT 'pending'` — Check constraint: `financial_status IN ('pending', 'reconciled', 'mismatch', 'not_computable')`
- `reconciliation_difference`: `NUMERIC(12, 2) NULL` — Stored numerical variance where calculable; NULL if not computable
- `matching_status`: `TEXT NOT NULL DEFAULT 'unmatched'` — Check constraint: `matching_status IN ('unmatched', 'matched', 'ambiguous_match', 'manual_review')`
- `source_api`: `TEXT NOT NULL DEFAULT 'global_webhook'` — `'global_webhook'`, `'get_orders_api'`, `'reconciled_both'`
- `matching_evidence`: `JSONB NOT NULL DEFAULT '{}'::jsonb` — Stores resolution criteria, ambiguity details, and matched IDs
- `first_received_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `last_synced_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `biller_name`: `TEXT NULL`
- `assignee_name`: `TEXT NULL`
- `latest_raw_event_id`: `BIGINT NULL REFERENCES public.petpooja_webhook_events(id) ON DELETE SET NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:*
- `restaurant_id` $\to$ `restaurants(id)` `ON DELETE RESTRICT`
- `latest_raw_event_id` $\to$ `petpooja_webhook_events(id)` `ON DELETE SET NULL`
*Indexes:*
- `idx_sales_orders_lookup` ON `(restaurant_id, petpooja_order_id, order_date)`
- `idx_sales_orders_ref_id` ON `(restaurant_id, ref_id)` WHERE ref_id IS NOT NULL
- `idx_sales_orders_date` ON `(restaurant_id, order_date)`
- `idx_sales_orders_ordered_at` ON `(restaurant_id, ordered_at)`
- `idx_sales_orders_status` ON `(status)`
- `idx_sales_orders_financial_status` ON `(financial_status)`
- `idx_sales_orders_matching_status` ON `(matching_status)`

#### Table 6: `public.sales_order_items`
*Purpose:* Individual bill line items preserving historical snapshots and item-level financials.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `order_id`: `UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE`
- `menu_item_id`: `UUID NULL REFERENCES public.menu_items(id) ON DELETE SET NULL`
- `petpooja_item_id`: `TEXT NOT NULL` — POS item id snapshot
- `item_name`: `TEXT NOT NULL` — Historical snapshot of dish name
- `item_code`: `TEXT NULL` — Historical snapshot of item code
- `quantity`: `NUMERIC(10, 3) NOT NULL`
- `unit_price`: `NUMERIC(12, 2) NOT NULL`
- `line_total`: `NUMERIC(12, 2) NOT NULL` — `quantity * unit_price`
- `discount_amount`: `NUMERIC(12, 2) NULL` — Nullable if no discount field in item payload
- `tax_amount`: `NUMERIC(12, 2) NULL` — Nullable if no tax field in item payload
- `special_notes`: `TEXT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:*
- `order_id` $\to$ `sales_orders(id)` `ON DELETE CASCADE`
- `menu_item_id` $\to$ `menu_items(id)` `ON DELETE SET NULL`
*Indexes:*
- `idx_sales_order_items_order` ON `(order_id)`
- `idx_sales_order_items_menu_item` ON `(menu_item_id)`

#### Table 7: `public.sales_order_item_addons`
*Purpose:* Line item add-ons and modifiers.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `order_item_id`: `UUID NOT NULL REFERENCES public.sales_order_items(id) ON DELETE CASCADE`
- `petpooja_addon_id`: `TEXT NULL`
- `group_name`: `TEXT NULL`
- `name`: `TEXT NOT NULL`
- `price`: `NUMERIC(12, 2) NULL` — Nullable if omitted in source
- `quantity`: `NUMERIC(10, 3) NOT NULL DEFAULT 1`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `order_item_id` $\to$ `sales_order_items(id)` `ON DELETE CASCADE`
*Indexes:* `idx_addons_order_item` ON `(order_item_id)`

#### Table 8: `public.sales_order_taxes`
*Purpose:* Order-level tax breakdown (CGST, SGST, VAT).
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `order_id`: `UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE`
- `title`: `TEXT NOT NULL` — e.g. `"CGST"`, `"SGST"`
- `tax_type`: `TEXT NULL` — `"P"` (Percentage) or `"F"` (Fixed)
- `rate`: `NUMERIC(8, 4) NULL` — Nullable if rate percentage not supplied
- `amount`: `NUMERIC(12, 2) NOT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `order_id` $\to$ `sales_orders(id)` `ON DELETE CASCADE`
*Indexes:* `idx_sales_order_taxes_order` ON `(order_id)`

#### Table 9: `public.sales_order_discounts`
*Purpose:* Order-level discounts and promotional voucher reductions.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `order_id`: `UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE`
- `title`: `TEXT NOT NULL` — e.g. `"Special Discount"`
- `discount_type`: `TEXT NULL` — `"P"` or `"F"`
- `rate`: `NUMERIC(8, 4) NULL`
- `amount`: `NUMERIC(12, 2) NOT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `order_id` $\to$ `sales_orders(id)` `ON DELETE CASCADE`
*Indexes:* `idx_sales_order_discounts_order` ON `(order_id)`

#### Table 10: `public.sales_order_payments`
*Purpose:* Detailed payment breakdown records, populated **only** when explicit tender breakdowns (`part_payments[]`) are supplied by Petpooja.
- `id`: `UUID NOT NULL DEFAULT gen_random_uuid()`
- `order_id`: `UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE`
- `payment_type`: `TEXT NOT NULL` — `"Cash"`, `"Card"`, `"Online"`, `"Other"`
- `custom_payment_type`: `TEXT NULL` — e.g. `"EazyDiner"`, `"ZomatoPay"`
- `amount`: `NUMERIC(12, 2) NOT NULL`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
*Primary Key:* `PRIMARY KEY (id)`
*Foreign Keys:* `order_id` $\to$ `sales_orders(id)` `ON DELETE CASCADE`
*Indexes:* `idx_order_payments_order` ON `(order_id)`

---

### 10.3 PostgreSQL-Compatible Atomic Worker Claiming & Ordering

#### 10.3.1 Delivery Ordering vs. Source Event Ordering
1. **Source Event Timing:** Petpooja Global API payloads provide `Order.created_on` (the timestamp when the ticket was punched) and optional `Order.modified_on` (if edited). However, Petpooja does **not** provide a guaranteed monotonic event sequence number, incremental revision counter, or state version.
2. **Delivery Timing (`received_at`):** Indicates when our Vercel webhook handler received the HTTP request. Network retries, transient network delays, or serverless routing can occasionally cause an older event to be delivered after a newer event.
3. **Core Architectural Principle:** **HTTP receipt order (`received_at`) does NOT establish source-event order.** We must never assume that an event received at 14:05 happened after an event received at 14:04 at the restaurant POS.
4. **Conservative Processing Policy (Protecting State Integrity):**
   - When updating orders, the worker evaluates source timestamps (`Order.created_on` / `Order.modified_on`).
   - If an incoming event has a source timestamp strictly older than the `ordered_at` or `last_synced_at` of an already-processed state for that order, the older event is **not permitted to overwrite newer order state**. The worker links the older event (`sales_order_id = sales_orders.id`), marks it `processing_status = 'processed'`, records `matching_evidence = jsonb_build_object('note', 'superseded_by_newer_event')`, and preserves current order data.
   - If source timestamps are missing, identical, or contradictory across differing bill states (e.g. bill edit received after cancellation, or different totals with identical timestamps), the order is **never silently overwritten**. The worker sets `matching_status = 'manual_review'` and preserves all conflicting evidence in `matching_evidence` for manager intervention.

#### 10.3.2 Valid PostgreSQL Atomic Batch Claiming Query (Resolving Active-Lease Ordering, Lease Tokens, and Error Handling)

##### Concurrency Flaws Resolved in This Architecture:
1. **Active-Lease Bypass Flaw:** If a query filters `eligible_events` before ranking with `ROW_NUMBER()`, an active unexpired event (`processing_status = 'processing'`) is excluded from the ranking CTE. Consequently, a newer event for the same order becomes `rn = 1` among the remaining rows, allowing a second worker to claim and process the newer event while the older event is actively executing.
2. **Exhausted Retries Blocking Orders:** If an event hits the maximum retry limit (5 attempts) but remains in `processing_status = 'failed'`, it stays in `outstanding_events` and indefinitely retains `rn = 1`, permanently deadlocking all subsequent events for that bill.
3. **Fragile Delimiter Concatenation:** Concatenating outlet ID and order reference into a single text key can collide if inputs contain delimiter characters. Using explicit composite grouping expressions in PostgreSQL eliminates delimiter hazards.
4. **Shared Batch Lease Tokens:** Passing a single application-generated lease token for an entire batch causes token collisions across distinct events. The claim query generates a distinct UUID per row using PostgreSQL `gen_random_uuid()`.

##### The Corrected Multi-Stage Claim Architecture:
To guarantee that **an active unexpired lease blocks all newer events for that order**, while allowing clean reclamation, per-row lease tokens, and terminal dead-letter transitions:
1. Include **ALL outstanding uncompleted events** (`'received'`, `'processing'`, `'failed'`) in the ranking CTE. Events in terminal states (`'processed'`, `'duplicate'`, `'unregistered_restaurant'`, `'permanently_failed'`) are excluded.
2. Partition strictly by composite expressions:
   - For valid restaurant ID and order reference: Group by `(petpooja_rest_id, order_reference)`.
   - For missing/empty `order_reference`: Isolate per event using `(petpooja_rest_id, 'unidentified_order_' || id::text)`.
   - For missing/empty `petpooja_rest_id`: Isolate per event using `('unidentified_rest_' || id::text, id::text)`.
3. Select an event for claiming **if and only if** it is `rn = 1` AND its current status is eligible:
   - Fresh arrival (`'received'`).
   - Expired or malformed processing lease (`processing_status = 'processing' AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')`).
   - Retryable failure (`processing_status = 'failed' AND processing_attempts < 5 AND (next_retry_at IS NULL OR next_retry_at <= now())`).
4. Atomically lock candidates with `FOR UPDATE SKIP LOCKED`.
5. Assign a fresh, unique cryptographic UUID lease token per row directly in PostgreSQL via `gen_random_uuid()`.

```sql
WITH outstanding_events AS (
  -- Stage 1: Include ALL outstanding (uncompleted) events for proper per-order ordering.
  -- Terminal states ('processed', 'duplicate', 'unregistered_restaurant', 'permanently_failed') are excluded.
  SELECT
    id,
    petpooja_rest_id,
    order_reference,
    processing_status,
    processing_attempts,
    next_retry_at,
    locked_at,
    received_at,
    -- Multi-column deterministic partition expressions (no delimiter string concatenation)
    CASE
      WHEN petpooja_rest_id IS NOT NULL AND trim(petpooja_rest_id) != ''
           AND order_reference IS NOT NULL AND trim(order_reference) != ''
      THEN petpooja_rest_id
      ELSE 'unidentified_rest_' || id::text
    END AS part_rest_id,
    CASE
      WHEN petpooja_rest_id IS NOT NULL AND trim(petpooja_rest_id) != ''
           AND order_reference IS NOT NULL AND trim(order_reference) != ''
      THEN order_reference
      ELSE 'unidentified_order_' || id::text
    END AS part_order_ref
  FROM public.petpooja_webhook_events
  WHERE processing_status IN ('received', 'processing', 'failed')
),
ranked_events AS (
  -- Stage 2: Rank all outstanding events per order strictly by arrival time (with id tie-breaker)
  SELECT
    id,
    processing_status,
    processing_attempts,
    next_retry_at,
    locked_at,
    received_at,
    ROW_NUMBER() OVER (
      PARTITION BY part_rest_id, part_order_ref
      ORDER BY received_at ASC, id ASC
    ) AS rn
  FROM outstanding_events
),
claimable_candidates AS (
  -- Stage 3: Only the TRUE OLDEST outstanding event (rn = 1) can ever be considered.
  -- If rn = 1 is actively leased (processing with locked_at >= now() - 5 min),
  -- it fails this WHERE clause and BLOCKS all newer events for that order!
  SELECT id
  FROM ranked_events
  WHERE rn = 1
    AND (
      -- Case A: Fresh arrival
      processing_status = 'received'
      -- Case B: Stale or malformed lease expired, eligible for reclamation
      OR (processing_status = 'processing' AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes'))
      -- Case C: Failed attempt ready for retry (< 5 attempts)
      OR (processing_status = 'failed' AND processing_attempts < 5 AND (next_retry_at IS NULL OR next_retry_at <= now()))
    )
  ORDER BY received_at ASC, id ASC
  LIMIT 50
),
locked_batch AS (
  -- Stage 4: Atomically lock candidates. Concurrent workers skip locked rows cleanly.
  SELECT e.id
  FROM public.petpooja_webhook_events e
  JOIN claimable_candidates c ON e.id = c.id
  FOR UPDATE SKIP LOCKED
)
-- Stage 5: Atomically acquire lease with worker ID and unique per-row UUID lease token
UPDATE public.petpooja_webhook_events targets
SET processing_status = 'processing',
    locked_at = now(),
    locked_by = :worker_id,
    lease_token = gen_random_uuid(),
    processing_attempts = processing_attempts + 1
FROM locked_batch
WHERE targets.id = locked_batch.id
RETURNING targets.*;
```

##### Atomic Terminal Transition on Failure & Retry Backoff Protocol:
When a worker encounters an error processing an event, it executes the following atomic lease-fenced failure update:

```sql
-- Worker failure handler:
-- If processing_attempts >= 5 (after current attempt), transition atomically to 'permanently_failed'.
-- Otherwise, increment attempts and compute exponential backoff: 30s * 2^attempts.
UPDATE public.petpooja_webhook_events
SET processing_status = CASE
      WHEN processing_attempts >= 5 THEN 'permanently_failed'
      ELSE 'failed'
    END,
    next_retry_at = CASE
      WHEN processing_attempts >= 5 THEN NULL
      ELSE now() + (power(2, processing_attempts) * interval '30 seconds')
    END,
    last_error = :error_message,
    locked_at = NULL,
    locked_by = NULL,
    lease_token = NULL
WHERE id = :event_id
  AND processing_status = 'processing'
  AND lease_token = :my_lease_token;

-- Also log failure history in audit table
INSERT INTO public.petpooja_event_errors (event_id, attempt_number, error_code, error_message, error_stack)
VALUES (:event_id, :attempt_number, :error_code, :error_message, :error_stack);
```

**Unblocking Subsequent Events on Terminal Failure:**
Because `permanently_failed` is not in `('received', 'processing', 'failed')`, the exhausted event **immediately exits `outstanding_events`**. On the next polling cycle, subsequent lifecycle events for that order advance from `rn = 2` to `rn = 1` and proceed without being deadlocked.

**Manual Operator Replay Procedure:**
To manually re-queue a permanently failed event after resolving an upstream issue or mapping:
```sql
UPDATE public.petpooja_webhook_events
SET processing_status = 'received',
    processing_attempts = 0,
    next_retry_at = NULL,
    last_error = NULL,
    locked_at = NULL,
    locked_by = NULL,
    lease_token = NULL
WHERE id = :target_event_id
  AND processing_status = 'permanently_failed';
```

---

#### 10.3.3 Comprehensive Worker Lifecycle & Concurrency Verification Matrix (12 Scenarios)

The table below outlines the deterministic behavior of the architecture across all 12 operational and concurrency scenarios:

| Scenario | System State & Inputs | Query & Filter Behavior | Outcome & Architectural Safeguard |
| :--- | :--- | :--- | :--- |
| **1. Fresh Arrival** | Event 1 arrives, `processing_status = 'received'`, `processing_attempts = 0`. No prior events for order. | Included in `outstanding_events`, assigned `rn = 1`. Qualifies under Case A. Locked via `FOR UPDATE SKIP LOCKED`. | Claimed by worker; `status = 'processing'`, `locked_at = now()`, fresh UUID `lease_token` generated. |
| **2. Active Processing Blocks Subsequent Event** | Event 1 is `processing` (lease valid, remaining 3 min). Event 2 arrives for same order (`received`). | Both in `outstanding_events`. Event 1 gets `rn = 1`; Event 2 gets `rn = 2`. Event 1 fails claim condition (unexpired lease). Event 2 excluded because `rn = 2`. | **Zero rows claimed for this order.** Event 2 is strictly blocked until Event 1 completes or its lease expires. Sequential integrity preserved. |
| **3. Lease Expiration & Reclamation** | Event 1 `processing`, worker stalled/crashed, `locked_at` was 6 min ago (> 5 min lease). Event 2 waiting (`received`). | Both in `outstanding_events`. Event 1 is `rn = 1`. Qualifies under Case B (`locked_at < now() - 5 min`). Event 2 is `rn = 2`. | Worker B reclaims Event 1, assigns fresh `lease_token` and updates `locked_at = now()`. Event 2 remains blocked at `rn = 2`. |
| **4. Stale Worker Fenced at Commit (Zombie)** | Worker A (reclaimed) resumes after 6 min and tries to commit Event 1. Worker B is currently processing Event 1 with new lease token. | Worker A executes fenced UPDATE `WHERE id = 1 AND lease_token = :token_A`. Row count returned is `0` (token mismatch). | Worker A detects row count `0`, executes immediate `ROLLBACK`, and aborts. Stale write rejected; Worker B completes cleanly. |
| **5. Transient Failure with Backoff** | Event 1 fails attempt 1 (DB timeout). Event 2 waiting (`received`). | Event 1 updated to `status = 'failed'`, `attempts = 1`, `next_retry_at = now() + 60s`. Both in `outstanding_events`. Event 1 is `rn = 1`. | Event 1 fails claim condition (`next_retry_at > now()`). Event 2 is `rn = 2` (blocked). Entire order safely paused until retry delay elapses. |
| **6. Retry Window Elapses** | Event 1 `next_retry_at` elapses (`next_retry_at <= now()`). `attempts = 1 < 5`. Event 2 waiting. | Event 1 is `rn = 1`. Qualifies under Case C (`next_retry_at <= now()`). Event 2 is `rn = 2`. | Worker claims Event 1 for attempt 2 with fresh `lease_token`. Event 2 remains blocked until Event 1 completes. |
| **7. Exhausted Retries (`permanently_failed`)** | Event 1 fails attempt 5. Event 2 waiting (`received`). | Error handler detects `attempts >= 5`, updates Event 1 to `status = 'permanently_failed'`. | Event 1 exits `outstanding_events`. On next claim, Event 2 becomes `rn = 1` and is claimed. **Order is never deadlocked.** |
| **8. Missing Order Reference** | Event 3 arrives with `order_reference IS NULL` or empty string. | Partition key resolves to `part_order_ref = 'unidentified_order_' || id`. Forms its own single-element group with `rn = 1`. | Claimed and processed independently. Does not block and is not blocked by any other event. |
| **9. Missing Restaurant ID** | Event 4 arrives with `petpooja_rest_id IS NULL` or empty string. | Partition key resolves to `part_rest_id = 'unidentified_rest_' || id`. Forms isolated group with `rn = 1`. | Claimed independently. Processing engine flags `unregistered_restaurant` without blocking legitimate outlet queues. |
| **10. Legacy / Inconsistent Lease (`locked_at IS NULL`)** | Row in DB has `processing_status = 'processing'` but `locked_at IS NULL` (abnormal crash/legacy row). | Included in `outstanding_events`. Qualifies under Case B (`locked_at IS NULL OR locked_at < now() - 5 min`). | Automatically reclaimed and repaired by next worker with valid `locked_at` and `lease_token`. Future occurrences blocked by table CHECK constraint. |
| **11. Concurrent Worker Contention** | Worker A and Worker B run claim query at the exact same millisecond. Event 1 is `rn = 1`. | Both identify Event 1. Stage 4 executes `FOR UPDATE SKIP LOCKED`. PostgreSQL awards lock to Worker A; Worker B skips row. | Worker A claims Event 1. Worker B receives 0 rows (or other orders). No duplicate claims, no lock waits, no race conditions. |
| **12. Multi-Event Batch Claim** | Queue contains eligible events for Order X (`rn = 1`) and Order Y (`rn = 1`). Worker claims batch of 2. | Stage 5 runs `UPDATE ... lease_token = gen_random_uuid() RETURNING targets.*`. | PostgreSQL generates an **independent UUID per row**. Worker receives distinct lease tokens for Order X and Order Y; commits each with its own token. |

---

#### 10.3.4 Atomic Lease Fencing Verification at Commit Time

Assigning an independent lease token during claiming is necessary, but **insufficient on its own** if a worker stalls (e.g. event loop pause, heavy garbage collection, slow upstream call) and resumes after its lease has been reclaimed.

To prevent a zombie/delayed worker from overwriting the database after another worker has already reclaimed the event:

##### The Exact Transaction-Level Protocol:
1. Every claimed event receives its own independent cryptographically random UUID `lease_token` (from PostgreSQL `gen_random_uuid()` during batch claim).
2. The worker thread maintains a strict per-event mapping: `eventId -> leaseToken`.
3. All business entity mutations (`sales_orders`, `sales_order_items`, `sales_order_item_addons`, `sales_order_taxes`, `sales_order_discounts`, `sales_order_payments`) and the event completion update occur **within a single atomic database transaction** (`BEGIN ... COMMIT`).
4. The terminal query inside the transaction updates the event status **fenced by the worker's unique lease token**:
   ```sql
   -- Must be executed inside the SAME transaction as the order upserts
   UPDATE public.petpooja_webhook_events
   SET sales_order_id = :sales_order_id,
       processing_status = 'processed',
       processed_at = now(),
       locked_at = NULL,
       locked_by = NULL,
       lease_token = NULL
   WHERE id = :event_id
     AND processing_status = 'processing'
     AND lease_token = :my_lease_token;
   ```
5. **Mandatory Row-Count Verification:**
   - The application inspects the affected row count returned by this query:
     - **If row count == 1:** The worker still holds the valid, unexpired lease. The transaction executes `COMMIT`. Order changes and event completion take effect atomically.
     - **If row count == 0:** The lease expired while the worker was processing, and another worker reclaimed the event (generating a new `lease_token`). The current worker executes an **immediate `ROLLBACK`** and aborts.
6. **System Behavior on Lease Expiration:**
   - When a worker's lease expires and gets reclaimed, the stale worker's transaction is completely rolled back. Zero partial or stale rows persist.
   - The reclaiming worker re-reads the latest database state and processes the event with a clean slate, ensuring deterministic state progression.

---

### 10.4 Financial Field Classification & Metric Formulations

All monetary fields from Petpooja are classified into **Source Fields (Preserved Raw with explicit columns)**, **Validation Checks**, and **Derived Analytics Metrics**. Existing business rules from `mock_data/business-rules.md` remain strictly unchanged.

#### 10.4.1 Field Classification Table

| Category | Field / Metric | PostgreSQL Column & Type | Description & Handling |
| :--- | :--- | :--- | :--- |
| **Source** | `core_total` | `sales_orders.core_total NUMERIC(12, 2) NULL` | Raw Petpooja F&B subtotal. NULL if missing from payload. |
| **Source** | `tax_total` | `sales_orders.tax_total NUMERIC(12, 2) NULL` | Raw Petpooja total tax from root `Tax[]`. NULL if missing. |
| **Source** | `discount_total` | `sales_orders.discount_total NUMERIC(12, 2) NULL` | Raw Petpooja bill discounts from root `Discount[]`. NULL if missing. |
| **Source** | `delivery_charges` | `sales_orders.delivery_charges NUMERIC(12, 2) NULL` | Raw Petpooja delivery fee. NULL if missing. |
| **Source** | `packaging_charges`| `sales_orders.packaging_charges NUMERIC(12, 2) NULL`| Raw Petpooja packaging fee. NULL if missing. |
| **Source** | `service_charges`  | `sales_orders.service_charges NUMERIC(12, 2) NULL`  | Raw Petpooja restaurant service charge. NULL if missing. |
| **Source** | `round_off` | `sales_orders.round_off NUMERIC(12, 2) NULL` | Raw Petpooja rounding adjustment. NULL if missing. |
| **Source** | `total_amount` | `sales_orders.total_amount NUMERIC(12, 2) NULL` | Raw Petpooja `total`. NULL if missing. |
| **Source** | `line_total` | `sales_order_items.line_total NUMERIC(12, 2) NOT NULL` | Raw Petpooja `quantity * unit_price` per line item. |
| **Source** | `item_tax` | `sales_order_items.tax_amount NUMERIC(12, 2) NULL` | Raw Petpooja line-item tax. Stored separately from order-level tax. |
| **Source** | `item_discount` | `sales_order_items.discount_amount NUMERIC(12, 2) NULL` | Raw Petpooja line-item discount. Stored separately from order-level discount. |
| **Source** | `food_cost` | `menu_items.food_cost NUMERIC(12, 2) NULL` | Canonical recipe ingredient cost. **NULL when unmapped or unknown (NEVER zero).** |
| **Validation** | `financial_status` | `sales_orders.financial_status TEXT NOT NULL` | `'pending'`, `'reconciled'`, `'mismatch'`, `'not_computable'`. |
| **Validation** | `reconciliation_difference` | `sales_orders.reconciliation_difference NUMERIC(12, 2) NULL`| Numerical variance if arithmetic does not balance; NULL if not computable. |
| **Validation** | `matching_status` | `sales_orders.matching_status TEXT NOT NULL` | `'unmatched'`, `'matched'`, `'ambiguous_match'`, `'manual_review'`. |
| **Derived** | **Gross Sales** | Analytics Queries / Views | $\sum(\text{COALESCE}(\text{sales\_orders.core\_total}, 0))$. Matches existing business rule. |
| **Derived** | **Net Sales** | Analytics Queries / Views | $\text{COALESCE}(\text{core\_total}, 0) - \text{COALESCE}(\text{discount\_total}, 0)$. Matches existing business rule. |
| **Derived** | **Total Food Cost** | Analytics Queries / Views | $\sum(\text{sales\_order\_items.quantity} \times \text{menu\_items.food\_cost})$ for mapped items. |
| **Derived** | **Food Cost Coverage** | Analytics Queries / Views | $\frac{\text{Sales of Mapped Dishes}}{\text{Total Sales}} \times 100\%$. Reports margin confidence without false zeros. |
| **Derived** | **Gross Food Margin**| Analytics Queries / Views| $\text{Net Sales} - \text{Total Food Cost}$ (computed over items with known cost). |

#### 10.4.2 Double-Counting Prevention Strategy
- **Order-Level vs. Line-Item Discounts:** Petpooja bills can apply both order-level voucher discounts (in `Discount[]`) and item-level promotional reductions (in `OrderItem.discount`).
  - Order-level discounts are stored in `sales_orders.discount_total` and `sales_order_discounts`.
  - Item-level discounts are stored in `sales_order_items.discount_amount`.
  - **Rule:** The analytics metric **Net Sales** is defined at the order level as $\sum(\text{core\_total} - \text{discount\_total})$. Analytics queries aggregating at the line-item level must **not** subtract `sales_orders.discount_total` again.
- **Order-Level vs. Line-Item Taxes:**
  - Order taxes are stored in `sales_orders.tax_total` and `sales_order_taxes`.
  - Line-item taxes are stored in `sales_order_items.tax_amount`.
  - **Rule:** Tax reporting queries aggregate **either** `sales_orders.tax_total` (for accounting remittance) **or** `sales_order_items.tax_amount` (for item tax breakdowns), never both.

#### 10.4.3 Sample Order Verification (`orderID = 279`)

> [!IMPORTANT]
> **Source Payload Verification Rule:** Dashboard metrics and financial reconciliation figures must reflect the actual, verified fields present in Petpooja payloads. Before documenting or evaluating expected dashboard figures for demo order `orderID = 279`, the live ingested payload in `petpooja_webhook_events` is parsed directly:
> - If the payload contains the sample items (Item 1 = ₹338.00, Item 2 = ₹169.00, Core Total = ₹507.00, Tax = ₹25.36, Round Off = -₹0.36, Total = ₹532.00):
>   - **Core Total (`core_total`):** ₹507.00 (`338 + 169`)
>   - **Tax Total (`tax_total`):** ₹25.36 (CGST 2.5% = ₹12.68 + SGST 2.5% = ₹12.68)
>   - **Round Off (`round_off`):** -₹0.36
>   - **Final Total (`total_amount`):** ₹532.00 (`507 + 25.36 - 0.36`)
>   - **Gross Sales:** ₹507.00
>   - **Net Sales:** ₹507.00 - ₹0.00 = ₹507.00
> - If the payload contains different figures (e.g. ₹138.00 subtotal with ₹144.90 total), those exact source values are ingested without alteration. No assumed or unverified monetary figures are hard-coded into database definitions or dashboard contracts.

**Resulting Reconciliation Check Formulation:**
$$\text{Expected Total} = \text{core\_total} - \text{COALESCE}(\text{discount\_total}, 0) + \text{COALESCE}(\text{tax\_total}, 0) + \dots + \text{COALESCE}(\text{round\_off}, 0)$$
$$\text{Variance} = |\text{total\_amount} - \text{Expected Total}|$$

**Payment Breakdown Handling:**
- `payment_type`: preserved exactly as received (e.g. `'Cash'`).
- `payment_status`: defaults to `'unknown'` unless explicit gateway settlement details are provided.
- `has_payment_breakdown`: `false` when only order-level `payment_type` is present. No synthetic child payments are fabricated.

---

### 10.5 Cross-API Order Deduplication & Ambiguity Handling

```
Scenario 1: Single Candidate Match (Expected Path)
- Webhook push on 2026-08-17: OrderID = 279, ref_id = NULL
- Get Orders API pull on 2026-08-18: OrderID = 279, ref_id = 'ABC123'
- Pipeline finds 1 matching candidate in [2026-08-16, 2026-08-18]. Fingerprints match.
- Action: Idempotently backfills ref_id = 'ABC123', sets source_api = 'reconciled_both', matching_status = 'matched'.

Scenario 2: Ambiguous Multiple Candidate Match (Safety Guardrail)
- POS terminal counter reset or multi-terminal collision creates two orders with OrderID = 279 on the same date.
- Get Orders API pull arrives for OrderID = 279.
- Pipeline detects 2 existing candidate records in the window.
- Action:
  * NEVER silently merge or arbitrarily overwrite one.
  * Preserves both candidates untouched.
  * Inserts Get Orders record with matching_status = 'ambiguous_match'.
  * Stores all candidate IDs, line-item comparisons, and timestamps in matching_evidence JSONB.
  * Flags order for manual operator review in the dashboard.

Scenario 3: Outlet Counter Reset Across Long Horizon
- Outlet resets counter 6 months later. Produces new OrderID = 279 on 2027-02-17.
- Candidate search finds 0 matches in [2027-02-16, 2027-02-18].
- Action: Inserts as an independent new sales order with matching_status = 'unmatched'. Both historical records are fully preserved.
```

---

### 10.6 Confirmed Petpooja Behaviors vs. Unresolved Questions

#### Confirmed Behaviors:
1. `Get Orders API` passes `YYYY-MM-DD` and returns completed orders for $T-1$ (business day closed).
2. Global API webhook pushes on "Save and Print" bill punch.
3. Order item arrays contain separate unit price, item discount, and item tax fields.
4. Add-on amounts are included in `core_total`.
5. Standard single-payment bills provide `Order.payment_type` without `part_payments[]`.

#### Unresolved Questions Requiring Petpooja Confirmation:
1. **Order ID Counter Reset Policy:** Under what exact conditions does `orderID` reset (annually on April 1st, daily, upon manual terminal reset, or never)?
2. **`refId` Invariance:** Is `refId` in Get Orders API an invariant identifier for an order, or does it change across pagination calls or bill revisions?
3. **Bill Modification Webhook Dispatches:** When a cashier edits an active bill, adds an item, or reprints a bill in Petpooja POS, is a new webhook dispatched with the identical `orderID`?
4. **Bill Cancellation Webhook Push:** Does bill cancellation in POS trigger an immediate Global API webhook push with `status: 'Cancelled'`, or is cancellation only reflected during the T-1 Get Orders pull?
5. **Payload Completeness on Subsequent Pushes:** When a bill modification or cancellation webhook is dispatched, does Petpooja push the complete revised order payload (including all items and taxes) or only a partial delta/status payload?
6. **Part Payments Structure:** Is `part_payments[]` guaranteed to always be an array when `payment_type = 'Part Payment'`, and does the sum of tender amounts always balance with `Order.total`?
7. **Payment Settlement Tracking:** Does Petpooja POS provide digital payment gateway settlement confirmations (e.g. UPI / card transaction IDs and settlement timestamps) via webhook, or are all POS transactions treated as locally recorded tenders?

---

### 10.7 Clean-Database Migration Execution Order (Circular Reference Handling)

The circular foreign key relationship between `petpooja_webhook_events.sales_order_id` and `sales_orders.latest_raw_event_id` is executed cleanly across three migration phases:

```sql
-- Phase 1: Create independent master tables and staging table without foreign key to sales_orders
CREATE TABLE public.restaurants (...);
CREATE TABLE public.menu_items (...);
CREATE TABLE public.petpooja_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_reference TEXT NULL,
  petpooja_rest_id TEXT NULL,
  raw_body BYTEA NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_status TEXT NOT NULL DEFAULT 'received',
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NULL,
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  lease_token UUID NULL,
  last_error TEXT NULL,
  processed_at TIMESTAMPTZ NULL,
  duplicate_of_event_id BIGINT NULL REFERENCES public.petpooja_webhook_events(id) ON DELETE SET NULL,
  sales_order_id UUID NULL -- Column created initially WITHOUT foreign key constraint
);
CREATE TABLE public.petpooja_event_errors (...);

-- Phase 2: Create sales_orders and all child tables (linking latest_raw_event_id to petpooja_webhook_events)
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  ...
  latest_raw_event_id BIGINT NULL REFERENCES public.petpooja_webhook_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.sales_order_items (...);
CREATE TABLE public.sales_order_item_addons (...);
CREATE TABLE public.sales_order_taxes (...);
CREATE TABLE public.sales_order_discounts (...);
CREATE TABLE public.sales_order_payments (...);

-- Phase 3: Add foreign key constraint to petpooja_webhook_events.sales_order_id
ALTER TABLE public.petpooja_webhook_events
  ADD CONSTRAINT fk_webhook_events_sales_order
  FOREIGN KEY (sales_order_id)
  REFERENCES public.sales_orders(id)
  ON DELETE SET NULL;
```

This sequence guarantees clean, error-free execution from an empty database without cyclical dependency errors.

---

## 11. Phase 1 Implementation Specification (Simplified Minimum Viable Integration)

*Status: Approved for Step 1 Execution (Database Schema & Registry Seeding)*

### 11.1 Key Architectural Principles for Phase 1
1. **Explicit Data Source Toggle (No Auto-Fallback):**
   - Controlled via `DATA_SOURCE=database` vs `DATA_SOURCE=mock`.
   - In `DATA_SOURCE=database` mode, if a query returns zero records or missing data for a date range, the UI renders an **empty or loading state**, never misleading mock data.
2. **Safe Deduplication without Rigid Multi-Column Constraints:**
   - No permanent database unique constraint on `(restaurant_id, petpooja_order_id, order_date)`.
   - Raw webhook deliveries are append-only.
   - Deduplication and idempotency are handled cautiously in the staging/normalization worker using active window lookups and fingerprint validation.
3. **Protected Daily Get Orders Fetch Operation:**
   - The pull operation is restricted to authenticated server environments:
     - Route: `/api/cron/fetch-daily-orders` protected by `CRON_SECRET` header or Bearer authorization.
     - CLI Command: `npm run petpooja:fetch-orders -- --date YYYY-MM-DD`.
     - Never exposed via unrestricted public endpoints.
4. **Preserve Raw Records & Nullable Monetary Values:**
   - All existing records in `public.petpooja_webhook_events` remain untouched.
   - Missing discounts, taxes, or food costs are stored as `NULL`, never forced to `0.00`.

### 11.2 Phase 1 Migration File
- **File:** [`supabase/migrations/20261109_phase1_minimum_reliable_schema.sql`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/supabase/migrations/20261109_phase1_minimum_reliable_schema.sql)
- **Target Schema:** `public` in Supabase PostgreSQL.
- **Created Tables:**
  1. `public.restaurants` (Registry table ready for verified Gulmohar outlet credentials; unverified automatic seeding removed)
  2. `public.menu_items` (Basic POS item mapping, `food_cost` nullable)
  3. `public.sales_orders` (Normalized order headers with financial/matching status)
  4. `public.sales_order_items` (Line items with unit price, quantity, tax, discount)
- **Security & RLS:**
  - Row-Level Security (RLS) explicitly enabled on all four newly created tables (`restaurants`, `menu_items`, `sales_orders`, `sales_order_items`), restricting anon/public access and permitting backend mutations via the server-side service role key only.
- **Phase 1 Idempotency:**
  - Single sequential processor for both Global API and Get Orders API data.
  - Header updates and child-item replacements (delete existing child items + insert fresh items) execute in a single atomic transaction.
- **Staging Alterations:**
  - Adds `petpooja_rest_id`, `sales_order_id`, retry, and lease tracking columns to `public.petpooja_webhook_events` with non-destructive `IF NOT EXISTS` syntax.

---

## 12. Multi-Outlet POS Mapping & External ID Quarantine

*Status: Architecture Planning & Multi-Outlet Specification Finalized*

When expanding from a single test outlet to multi-outlet operations (e.g. Kozhikode Outlet 1, Kozhikode Outlet 2, Bangalore Outlet 1), Petpooja webhooks and Get Orders APIs differentiate outlets via `Restaurant.restID`.

### 12.1 Internal Mapping Architecture
- In the normalized database (`outlets` table), each outlet contains:
  - `id UUID PRIMARY KEY`: Permanent internal system identifier.
  - `code TEXT UNIQUE`: Human-readable identifier (e.g. `KOZ-001`).
  - `name TEXT`: Display name (e.g. `Ashirvad Gulmohar - Kozhikode 1`).
  - `petpooja_rest_id TEXT UNIQUE NULLABLE`: External outlet identifier provided by Petpooja (e.g. `53qcgrdis8`).
  - `is_active BOOLEAN DEFAULT true`: Operational status.

### 12.2 Ingestion & Quarantine Pipeline
1. **Raw Webhook Staging:**
   - Ingestion route extracts `Restaurant.restID` and stores it into `petpooja_webhook_events.petpooja_rest_id` without filtering.
2. **Outlet Resolution:**
   - Normalization worker performs a lookup:
     ```sql
     SELECT id FROM public.outlets WHERE petpooja_rest_id = :incoming_rest_id AND is_active = true;
     ```
3. **Quarantine Handling for Unregistered Outlets:**
   - If no matching active outlet is found, the worker updates the raw event:
     - `processing_status = 'unregistered_restaurant'`
     - `last_error = 'Petpooja restID [xyz] is not mapped to an active outlet in public.outlets'`
   - The transaction cleanly exits without creating `sales_orders` or throwing fatal unhandled exceptions.
   - Legitimate orders from other outlets continue processing without interruption.
4. **Resolution of Quarantined Events:**
   - Once management registers or confirms the outlet's `petpooja_rest_id` in `outlets`, an admin command or cron reprocesses quarantined events:
     ```sql
     UPDATE public.petpooja_webhook_events
     SET processing_status = 'received', retry_count = 0
     WHERE processing_status = 'unregistered_restaurant'
       AND petpooja_rest_id IN (SELECT petpooja_rest_id FROM public.outlets WHERE is_active = true);
     ```

---

## 13. Petpooja Integration Status & Verification Matrix (November 2026)

*Status: Stage 1 through Stage 3D Implemented & Verified in Test Suites; Production Database Initialized; Live Production Ingestion Pending Verification*

| Component | Target API | Implementation Status | Test Status | Notes / Blockers |
| :--- | :--- | :---: | :---: | :--- |
| **Type Definitions** (`src/types/petpooja.ts`) | Global Webhook & Get Orders | **Implemented** | **Verified (Build/Linter)** | Separate push and pull schemas according to official Petpooja specifications. |
| **Webhook Receiver** (`/api/webhooks/petpooja`) | Global API Push | **Implemented** | **Tested with synthetic demo** | Staged on Vercel/Supabase; stores full raw payload into `public.petpooja_webhook_events`. |
| **Payload Validator** (`src/lib/petpooja/validator.ts`) | Global API Push | **Implemented** | **Verified** | Validates `orderdetails`, `properties`, and optional static token. Does not filter by restaurant ID at ingress. |
| **PII Logger** (`src/lib/petpooja/logger.ts`) | Logging Utility | **Implemented** | **Verified** | Masks phone numbers, GSTIN, and full address; redacts sensitive customer data from server logs. |
| **Get Orders Client** (`src/lib/petpooja/get-orders-client.ts`) | Get Orders Pull | **Implemented** | **10/10 Tests Passed** | Production client with cookie authentication, 1000-order pagination, loop protection, and timeout retry. Live test on 2026-11-18 returned HTTP 200 with 507 orders for 2026-11-17 (did not write to production DB). |
| **Response Normalizer** (`src/lib/petpooja/normalizer.ts`) | Normalization Engine | **Implemented** | **12/12 Tests Passed** | Converts raw Petpooja order structures to `NormalizedSalesOrder` with exact `Prisma.Decimal` arithmetic, IST/UTC timezone handling, and PII masking. |
| **Outlet & Product Resolver** (`src/lib/petpooja/resolver.ts`) | Master Data Resolver | **Implemented** | **9/9 Tests Passed** | Resolves `restID` to internal `outletId` and `organizationId`. Matches items by `OutletProductSetting.petpoojaItemId` then `Product.productCode`. Unmapped items safely return `productId: null`. |
| **Transactional Ingestion Service** (`src/lib/petpooja/ingestion-service.ts`) | Database Persistence | **Implemented** | **9/9 Tests Passed** | Performs atomic upsert on `(outletId, petpoojaOrderId)` with clean child line-item replacement (`deleteMany` + `createMany`). Preserves nullable financials. |
| **Sync Orchestrator** (`src/lib/petpooja/sync.ts`) | End-to-End Pipeline | **Implemented** | **7/7 Tests Passed** | Connects Client $\to$ Normalizer $\to$ Resolver $\to$ Ingestion. Handles multi-page pulls, partial errors, and statistics reporting. |
| **Staging Ingestion Table** (`public.petpooja_webhook_events`) | Supabase Staging | **Implemented** | **Active on Supabase** | Stores raw payload in JSONB with event ID, order reference, and receipt timestamp. |
| **Production Database (`outlets.petpooja_rest_id`)** | PostgreSQL 16 (`gulmohar_analytics`) | **Initialized** | **Verified on Hostinger VPS** | Initialized via `seed.prod.ts` on 20 Nov 2026. Outlet `KOZ-001` configured with `petpoojaRestId = "9780nusx"`. |
| **Live Production Sales Sync** | Production Ingestion | **Pending** | **Pending Live Run** | Full pipeline is implemented and unit-tested, but has NOT yet been run against the live production database. |

---

## 14. Phase 1 Synchronization & Normalization Readiness Checklist

*Status: Audit Completed (November 2026)*

### 14.1 Minimum Synchronization Architecture
1. **Raw Event Staging (Implemented):**
   - Incoming Global API push requests are received at `POST /api/webhooks/petpooja` and committed to Supabase `public.petpooja_webhook_events`.
   - Append-only: all deliveries are stored unmodified with `processing_status = 'received'`.
2. **Duplicate Order Prevention (Implemented in PostgreSQL - Migration `20261115070600_add_status_and_unique_to_sales_orders`):**
   - Hardened `sales_orders` with unique constraint `@@unique([outletId, petpoojaOrderId])`.
   - Normalization worker safely upserts on `(outlet_id, petpooja_order_id)`.
3. **Handling Updated / Modified / Cancelled Orders (Implemented in PostgreSQL - Migration `20261115070600_add_status_and_unique_to_sales_orders`):**
   - Added `status String @default("Success")` column mapped to `sales_orders.status`.
   - Preserves Petpooja order status ("Success", "Cancelled"), separated from internal reconciliation statuses `financial_status` and `matching_status`.
   - Analytics queries exclude `status = 'Cancelled'` from revenue totals.
4. **Multi-Outlet Mapping (Implemented & Initialized in Production):**
   - Outlets resolved via `outlets.petpooja_rest_id`.
   - `KOZ-001` initialized with `petpoojaRestId = '9780nusx'` via `prisma/seeds/seed.prod.ts` on 20 November 2026.
   - Events with unknown `restID` are flagged as `unregistered_restaurant` in staging or returned as `OUTLET_UNMAPPED` without crashing worker queues or blocking registered outlets.

### 14.2 Production Readiness & Verified Implementation
The full Petpooja integration pipeline has been completed across Stages 1–3D:
- **Stage 1 (API Client):** `src/lib/petpooja/get-orders-client.ts`
- **Stage 2 (Response Normalizer):** `src/lib/petpooja/normalizer.ts`
- **Stage 3A (Database Readiness Audit):** Confirmed existing schema readiness without migrations.
- **Stage 3B (Outlet & Product Resolver):** `src/lib/petpooja/resolver.ts`
- **Stage 3C (Transactional Ingestion Service):** `src/lib/petpooja/ingestion-service.ts`
- **Stage 3D (Sync Orchestrator):** `src/lib/petpooja/sync.ts`

**Live Verification Note:**
- On 18 November 2026, a live API pull for operational date `2026-11-17` returned HTTP 200 with 507 orders for restaurant `9780nusx`.
- That test was a read-only fetch that verified API connectivity, authentication, and payload schema; it **did not write records to the production database**.

### 14.3 Pending Production Deployment & Validation Work
The following tasks remain pending before production live sales ingestion is considered complete:
1. **Application Login Verification:** Verify initial administrator login via `/login` with credentials provisioned by `seed.prod.ts`.
2. **Deploy Updated Application Runtime:** Restart/recreate the production application container `gulmohar-analytics` to run the updated Docker image built at commit `3cfcc31`.
3. **Verify Production Credentials:** Verify that VPS `.env` contains valid Petpooja credentials without exposing secrets.
4. **Controlled Production Sales Sync:** Execute a controlled live synchronization for a specific operational date (e.g. `2026-11-17`).
5. **Database Import Verification:** Verify ingested `sales_orders`, line items, financial sums, and outlet associations directly in PostgreSQL `gulmohar_analytics`.
6. **Dashboard Verification:** Confirm that `/dashboard` and `/dashboard/reports` accurately reflect the ingested sales orders in database mode (`DATA_SOURCE=database`).

> [!WARNING]
> Do not mark production ingestion as completed. A successful API pull and successful database bootstrap do not mean production sales ingestion has been verified.

### 14.3 Deferred Scope Checklist (Phase 2+)
- [ ] Automated real-time stock deduction on order arrival.
- [ ] Recipe-based ingredient depletion for sales orders.
- [ ] Purchase order generation and supplier invoice tracking.
- [ ] Demand forecasting and AI predictive preparation recommendations.
- [ ] Complex multi-tender reconciliation dashboards and gateway settlement tracking.
