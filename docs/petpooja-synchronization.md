# Petpooja Synchronization & Historical Data Backfill

## 1. Overview

Gulmohar Analytics integrates with Petpooja POS to retrieve restaurant order data and store it in its own PostgreSQL database.

Petpooja is the source of sales and order information. Gulmohar Analytics retrieves, normalizes, validates, and persists this information using Prisma.

The dashboard and analytics modules read data exclusively from Gulmohar's PostgreSQL database. They should not make direct Petpooja API requests when users open dashboard pages.

### Architecture

```text
Petpooja POS API
       |
       v
Petpooja API Client
       |
       v
Order Normalizer
       |
       v
Order Resolver
       |
       v
Ingestion Service
       |
       v
Prisma ORM
       |
       v
Gulmohar PostgreSQL
       |
       v
Dashboard & Analytics
```

## 2. Synchronization Method

The current integration uses a pull-based synchronization approach.

Gulmohar initiates requests to the Petpooja API and retrieves order information for the requested operational date.

The synchronization process consists of:

1. Fetching orders from Petpooja.
2. Handling API pagination.
3. Normalizing the API response into the application's internal data structure.
4. Resolving outlet and product references where possible.
5. Validating the normalized records.
6. Creating or updating orders through Prisma.
7. Persisting order items in PostgreSQL.

### Synchronization Automation Status

The standalone daily worker and host systemd templates are implemented. Production installation and timer activation require separate approval and verification. See [worker operations](petpooja-worker.md) for configuration, deployment, history and recovery.

## 3. Synchronization Command

The historical synchronization process supports date-range input.

### Historical date-range synchronization

```bash
npm run petpooja:sync -- --from=2026-11-01 --to=2026-11-22
```

This requests order data for the specified inclusive date range. Historical requests now require an explicitly sufficient `SYNC_MAX_BACKFILL_DAYS` (default 7); see worker operations before repeating older backfills.

### Synchronizing a specific date

```bash
npm run petpooja:sync -- --date=2026-11-20
```

The CLI also accepts a positional single date. All manual runs use the same PostgreSQL lock and durable history as scheduled runs.

### Default synchronization

When no date arguments are supplied, the existing default synchronization behaviour is preserved.

The manual command defaults to yesterday in Asia/Kolkata. The daily worker (`node --import tsx scripts/petpooja-daily-sync.ts --daily`) processes yesterday, then today, followed by bounded recovery work.

**Important:** The actual CLI argument implementation should be treated as the source of truth. Update these examples if the command syntax changes.

## 4. Historical Backfill — November 2026

A historical backfill was executed against the local development environment.

### Backfill scope

| Property | Value |
|---|---|
| Source | Petpooja POS API |
| Destination | Local PostgreSQL |
| Start date | 2026-11-01 |
| End date | 2026-11-22 |
| Synchronization type | Historical pull |
| Ingestion method | Existing Prisma ingestion service |
| Environment | Local development |

### Reported results

| Order status | Orders |
|---|---:|
| Success | 5,847 |
| Complimentary | 115 |
| Cancelled | 23 |
| **Total** | **5,985** |

**Reported successful sales revenue:** ₹40,67,382.

Revenue is based on orders classified as `Success`, following the existing Sales Analytics business rules.

### Ingestion behaviour

The existing ingestion service was reused rather than creating a separate historical import mechanism.

The backfill reported:

- Zero ingestion failures.
- Existing November 19 and November 20 records updated rather than duplicated.
- Existing records preserved through the ingestion process.

The historical backfill did not require a new Prisma schema or database migration.

**Note:** These are the results reported by the backfill execution. Re-run the corresponding database aggregation queries when performing future reconciliations.

## 5. Pagination

Petpooja order retrieval supports paginated responses.

The integration must process all pages returned for each requested date.

The pagination process uses the last record's `RefID` as the reference for retrieving the next page.

The API page limit is 1,000 records per request.

A successful first-page response does not necessarily mean all orders for that date have been retrieved.

Every synchronization run should account for:

- Number of pages retrieved.
- Total orders returned.
- Orders successfully ingested.
- Orders updated.
- Failed records.
- API errors.

## 6. Idempotency and Duplicate Prevention

Historical synchronization may overlap with previously imported dates.

For example, November 19 and November 20 had already been ingested before the November 1–22 backfill.

The existing ingestion service was reused to handle these records.

Reported behaviour:

- Previously existing orders were updated.
- New orders were inserted.
- Duplicate orders were not created.

