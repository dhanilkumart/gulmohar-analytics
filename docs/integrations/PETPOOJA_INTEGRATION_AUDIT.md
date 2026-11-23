# Petpooja Integration & Database Implementation Audit

> **Document Type:** Technical Integration & Architecture Audit  
> **Target Project:** Gulmohar Analytics (Ashirvad Gulmohar Restaurant)  
> **Audit Date:** 2026-11-21  
> **Audited Git Commits:**  
> - **Local Development:** Branch `dev`, Commit `2e863b8381c4e5a5513829d095b322a63cf40645` (*"Add preparation tracking and improve wastage, breakage and manager access"*)  
> - **Production Deployment (VPS):** Commit `3cfcc31f82e4c9fcc3668712d1917ee3b1305ff4` (*"Add Petpooja integration and production bootstrap"*)  
> **Classification:** Read-Only Audit (No secrets, no credentials, no modifications)

---

## 1. Executive Summary

This document presents a comprehensive, read-only audit of the Petpooja POS integration, PostgreSQL database schema, data ingestion pipelines, and environment configuration across the **Local Development environment** and the **Hostinger VPS production deployment**.

### Key Findings at a Glance
1. **Local Architecture is Feature-Complete in Code:**  
   The pull-based Petpooja integration pipeline (`get-orders-client.ts`, `normalizer.ts`, `resolver.ts`, `ingestion-service.ts`, `sync.ts`) is fully written, strictly typed, tested with extensive unit test suites, and ready for execution.
2. **Push Webhook vs. Pull API:**  
   - The push webhook endpoint (`POST /api/webhooks/petpooja`) is implemented as a legacy staging receiver targeting Supabase (`petpooja_webhook_events`), with no native transformation into PostgreSQL `sales_orders`.
   - The pull-based integration (`PetpoojaGetOrdersClient` and `PetpoojaSyncOrchestrator`) bypasses Supabase entirely and streams data directly into PostgreSQL `sales_orders` and `sales_order_items`.
3. **Database Migration Status:**  
   - Local PostgreSQL database (`gulmohar_dev`) has applied all **7 migrations** up to `20261121024835_add_master_data_breakage_and_reasons`.
   - VPS PostgreSQL database (`gulmohar_analytics`) was bootstrapped on commit `3cfcc31` (which applied migrations up to `20261115070600_add_status_and_unique_to_sales_orders`). Migrations `20261121021129` and `20261121024835` (adding preparation logs, breakage items, and reasons) have not yet been deployed to VPS.
4. **Sales Data Ingestion Status:**  
   - Neither Local PostgreSQL nor VPS PostgreSQL currently contains imported sales orders (`SalesOrder.count() == 0`).
   - A verified live Petpooja response payload from outlet `9780nusx` exists locally in `docs/petpooja-data.md` (78,333 lines, containing 100 orders), providing full structural validation for the pull pipeline.
5. **Scheduled Jobs / Cron:**  
   - There are **no background cron jobs, systemd timers, or daemon schedulers** currently running or configured in either environment. Ingestion currently runs only on-demand via test scripts or orchestrator calls.

---

## 2. Local vs VPS Comparison Matrix

