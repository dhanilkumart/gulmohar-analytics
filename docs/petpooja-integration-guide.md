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

## 8. Transition Plan to DigitalOcean VPS

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
