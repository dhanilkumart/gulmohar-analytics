# Petpooja Integration — Technical Reference

**Prepared:** 27 November 2026  
**Source basis:** Petpooja API structure (23 November), synchronization report, ingestion readiness audit and integration reports supplied in this conversation.

> This document consolidates reported implementation details. Vendor API contracts, credentials and live production behavior must be re-verified before operational changes.

## 1. Current integration model

The active design is a **pull-based integration** using Petpooja's Generic Get Orders API.

```text
Petpooja POS
  → Get Orders API client
  → Response normalizer / validator
  → Outlet and product resolver
  → Transactional ingestion service
  → PostgreSQL via Prisma
  → Application data loaders and analytics
  → Dashboard / reports
```

The application dashboard must not call Petpooja directly. PostgreSQL stores the normalized historical sales data used by application reporting.

### Retired approach

An earlier push webhook and Supabase staging approach was explored during integration discovery. The later technical reference explicitly says the webhook endpoint and Supabase dependency were removed. Treat webhook/Supabase instructions in older reports as historical only.

## 2. Generic Get Orders API

The supplied API reference records:

| Setting | Reported specification |
|---|---|
| Endpoint | `https://api.petpooja.com/V1/thirdparty/generic_get_orders/` |
| Override | `PETPOOJA_GET_ORDERS_ENDPOINT` |
| Method | `POST` |
| Content type | `application/json` |
| Authentication body fields | `app_key`, `app_secret`, `access_token` |
| Cookie header | `Cookie: <PETPOOJA_API_COOKIE>` |
| Restaurant identifier | `restID` |
| Business date | `order_date`, `YYYY-MM-DD` |
| Pagination cursor | `refId` |
| Page size | Up to 1,000 records per request |
| Audited client timeout | 15 seconds at the API client layer; worker page deadline is separately configurable |

The exact vendor endpoint, cookie requirement and authentication contract must be confirmed against current Petpooja-issued documentation and the active client implementation.

### Request shape

```json
{
  "app_key": "<from PETPOOJA_APP_KEY>",
  "app_secret": "<from PETPOOJA_APP_SECRET>",
  "access_token": "<from PETPOOJA_ACCESS_TOKEN>",
  "restID": "<from PETPOOJA_REST_ID>",
  "order_date": "YYYY-MM-DD",
  "refId": ""
}
```

Never put actual credential values in this document or in source control.

### Pagination

- First request uses an empty `refId`.
- Subsequent requests use the cursor/reference from the last order in the preceding page.
- Continue until all pages have been retrieved.
- Detect repeated cursors and enforce a safety cap.
- A successful first page is not proof that the requested date is complete.
- Record page count, returned order count, ingested/updated/failed counts and API errors.

The worker report describes a 50-page safety cap and a 1,000-record page contract. Recheck current code before changing either.

## 3. Pipeline modules

The supplied reports identify these source files:

| Source file | Responsibility |
|---|---|
| `src/lib/petpooja/get-orders-client.ts` | API requests, authentication, pagination, timeout and HTTP/API errors |
| `src/lib/petpooja/normalizer.ts` | Normalize vendor response, decimals, timestamps and remove customer PII |
| `src/lib/petpooja/validator.ts` | Validate normalized data and report issues |
| `src/lib/petpooja/resolver.ts` | Resolve Petpooja outlet and item references |
| `src/lib/petpooja/ingestion-service.ts` | Transactional order upsert and item replacement |
| `src/lib/petpooja/sync.ts` | Orchestrate fetch → normalize → resolve → ingest |
| `scripts/petpooja-daily-sync.ts` | Standalone daily worker entry point |

## 4. Normalization and privacy

The normalizer is reported to:
- Convert string or numeric financial fields to exact `Prisma.Decimal` values.
- Parse timestamps with Asia/Kolkata (+05:30) semantics and preserve the correct UTC instant.
- Preserve operational business date separately from timestamp.
- Retain missing financial figures as `null`; do not invent zero.
- Remove customer-identifying information before normalized records/logging.
- Track validation issues explicitly.

Customer name, phone, address and other customer payload fields are not required for sales analytics and must not be copied into logs or documentation.

## 5. Outlet resolution

Petpooja's `Restaurant.restID` is an external identifier. It must be resolved to the internal `Outlet` record through the configured mapping (`petpooja_rest_id` / Prisma `petpoojaRestId`).

The reports identify `9780nusx` as the configured Petpooja ID for `KOZ-001` in later November 2026 audits. An earlier report recorded the mapping as null, so verify the active environment before use.

A separate test ID `53qcgrdis8` was identified as belonging to `Petpooja_Rider_Testing`, not Gulmohar. It must not be assigned to a production outlet.

Unknown restaurant IDs should fail safely as an unmapped outlet; they must not be ingested into an arbitrary outlet.

## 6. Product resolution

The audited resolver uses a two-tier mapping strategy:

1. Outlet override: match `OutletProductSetting.petpoojaItemId` for the resolved outlet.
2. Organization product master: match Petpooja item code to `Product.productCode` within the outlet's organization.
3. If neither matches, preserve the POS item with `productId = null`.