| Component | Local Status | VPS Status | Difference | Recommended Action |
|---|---|---|---|---|
| **Git Branch & Commit** | `dev` (`2e863b8`) | `main` (`3cfcc31`) | Local is 1 commit ahead (contains preparation logs, wastage/breakage refactoring, and manager CEO role). | Deploy `dev` to VPS after testing approval. |
| **Get Orders API Client** | Implemented & verified via unit tests (`src/lib/petpooja/get-orders-client.ts`) | Present in codebase (`3cfcc31`) | Identical client code. | Ready for operational use. |
| **Response Normalizer** | Implemented & verified (`src/lib/petpooja/normalizer.ts`) | Present in codebase (`3cfcc31`) | Identical PII-scrubbing and decimal arithmetic logic. | Ready for operational use. |
| **Master Data Resolver** | Implemented & verified (`src/lib/petpooja/resolver.ts`) | Present in codebase (`3cfcc31`) | Identical outlet and product matching hierarchy. | Ready for operational use. |
| **Ingestion Service** | Implemented & verified (`src/lib/petpooja/ingestion-service.ts`) | Present in codebase (`3cfcc31`) | Identical transactional upsert logic. | Ready for operational use. |
| **Sync Orchestrator** | Implemented & verified (`src/lib/petpooja/sync.ts`) | Present in codebase (`3cfcc31`) | Identical batch orchestrator. | Ready for operational use. |
| **Webhook Endpoint** | Implemented (`/api/webhooks/petpooja`), persists to Supabase | Implemented (`/api/webhooks/petpooja`), persists to Supabase | Identical code. Both rely on Supabase staging. | Deprecate or re-route webhook into local PostgreSQL. |
| **Scheduled Jobs / Workers** | **Not implemented** (No cron or workers) | **Not implemented** (No cron or workers) | None. Neither environment has automated cron. | Configure scheduled runner (e.g. Node cron or VPS cron). |
| **Prisma Migrations Applied** | **7 migrations** (Up to `20261121024835`) | **5 migrations** (Up to `20261115070600`) | VPS lacks `20261121021129` (prep logs) and `20261121024835` (breakage/reasons). Both have `sales_orders`! | Run `prisma migrate deploy` on VPS during next deployment. |
| **Sales Orders Table** | Present (`sales_orders`, 0 rows) | Present (`sales_orders`, 0 rows) | None. Schema is identical for sales orders. | Ready to receive orders. |
| **Sales Order Items Table** | Present (`sales_order_items`, 0 rows) | Present (`sales_order_items`, 0 rows) | None. Schema is identical for order items. | Ready to receive order items. |
| **Outlet Mapping (`petpoojaRestId`)** | `null` on local `KOZ-001` outlet | Bootstrapped with `9780nusx` on VPS `KOZ-001` | Local DB outlet has no Petpooja ID; VPS DB outlet is mapped. | Update local `KOZ-001` with `petpoojaRestId = '9780nusx'`. |
| **Environment Variables** | Configured in `.env` (Credentials, cookie, endpoint) | Managed via Docker secrets / host `.env` | Local has full pull credentials; VPS has bootstrap config. | Ensure VPS container receives Petpooja pull credentials. |

---

## 3. Environment Configuration Audit

The following table summarizes the environment variable names across environments. **Actual values and credentials are omitted for security.**

| Environment Variable Name | Required By | Configured Locally (`.env`) | Configured on VPS (`compose.prod.yaml`) | Notes |
|---|---|:---:|:---:|---|
| `DATABASE_URL` | Prisma Client & PostgreSQL | **Yes** | **Yes** | Connects to `gulmohar_dev` locally; `gulmohar_analytics` on VPS. |
| `SESSION_SECRET` | Next.js Auth Middleware | **Yes** | **Yes** | Minimum 32-character secret for sealed cookies. |
| `PETPOOJA_GET_ORDERS_ENDPOINT` | `PetpoojaGetOrdersClient` | **Yes** | **Defaulted** | Falls back to `https://api.petpooja.com/V1/thirdparty/generic_get_orders/`. |
| `PETPOOJA_REST_ID` | `PetpoojaGetOrdersClient` | **Yes** | **Pending** | Production restaurant identifier (`9780nusx`). |
| `PETPOOJA_APP_KEY` | `PetpoojaGetOrdersClient` | **Yes** | **Pending** | Assigned Petpooja application key. |
| `PETPOOJA_APP_SECRET` | `PetpoojaGetOrdersClient` | **Yes** | **Pending** | Assigned Petpooja application secret. |
| `PETPOOJA_ACCESS_TOKEN` | `PetpoojaGetOrdersClient` | **Yes** | **Pending** | Bearer authentication token. |
| `PETPOOJA_API_COOKIE` | `PetpoojaGetOrdersClient` | **Yes** | **Pending** | Production HTTP cookie required for Cloudflare clearance. |
| `PETPOOJA_WEBHOOK_TOKEN` | Legacy Webhook Endpoint | No (Optional) | No (Optional) | Used only for optional signature verification on `/api/webhooks/petpooja`. |
| `SUPABASE_URL` | Legacy Webhook Endpoint | No | No | Temporary staging URL used during early Vercel demo push. |
| `SUPABASE_SECRET_KEY` | Legacy Webhook Endpoint | No | No | Temporary staging key for Supabase. |
| `DATA_SOURCE` | Legacy analytics toggle | Default (`mock`) | Set on VPS | `mock` vs `database`. |

---

## 4. Architectural Deep Dive

### 4.1 How Petpooja Data Enters Gulmohar Analytics

Petpooja data ingestion is designed as a **hybrid pull/push pipeline**, but the **pull-based model is the primary operational mechanism**:

