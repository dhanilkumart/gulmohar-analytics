# Petpooja Integration Guide: Gulmohar Analytics

This guide details the integration configuration, webhook sharing process, payload verification, testing steps, and the migration roadmap for Petpooja POS APIs.

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

## 2. Information to Share with Petpooja

Petpooja requires a publicly accessible webhook endpoint to configure the **Global API** push notifications:

1. **Webhook URL:** Provide your deployment URL:
   `https://<your-domain>/api/webhooks/petpooja`
2. **HTTP Method:** `POST`
3. **Payload Format:** `application/json`
4. **Authentication:**
   - As per Petpooja Global API documentation: *"The webhook should be non-authenticated. If required, we can send a static token in the body of the payload in the key named 'token'."*
   - Inform Petpooja whether you prefer **non-authenticated (initial demo)** or want to supply a static string token (e.g. `gulmohar_secure_wh_<random_string>`).

---

## 3. Webhook Request & Payload Specifications

### Trigger Mechanism:
The Petpooja POS triggers an event-driven HTTP POST request immediately upon pressing the **"SAVE AND PRINT"** CTA button for a bill.

### Structure:
```json
{
  "token": "optional-static-token",
  "event": "orderdetails",
  "properties": {
    "Restaurant": {
      "res_name": "Gulmohar Restaurant",
      "address": "Ahmedabad",
      "contact_information": "9876543210",
      "restID": "outlet_mapping_id"
    },
    "Customer": {
      "name": "Customer Name",
      "address": "Customer Address",
      "phone": "9876543210",
      "gstin": ""
    },
    "Order": {
      "orderID": 114,
      "customer_invoice_id": "114",
      "order_type": "Dine In",
      "payment_type": "Cash",
      "total": 1158,
      "core_total": 1158,
      "tax_total": 0,
      "discount_total": 0,
      "round_off": "0",
      "created_on": "2026-03-15 14:30:00",
      "order_from": "POS",
      "status": "Success"
    },
    "Tax": [],
    "Discount": [],
    "OrderItem": [
      {
        "name": "Item Name",
        "itemid": 123456,
        "itemcode": "CODE1",
        "price": 350,
        "quantity": 1,
        "total": 350
      }
    ]
  }
}
```

### Webhook Response:
On success (HTTP 200):
```json
{
  "status": "success",
  "message": "Order received successfully",
  "order_id": 114
}
```

On validation failure (HTTP 400 or HTTP 401):
```json
{
  "status": "error",
  "message": "Payload validation failed",
  "details": ["Missing required field: 'properties.Restaurant.restID'"]
}
```

---

## 4. Privacy & Data Protection Safeguards

To protect customer privacy:
- Full customer phone numbers, street addresses, and GSTIN numbers are **never** logged to server consoles or stored in plaintext logs.
- The logger automatically redacts sensitive PII (`*` masking for phone and GSTIN, retains only first 3 letters of names).
- Raw demo payloads are inspected in memory for validation only, and not written to disk or temporary directories.

---

## 5. How to Test the Webhook

### Local Testing using cURL:
Start the local Next.js dev server:
```bash
npm run dev
```

#### Health check test:
```bash
curl -X GET http://localhost:3000/api/webhooks/petpooja
```
Expected response:
```json
{"status":"ready","endpoint":"/api/webhooks/petpooja","service":"Gulmohar Analytics - Petpooja Global API Webhook",...}
```

#### Test demo order push:
```bash
curl -X POST http://localhost:3000/api/webhooks/petpooja \
  -H "Content-Type: application/json" \
  -d '{
    "token": "",
    "event": "orderdetails",
    "properties": {
      "Restaurant": {
        "res_name": "Gulmohar Demo",
        "address": "Ahmedabad",
        "contact_information": "9876543210",
        "restID": "test_rest_01"
      },
      "Customer": {
        "name": "Demo Customer",
        "address": "Local City",
        "phone": "9876543210"
      },
      "Order": {
        "orderID": 101,
        "customer_invoice_id": "INV-101",
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
  "message": "Order received successfully",
  "order_id": 101
}
```

---

## 6. Get Orders API Specification (Historical Pull)

### Model & Mechanics:
- **HTTP Method:** `POST`
- **T-1 Date Behavior:** 
  To pull complete sales data for business day **March 15th (`2026-03-15`)**, pass `order_date`: `"2026-03-16"`. The query should be executed after business hours or as an overnight cron job.
- **Pagination (`refId`):**
  Initial call passes `"refId": ""`. Subsequent requests pass the last returned `refId` to paginate through dense order volumes.
- **Order Status:** Orders include `"status": "Success"` or `"Cancelled"`, with corresponding cancellation reasons and waived amounts.

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
2. **Reverse Proxy (Nginx/Caddy):**
   Expose port 443 with an SSL certificate (Let's Encrypt / Certbot) and proxy `/api/webhooks/petpooja` to `localhost:3000`.
3. **Persistent Logging & Ingestion:**
   In the VPS environment, logs can be forwarded to standard log sinks (e.g. systemd journal, Vector, or file log rotation).
4. **Database Ingestion Phase:**
   When the persistent database (PostgreSQL/TimescaleDB/MySQL) is approved and connected, the webhook receiver will simply insert into a staging queue or order table without changing the API contract with Petpooja.