An unmapped item must not block an otherwise valid order. Preserve item name, quantity, unit price, tax, discount and line total. Product mapping can be improved separately without losing historical POS sales.

## 7. Database model and idempotency

The supplied schema/readiness reports describe:

### `SalesOrder` / `sales_orders`
- Outlet foreign key.
- `petpoojaOrderId`.
- `orderDate` as PostgreSQL `DATE`.
- `orderedAt` as timestamp with time zone.
- Order type and POS status.
- Nullable `coreTotal`, `taxTotal`, `discountTotal`, `totalAmount`.
- Internal `financialStatus` and `matchingStatus`.
- Unique constraint: `(outletId, petpoojaOrderId)`.

### `SalesOrderItem` / `sales_order_items`
- Parent `salesOrderId`.
- Nullable `productId`.
- POS `itemName`.
- Quantity, unit price, line total.
- Nullable item tax and discount.
- Parent deletion cascades; product deletion sets the product reference to null.

### Transaction strategy

For each order:
1. Upsert the order header using `(outletId, petpoojaOrderId)`.
2. Replace existing child line items inside the same transaction.
3. Commit the order atomically.

This prevents duplicate orders and duplicate child items on reruns. Preserve this idempotent behavior in future ingestion changes.

## 8. Order status and revenue treatment

The supplied sales synchronization report describes:

| POS status | Treatment |
|---|---|
| `Success` | Included in successful sales and revenue |
| `Complimentary` | Tracked separately; not automatically treated as revenue |
| `Cancelled` | Tracked separately and excluded from recognized sales revenue |
| Unknown status | Handle explicitly; do not silently count as successful |

Do not conflate POS order status with internal financial or matching/reconciliation statuses.

## 9. Financial fields

The technical reference maps:

| Petpooja field | Database field |
|---|---|
| `orderID` | `SalesOrder.petpoojaOrderId` |
| `order_date` | `SalesOrder.orderDate` |
| `created_on` | `SalesOrder.orderedAt` |
| `order_type` | `SalesOrder.orderType` |
| `status` | `SalesOrder.status` |
| `core_total` | `SalesOrder.coreTotal` |
| `tax_total` | `SalesOrder.taxTotal` |
| `discount_total` | `SalesOrder.discountTotal` |
| `total` | `SalesOrder.totalAmount` |
| `Restaurant.restID` | Used to resolve `Outlet` |
| `OrderItem.name` | `SalesOrderItem.itemName` |
| `OrderItem.quantity` | `SalesOrderItem.quantity` |
| `OrderItem.price` | `SalesOrderItem.unitPrice` |
| `OrderItem.total` | `SalesOrderItem.totalAmount` |
| `OrderItem.total_tax` | `SalesOrderItem.itemTax` |
| `OrderItem.total_discount` | `SalesOrderItem.itemDiscount` |
| `OrderItem.itemid` | Used for product resolution |

The 23 November audit observed the relationship:

`totalAmount = coreTotal - discountTotal + taxTotal + roundOff`

Treat this as an observed relationship in that audited dataset, not an unqualified guarantee for every vendor response. Preserve nullable values and test the current business rules before changing dashboard calculations.

## 10. Operational dates and IST

Distinguish:
- API requested date.
- POS timestamp (`created_on`).
- Normalized operational date (`order_date`).
- UI display date.

Restaurant operational day may cross midnight. Analytics date grouping should use the established operational-date field and consistent Asia/Kolkata boundaries. The historical backfill reported an early-morning rollover to 31 October and an unresolved count discrepancy; see the reconciliation audit.

## 11. Reported verification snapshots

The supplied documents record several different snapshots:
- 18 November read-only API test: HTTP 200 and 507 orders for operational date `2026-11-17`; this did not write to production DB.
- 23 November local DB audit: 564 orders and 1,904 line items for 19–20 November; the report described all 1,904 lines as unmapped at that snapshot.
- 1–22 November local backfill report: 5,985 total orders across Success, Complimentary and Cancelled statuses, with ₹40,67,382 reported successful sales revenue.
- Later 26 November register: sales reader and summary each returned 6,112 successful orders for 31 October–22 November, matching an independent outlet-scoped count.

These figures describe different dates, scopes and snapshots. Do not compare them as if they were the same dataset.

## 12. Known limitations and deferred fields

The API/data audit identified fields not persisted in the audited sales schema, including:
- Payment method / multi-tender breakdown.
- Cancellation description.
- Aggregator/channel fields.
- Table number and covers.
- Category mapping.

These require an explicit schema/reporting task before they can be used as reliable analytics dimensions.

## 13. Production readiness boundary

The source reports state that API client, normalizer, resolver, ingestion service and orchestrator were implemented and unit-tested. They also explicitly distinguish successful read-only API access from successful production database ingestion.

Do not mark production sales ingestion complete until a controlled, approved production run has verified:
1. Credentials and outlet mapping.
2. API result completeness.
3. Database order and line-item counts.
4. Financial totals and statuses.
5. Outlet association.
6. Dashboard/report values in database mode.

See [worker operations](../operations/petpooja-worker-operations.md) for execution and activation safety.