```
┌─────────────────────────────────────────────────────────┐
│              Petpooja Cloud Infrastructure              │
│       https://api.petpooja.com/.../generic_get_orders/   │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP POST (Cookie + Token Auth)
                             │ Daily Batch / Backfill Query
                             ▼
┌─────────────────────────────────────────────────────────┐
│               PetpoojaGetOrdersClient                   │
│   - Enforces 1,000-order page limit                     │
│   - Paginates via Order.refId cursor                    │
│   - Detects loops and handles transient network errors  │
└────────────────────────────┬────────────────────────────┘
                             │ Array of Raw Order Envelopes
                             ▼
┌─────────────────────────────────────────────────────────┐
│                Petpooja Response Normalizer             │
│   - Scrubs all PII (customer names, phone, address)     │
│   - Parses IST timestamps to strict ISO Date objects    │
│   - Standardizes financial decimals via Prisma.Decimal  │
└────────────────────────────┬────────────────────────────┘
                             │ Array of NormalizedSalesOrder
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  Petpooja Resolver                      │
│   - Matches Restaurant.restID -> Outlet.id              │
│   - Matches Item.itemid -> Product.id via 3-tier rules  │
│   - Non-blocking: unmapped items retain productId=null  │
└────────────────────────────┬────────────────────────────┘
                             │ Resolved Entities
                             ▼
┌─────────────────────────────────────────────────────────┐
│             Petpooja Ingestion Service                  │
│   - Transactional upsert into PostgreSQL                │
│   - Upserts SalesOrder (outletId + petpoojaOrderId UK)  │
│   - Cascades & reconciles SalesOrderItem lines          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Responsibilities: Petpooja vs. Gulmohar Analytics
- **Petpooja POS:**
  - Captures orders, floor operations, dine-in table bills, discounts, taxes, and payments at the physical restaurant terminal.
  - Exposes historical closed orders via `generic_get_orders`.
- **Gulmohar Analytics:**
  - Pulls closed orders periodically without manual intervention.
  - Redacts sensitive customer personal information before database entry.
  - Maps external POS item identifiers to internal menu items and recipe categories.
  - Aggregates sales figures for multi-outlet KPI dashboards, loss analysis, and food cost variance calculations.

---

## 5. Source Code & API Reference

### 5.1 Source Files
| File Path | Primary Responsibility |
|---|---|
| `src/lib/petpooja/get-orders-client.ts` | Communicates with the Petpooja HTTP API; handles auth headers, cookies, query timeouts, and `refId` pagination. |
| `src/lib/petpooja/normalizer.ts` | Redacts customer PII, parses IST date strings, normalizes decimal totals (`totalAmount`, `taxTotal`, `discountTotal`), and extracts order items. |
| `src/lib/petpooja/resolver.ts` | Resolves `Restaurant.restID` to `Outlet.id`; maps POS item IDs to database `Product.id` via 3 priority tiers. |
| `src/lib/petpooja/ingestion-service.ts` | Performs PostgreSQL transactional upserts on `SalesOrder` and `SalesOrderItem` using Prisma Client. |
| `src/lib/petpooja/sync.ts` | Orchestrates the end-to-end pipeline (`Client -> Normalizer -> Resolver -> IngestionService`) for any given date. |
| `src/lib/petpooja/validator.ts` | Validates raw Petpooja webhook payloads against required structure. |
| `src/lib/petpooja/logger.ts` | Provides safe structured logging with automatic PII sanitization. |
| `src/app/api/webhooks/petpooja/route.ts` | HTTP endpoint receiving push notifications from Petpooja POS. |
| `scripts/test-petpooja-pull.ts` | Standalone CLI script for dry-run live API pulls without database writes. |

### 5.2 Unit Test Suites
The repository contains 5 comprehensive test suites covering all stages of the Petpooja ingestion engine:
- `tests/petpooja-get-orders-client.test.ts` (API mock client, error codes, cursor loop protection)
- `tests/petpooja-normalizer.test.ts` (PII redaction, discount calculation, timezone conversion)
- `tests/petpooja-resolver.test.ts` (Outlet resolution, product code matching, fallback to `null`)
- `tests/petpooja-ingestion.test.ts` (Database transaction upserts, idempotency, updates)
- `tests/petpooja-sync.test.ts` (Full orchestrator simulation over multiple pages)

---

## 6. Database Architecture

### 6.1 Prisma Models (`prisma/schema.prisma`)

```prisma
model SalesOrder {
  id              String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId        String             @map("outlet_id") @db.Uuid
  petpoojaOrderId String             @map("petpooja_order_id")
  orderDate       DateTime           @map("order_date") @db.Date
  orderedAt       DateTime           @map("ordered_at") @db.Timestamptz
  orderType       String             @map("order_type")
  status          String             @default("Success")
  totalAmount     Decimal            @map("total_amount") @db.Decimal(12, 2)
  coreTotal       Decimal            @map("core_total") @db.Decimal(12, 2)
  taxTotal        Decimal            @default(0.00) @map("tax_total") @db.Decimal(12, 2)
  discountTotal   Decimal            @default(0.00) @map("discount_total") @db.Decimal(12, 2)
  financialStatus OrderFinancialStatus @default(COMPLETED) @map("financial_status")
  matchingStatus  OrderMatchingStatus  @default(UNMATCHED) @map("matching_status")
  createdAt       DateTime           @default(now()) @map("created_at") @db.Timestamptz

  outlet Outlet           @relation(fields: [outletId], references: [id], onDelete: Restrict)
  items  SalesOrderItem[]

  @@unique([outletId, petpoojaOrderId])
  @@index([outletId, orderDate])
  @@index([orderDate])
  @@map("sales_orders")
}