The Petpooja order identity and existing database uniqueness rules should remain the basis for duplicate prevention.

Future synchronization implementations must preserve this behaviour.

## 7. Operational Date and IST Handling

Petpooja order dates must be interpreted using the restaurant's operational-date rules.

The restaurant's business day does not necessarily match a calendar day.

For example, an order placed shortly after midnight may belong to the previous operational business date when the restaurant is still completing the previous day's service.

The integration therefore needs to distinguish:

- API requested date.
- Petpooja order timestamp.
- Normalized operational date.
- Application display date.

All dashboard date filtering must consistently use the established operational-date field and IST boundaries.

### Historical rollover consideration

During the November backfill, some early-morning orders requested under November 1 were assigned to October 31 according to the existing operational-date logic.

The backfill report also contained a discrepancy between the reported October 31 rollover count and the Last Month dashboard count.

These figures require reconciliation before treating the October rollover totals as fully verified.

## 8. Database and Dashboard Responsibilities

The architecture separates external data retrieval from business reporting.

### Petpooja integration responsibilities

- Retrieve orders.
- Handle pagination.
- Normalize external fields.
- Resolve available product references.
- Persist order and item information.

### PostgreSQL responsibilities

- Store normalized sales orders.
- Store sales order items.
- Maintain outlet and organization relationships.
- Provide data for analytics and reporting.

### Dashboard responsibilities

The Executive Dashboard and Sales Analytics must retrieve their data from the local application database.

They must not fetch Petpooja data directly during page rendering.

This ensures consistent reporting, avoids repeated external API calls, and allows analytics to use historical data already stored in PostgreSQL.

## 9. Order Status and Revenue Treatment

The current Sales Analytics implementation distinguishes the following Petpooja order statuses:

| Status | Dashboard treatment |
|---|---|
| Success | Included in successful sales and revenue |
| Complimentary | Counted separately as operational activity |
| Cancelled | Counted separately and excluded from sales revenue |
| Failed | No separately verified status in the current ingested dataset |

Complimentary orders must not automatically be treated as revenue-generating orders.

Cancelled orders must not contribute to recognized sales revenue.

Unknown statuses should be handled explicitly rather than automatically classified as successful.

## 10. Current Limitations

The following items remain outside the completed historical backfill:

1. Production scheduler activation and a live scheduled execution remain unverified.
2. The October 31 operational-date rollover discrepancy needs reconciliation.
3. Worker monitoring and bounded recovery are described in [worker operations](petpooja-worker.md); external alert delivery is not configured.
4. Historical completeness depends on the dates and records actually returned by Petpooja.
5. Menu and category integration remains a separate development task.

## 11. Daily Synchronization

The host timer invokes an isolated Docker worker at 23:00 Asia/Kolkata. It requests yesterday first and today second, reusing `syncDate()`, cursor pagination, normalization and transactional ingestion. Missing/unfinished requests are retried within configured limits. Scheduling never depends on dashboard rendering, Orders preview or a browser session.

The worker does not delete orders absent from later API responses. It rejects partial ingestion as success. Existing outlet/order uniqueness and atomic item replacement remain unchanged. Actual source modification timestamps have not been verified; `created_on` is a creation timestamp and cannot provide stale-response protection. See [worker operations](petpooja-worker.md) for remaining reliability limits.

## 12. Development Reference

Relevant implementation files:

| File | Responsibility |
|---|---|
| `src/lib/petpooja/get-orders-client.ts` | Petpooja API requests |
| `src/lib/petpooja/normalizer.ts` | API response normalization |
| `src/lib/petpooja/resolver.ts` | Outlet and product resolution |
| `src/lib/petpooja/ingestion-service.ts` | Database ingestion |
| `src/lib/petpooja/sync.ts` | Synchronization orchestration |
| `src/lib/petpooja/validator.ts` | Data validation |
| `src/lib/analytics/sales.ts` | Sales analytics queries |

## 13. Important Architecture Rule

All future sales, reporting, and dashboard features must follow this data flow:

**Petpooja API → Gulmohar Integration → PostgreSQL → Application Business Logic → UI**

Do not introduce direct Petpooja API dependencies into dashboard components or analytics queries.

PostgreSQL is the application's source of truth for normalized historical sales data.

---

**Documentation status:** Historical backfill completed for November 1–22, 2026 in the local development environment. Daily-worker implementation is available; production activation and operational-date reconciliation remain pending.