model SalesOrderItem {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  salesOrderId    String   @map("sales_order_id") @db.Uuid
  productId       String?  @map("product_id") @db.Uuid
  externalItemId  String   @map("external_item_id")
  itemName        String   @map("item_name")
  quantity        Decimal  @db.Decimal(10, 3)
  unitPrice       Decimal  @map("unit_price") @db.Decimal(12, 2)
  totalPrice      Decimal  @map("total_price") @db.Decimal(12, 2)
  taxAmount       Decimal  @default(0.00) @map("tax_amount") @db.Decimal(12, 2)
  discountAmount  Decimal  @default(0.00) @map("discount_amount") @db.Decimal(12, 2)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  salesOrder SalesOrder @relation(fields: [salesOrderId], references: [id], onDelete: Cascade)
  product    Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([salesOrderId])
  @@index([productId])
  @@index([externalItemId])
  @@map("sales_order_items")
}
```

### 6.2 Key Architectural Strengths
1. **Idempotent Reconciliation:**  
   `@@unique([outletId, petpoojaOrderId])` prevents duplicate orders. Ingestion uses an upsert query.
2. **Cascading Child Updates:**  
   `salesOrderId onDelete: Cascade` allows line items to be replaced cleanly if Petpooja reports post-billing modifications.
3. **Resilient Unmapped Item Ingestion:**  
   `productId` is **nullable** with `onDelete: SetNull`. If an item exists on POS but is not yet in Master Data, the order still ingests successfully with `productId = null` while preserving the exact POS item name, price, quantity, and sales total.
4. **Tenant Isolation:**  
   Every order is tied to an `outletId`, which belongs to an `organizationId`. Cross-tenant queries are blocked.

---

## 7. Petpooja API Specification Details

Based on live payloads (`docs/petpooja-data.md`) and client source code:

- **Endpoint:** `https://api.petpooja.com/V1/thirdparty/generic_get_orders/`
- **Method:** `POST`
- **Headers:**  
  - `Content-Type: application/json`
  - `Cookie: <Cloudflare/WAF session cookie>`
- **Request Body Payload:**
  ```json
  {
    "app_key": "<PETPOOJA_APP_KEY>",
    "app_secret": "<PETPOOJA_APP_SECRET>",
    "access_token": "<PETPOOJA_ACCESS_TOKEN>",
    "restID": "<PETPOOJA_REST_ID>",
    "order_date": "YYYY-MM-DD",
    "refId": ""
  }
  ```
- **Pagination Mechanism (`refId`):**
  - First page request passes `"refId": ""`.
  - If a page contains 1,000 orders (the API threshold), continuation is required.
  - The cursor for the next page is the `Order.refId` of the **last record** in `order_json`.
  - When a page returns `< 1000` records, all orders for that date have been retrieved.
- **Known Limitations & Edge Cases:**
  - `Order.total` can occasionally differ from `core_total + tax_total - discount_total` due to custom round-offs (`Order.round_off`) or delivery charges.
  - The API does not return Customer PII for aggregator orders (Swiggy/Zomato), and the client normalizer proactively wipes any direct customer PII.
  - Requires valid Cloudflare session cookie when calling the production endpoint from non-whitelisted IPs.

---

## 8. Current Status & Pending Items

### 8.1 Completed & Verified
- [x] Petpooja Get Orders API Client (`get-orders-client.ts`) with timeout and loop safeguards.
- [x] PII-scrubbing response normalizer (`normalizer.ts`).
- [x] Multi-tier product and outlet resolver (`resolver.ts`).
- [x] Transactional database ingestion service (`ingestion-service.ts`).
- [x] Full sync orchestrator (`sync.ts`).
- [x] Offline payload analysis from production outlet `9780nusx` (`docs/petpooja-data.md`).
- [x] Unit test suites for all 5 integration stages.
- [x] Production database initialization and admin account bootstrap on VPS.

### 8.2 Pending Implementation
- [ ] **Assign `petpoojaRestId = '9780nusx'` to Local Outlet `KOZ-001`**: Currently `null` in `gulmohar_dev`.
- [ ] **Automated Background Scheduler**: Implement a scheduled runner (e.g., node-cron or systemd timer) to run daily at 01:00 AM IST for date `T-1`.
- [ ] **Deploy Pending Schema Migrations to VPS**: Apply migrations `20261121021129` and `20261121024835` to the VPS database.
- [ ] **First Live Pull Execution**: Run a controlled live test pull into local PostgreSQL and verify analytics dashboard calculation against real orders.

---

## 9. Recommended Implementation Roadmap

1. **Step 1: Set Local Outlet Mapping**  
   Update local outlet `KOZ-001` with `petpoojaRestId = "9780nusx"` so the resolver can map incoming orders.
2. **Step 2: Run a Single-Date Test Ingestion Locally**  
   Execute `sync.syncDate("2026-03-16")` using the saved fixture or API pull, confirming that records populate `sales_orders` and `sales_order_items`.
3. **Step 3: Verify Dashboard Metric Loaders**  
   Switch `DATA_SOURCE=database` and confirm that Sales Analytics, Top Selling Items, and Revenue charts correctly compute totals from `sales_orders`.
4. **Step 4: Configure Automated Daily Synchronization Job**  
   Create an internal API route (e.g. `POST /api/cron/petpooja-sync`) protected by a bearer secret, or a Node/worker script to trigger daily.
5. **Step 5: Deploy to Hostinger VPS**  
   Merge `dev` to `main`, pull on VPS, apply `prisma migrate deploy`, and configure environment variables in `compose.prod.yaml`.

---

## 10. Developer Troubleshooting Reference

| Issue | Symptoms | Where to Look | Resolution Steps |
|---|---|---|---|
| **API Auth Failures** | Error code `401` or `Invalid Token` | `src/lib/petpooja/get-orders-client.ts` | Verify `PETPOOJA_APP_KEY`, `PETPOOJA_APP_SECRET`, `PETPOOJA_ACCESS_TOKEN`, and `PETPOOJA_API_COOKIE` in `.env`. |
| **Missing Orders** | Sync reports success but orders are missing | `src/lib/petpooja/get-orders-client.ts` | Check if orders exceeded 1,000 and pagination stopped prematurely. Check `pagesFetched` in sync stats. |
| **Pagination Loop** | Error: `Repeated cursor detected` | `src/lib/petpooja/get-orders-client.ts` | Petpooja returned identical `refId`. Client automatically aborts to prevent infinite loops. |
| **Unmapped Products** | Orders ingest but `productId` is null | `src/lib/petpooja/resolver.ts` | Normal behavior. Create a Menu Product in Master Data with matching `productCode` or map POS Item ID in `OutletProductSetting`. |
| **Outlet Not Found** | Error: `Unresolvable outlet for restID` | `src/lib/petpooja/resolver.ts` | The incoming `restID` does not match any `petpoojaRestId` in the `outlets` table. Update the outlet via Admin Master Data. |
| **Duplicate Orders** | No duplicates created, but stats report `updated` | `src/lib/petpooja/ingestion-service.ts` | Expected behavior. `SalesOrder` uses composite unique `[outletId, petpoojaOrderId]` for safe idempotent upserts. |
| **Local vs VPS Drift** | Local works, VPS crashes on DB query | `prisma/migrations` | Check `npx prisma migrate status` on VPS. Ensure all migrations up to `20261121024835` are applied. |

