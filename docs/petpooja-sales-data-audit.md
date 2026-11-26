# Petpooja Sales Data — End-to-End Data Flow & Reconciliation Audit

Audit date: **26 November 2026, Asia/Kolkata**. Environment: **local gulmohar_dev only**.

Evidence labels:
- **Verified database:** actual read-only local SQL results.
- **Verified code/runtime:** inspected current working tree and executed actual server analytics.
- **Archived API evidence:** saved response fragments/metadata, not a fresh vendor call.
- **Pending:** needs full responses, execution logs, authenticated browser testing or vendor confirmation.

No application/schema/configuration changes, environment-variable changes, sync/ingestion jobs, migrations, logins, database writes, production actions, commits or pushes were performed. This report is the only file authored by this audit. Existing working-tree changes were preserved. Mock fixtures were not used as evidence of actual sales.

## 1. Executive Summary

All four supplied screenshot figures are reproducible from current local data and server analytics for **October 28–November 26, 2026 inclusive**:

| Metric | Screenshot | Read-only reproduction | Actual definition |
| --- | --- | --- | --- |
| Total Sales | ₹42,67,785 | ₹42,67,785.00 | Sum of Success order total_amount |
| Total Orders | 6,259 | 6,259 | 6,112 Success + 121 Complimentary + 26 Cancelled |
| Average Order Value | ₹698 | ₹698.2632526 → ₹698 | Sales / 6,112 Success orders |
| Items Sold | 32,975 | 32,975 | Sum of Success item quantities |

**No demonstrated duplication or multiplication error explains these four figures:** the screenshot matches stored data. This does not establish that invoice totals equal the client's intended definition of sales, or that the source extract is complete.

Key findings:

1. **Financial-definition conflict.** The documented business rule says net sales = gross minus discount; the reader instead prefers Petpooja Order.total. Success core minus discount is **₹40,99,103.44**, while displayed final sales are **₹42,67,785.00**: difference **₹1,68,681.56**. Header tax accounts for ₹1,65,761.22; a further ₹2,920.34 residual cannot be fully allocated because charges/rounding are not persisted.
2. **Mixed status bases.** Total Orders includes 147 non-Success orders. Sales, AOV denominator and items exclude them. AOV is correct for its actual denominator, but not sales divided by the displayed order count.
3. **Local data stops November 22.** November 23–26 zero points reflect missing local records, not demonstrated zero POS sales. Saved November 23 fragments contain three specific invoices absent locally.
4. **Request date and returned business date differ.** Each saved target-date sample contains both target and previous-day orders. Comparing a response count directly to a single business-day DB count is unsafe.
5. **Limited audit trail.** No durable sync ledger or full recent extract was found; exact latest successful sync requested bounds/pages cannot be reconstructed solely from created_at.
6. **Mapping loss.** All 22,042 lines are unmatched to products. Payment method, raw item IDs, refId, rounding and charge components are not persisted.

For **November 1–22**, independently reproduced Success final sales are **₹40,67,382**. The screenshot exceeds that by exactly **October 31 sales ₹2,00,403**. October 31 legitimately falls inside Last 30 Days on November 26. This period difference must not be mislabeled a dashboard date-filter bug. The client's comparable POS total and accounting definition remain necessary to establish the complaint's exact cause.

## 2. Petpooja API Integration Architecture

~~~text
Manual CLI scripts/petpooja-sync.ts
 -> PetpoojaSyncOrchestrator.syncDate / syncDateRange
 -> PetpoojaGetOrdersClient.fetchAllOrders -> fetchPage (POST)
 -> normalizePetpoojaBatch -> normalizePetpoojaOrder / normalizeOrderItem
 -> PetpoojaResolver (active outlet and product matching)
 -> PetpoojaIngestionService.ingestBatch -> ingestOrder
 -> transaction: keyed header upsert + child replacement
 -> sales_orders / sales_order_items
 -> server data readers -> analytics -> SalesPage -> cards/charts
~~~

| Source | Function / responsibility |
| --- | --- |
| [scripts/petpooja-sync.ts](../scripts/petpooja-sync.ts) | main: --date or --from/--to, otherwise yesterday; sequential daily calls; package.json petpooja:sync invokes tsx. |
| [src/lib/petpooja/get-orders-client.ts](../src/lib/petpooja/get-orders-client.ts) | DEFAULT_GET_ORDERS_ENDPOINT:62; buildRequestBody:130; fetchPage:150; fetchAllOrders:241. |
| [src/lib/petpooja/sync.ts](../src/lib/petpooja/sync.ts) | syncDate fetches, normalizes, ingests and returns statistics; syncDateRange enumerates dates inclusively. |
| [src/lib/petpooja/normalizer.ts](../src/lib/petpooja/normalizer.ts) | parseDecimalValue:30; parseOperationalDate:146; parseAsiaKolkataTimestamp:217; normalizeOrderItem:310; normalizePetpoojaOrder; normalizePetpoojaBatch. |
| [src/lib/petpooja/resolver.ts](../src/lib/petpooja/resolver.ts) | resolveOutlet:85 maps restID to active Outlet; product matches outlet petpoojaItemId then organization productCode. |
| [src/lib/petpooja/ingestion-service.ts](../src/lib/petpooja/ingestion-service.ts) | ingestOrder / ingestBatch; transactional upsert and line replacement; preserve unmatched productId=null. |
| [scripts/test-petpooja-pull.ts](../scripts/test-petpooja-pull.ts) | Single-page inspection only; saves metadata, first 3 and last order (309–321); not executed. |
| [src/app/dashboard/sales/page.tsx](../src/app/dashboard/sales/page.tsx) | getSalesPageData / SalesPage call server analytics directly, not a dedicated sales JSON endpoint. |

The only outbound sales endpoint found is **POST https://api.petpooja.com/V1/thirdparty/generic_get_orders/**, configurable by PETPOOJA_GET_ORDERS_ENDPOINT. JSON credentials are app_key, app_secret, access_token, restID; headers include configured Cookie, Content-Type and Accept. No credential values were copied.

OrderItem, Tax and Discount arrays and payment fields are embedded in each returned envelope. No separate product/item/detail/payment/tax/discount retrieval method was found.

Legacy documentation cites /api/webhooks/petpooja and petpooja_webhook_events, but this route/table is absent from current source/local schema. The legacy sanitizing logger is not a durable sync journal. References to scheduled/live-webhook ingestion in older docs must not be treated as active implementation.

**Pagination:** start refId=""; <1,000 records ends the loop; a full page advances with last Order.refId; missing/repeated cursors and >50 pages throw. Default request timeout 15 seconds. Errors are not silently converted into empty pages. This follows the documented protocol, but historical multi-page completeness is unverified without full responses/logs. All saved inspection response counts are below 1,000; inspection scripts make one request only. Client arrays do not deduplicate, but ingestion upserts repeated outlet/order keys.

**Initial/subsequent sync:** explicit-date and range backfills use the same ingestion mechanism. Default CLI fetches yesterday, not “since last successful sync.” No implemented checkpoint, scheduler or automatic catch-up was found in this repository. External cron/production scheduling was not inspected.

## 3. Actual Fetch and Sync Date Coverage

[docs/petpooja-synchronization.md](petpooja-synchronization.md), section 4, reports a local **November 1–22** historical pull: 5,985 records, 5,847 Success, ₹40,67,382 Success final sales. SQL independently reproduces these figures for that business-date interval.

However, that is **reported execution history**, not a primary per-request log. No persisted sync-run table, page ledger, complete recent raw extract or sync log file was found. created_at records inserts, not later updates; SalesOrder has no updated_at. Consequently **the exact first and last requested dates of the latest successful ingestion run remain unverified**. Do not infer them from command examples or database coverage.

The following are directly evidenced **inspection requests**, not proof of ingestion:
| Requested order_date | Saved executed_at UTC | HTTP / API success | Reported response count | Retained returned dates |
| --- | --- | --- | --- | --- |
| 2026-10-31 | 2026-11-23T05:06:38.133Z | 200 / 1 | 488 | 2026-10-31, 2026-10-30 |
| 2026-11-01 | 2026-11-23T05:06:10.104Z | 200 / 1 | 620 | 2026-11-01, 2026-10-31 |
| 2026-11-17 | 2026-11-23T05:20:03.916Z | 200 / 1 | 507 | 2026-11-17, 2026-11-16 |
| 2026-11-19 | 2026-11-23T05:18:55.316Z | 200 / 1 | 498 | 2026-11-19, 2026-11-18 |
| 2026-11-20 | 2026-11-23T05:19:49.127Z | 200 / 1 | 564 | 2026-11-20, 2026-11-19 |
| 2026-11-21 | 2026-11-23T05:21:57.318Z | 200 / 1 | 643 | 2026-11-21, 2026-11-20 |
| 2026-11-22 | 2026-11-23T05:06:22.636Z | 200 / 1 | 746 | 2026-11-22, 2026-11-21 |
| 2026-11-23 | 2026-11-23T05:22:16.850Z | 200 / 1 | 425 | 2026-11-23, 2026-11-22 |

These ignored tmp/ files retain four orders each, not full responses. Their metadata counts must not be summed as distinct orders. Latest retained inspection: target November 23 at **05:22:16.850Z / 10:52:16.850 IST**, 425 returned envelopes with November 22/23 examples. It does not establish 425 orders on November 23.

**Date rules and limits**

- CLI --from/--to and syncDateRange include both endpoints; each calendar date gets its own paginated request sequence. No weekly/monthly request batch exists.
- Vendor date inclusivity, business cutoff and exact returned-date selection: **Not verified – requires Petpooja API documentation/vendor confirmation**. Preceding-day inclusion is observed; its complete selection rule is not established.
- No application maximum historical-day range; 50-page cap applies per requested date. Vendor historical retention is unverified.
- No missing stored date inside October 31–November 22. This cannot prove every expected source invoice/date/page was fetched.
- Stored order_date comes from **returned Order.order_date**, not the request date, invoice date alias, ordered_at or created_at. Normalization does not discard dates outside the requested range.
- Order.created_on is parsed as explicit +05:30 and stored as ordered_at TIMESTAMPTZ; display hours convert back to IST. **Zero** stored business-date versus ordered_at IST-date mismatches were found.
- Last 30 Days uses UTC today minus 29 through today. Reference November 26 at 12:00 IST resolves **October 28–November 26**. Between 00:00 and 05:29 IST, UTC today is still the prior day: a code-level boundary risk, not a demonstrated cause here.
- CLI getYesterdayDateString combines local setDate(-1) and UTC toISOString; it is not explicitly IST business-day arithmetic. Last-run invocation time is unknown.
- Earliest insertion: November 21 15:02:30.616Z (20:32:30.616 IST). Latest insertion: November 23 05:32:37.480Z (11:02:37.480 IST). Neither proves latest synchronization time.

| Insert date UTC | Orders first inserted | Business-date coverage | UTC timestamp bounds |
| --- | --- | --- | --- |
| 2026-11-21 | 564 | 2026-11-19–2026-11-20 | 2026-11-21T15:02:30.616+00:00 to 2026-11-21T15:02:43.877+00:00 |
| 2026-11-23 | 5695 | 2026-10-31–2026-11-22 | 2026-11-23T05:25:35.374+00:00 to 2026-11-23T05:32:37.48+00:00 |

## 4. PostgreSQL Tables and Current Data Coverage

### Connection and schema

Verified connection via **docker exec gulmohar-postgres psql -U gulmohar_app -d gulmohar_dev**: current_database=gulmohar_dev, current_user=gulmohar_app. SQL ran inside **BEGIN READ ONLY / COMMIT**; transaction_read_only=on. Actual columns/indexes were read from information_schema.columns / pg_indexes.

For application-function reproduction, .env DATABASE_URL was parsed without changing process environment variables, verified localhost/gulmohar_dev, and passed to a separate Prisma client in a read-only transaction.

Configured outlet: **KOZ-001 / 4c78ce87-79cf-4f0d-817e-23e728db9bf8**, active=true, Petpooja ID **9780nusx**. Organization **cb986d43-5ac7-4731-b293-b21b66ff05a2 / AG / Ashirvad Gulmohar Restaurant**. All stored sales belong to this outlet; other local outlets have zero orders. Thus full-database and configured-outlet totals coincide in this snapshot.

| Actual table / Prisma model | Purpose and primary key | Relationships / external references | Dates | Amounts / quantities / other fields |
| --- | --- | --- | --- | --- |
| sales_orders / SalesOrder | Current invoice headers; id UUID PK | outlet_id -> outlets.id; unique(outlet_id,petpooja_order_id); external ID=Order.orderID | order_date DATE; ordered_at and created_at TIMESTAMPTZ | Nullable core_total,tax_total,discount_total,total_amount DECIMAL(12,2); order_type,status,financial_status,matching_status |
| sales_order_items / SalesOrderItem | Current invoice lines; id UUID PK | sales_order_id -> sales_orders.id (cascade); nullable product_id -> products.id (set null); raw itemid/itemcode not stored | None; date via parent | quantity DECIMAL(10,3); unit_price,total_amount,item_tax,item_discount DECIMAL(10,2); item_name |
| outlets / Outlet | Identity/routing; id UUID PK | organization_id -> organizations; unique code and nullable petpooja_rest_id | created_at,updated_at | is_active,name,city,address,timezone; no invoice amounts |
| organizations / Organization | Organization identity; id UUID PK | Owns outlets/menu/users; unique code | created_at,updated_at | name/code; no sales quantities |
| products / Product; categories / Category | Menu/category masters; id UUID PK | organization/category FKs; unique organization/product code; items may reference Product | Product created_at,updated_at; Category created_at | Product default_selling_price, nullable food_cost, unit,is_active,preparation_type; category display metadata |
| outlet_product_settings / OutletProductSetting | Outlet mapping/price metadata; id UUID PK | outlet_id and product_id FKs; unique pair; petpooja_item_id for external item mapping | None in current model | price_override nullable,is_available; no invoice quantities |

No current raw-response, payment, tax/discount-component or sync-history table exists locally.

### Full stored coverage, before dashboard filtering

- **6,259 orders**, order_date **2026-10-31 to 2026-11-22**.
- ordered_at **2026-10-31T01:57:49Z to 2026-11-22T17:14:48Z**.
- created_at **2026-11-21T15:02:30.616Z to 2026-11-23T05:32:37.480Z**.
- **6,112 Success; 26 Cancelled; 121 Complimentary; zero other statuses.** There is no separate Completed status.
- No null core, discount, tax or final totals; no blank statuses.
- **22,042 item rows; 33,777.5 total quantity; 6,259 distinct orders with items**; associated dates October 31–November 22.
- **0 distinct non-null product IDs**, **482 distinct item names**, **22,042 unmatched rows**. Names are not verified distinct external product identifiers.
- **0 duplicate outlet/order keys; 0 orders without items; 0 orphan item rows.**
- Every header has financial_status=reconciled and matching_status=unmatched. “reconciled” is a hardcoded ingestion label, not evidence of independent financial verification.

| Status | Orders | Item rows | Quantity | Core ₹ | Discount ₹ | Header tax ₹ | Final ₹ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cancelled | 26 | 111 | 174 | 23,074.00 | 525.99 | 893.40 | 23,592.00 |
| Complimentary | 121 | 424 | 628.5 | 46,629.00 | 0.00 | 2,331.96 | 48,962.00 |
| Success | 6,112 | 21,507 | 32,975 | 41,83,844.00 | 84,740.56 | 1,65,761.22 | 42,67,785.00 |

### Complete available daily coverage

Item rows/all quantity include every status. “Other” means Complimentary. “Stored sales” means **Success final total**, matching current dashboard revenue; all-status final is shown separately to prevent status ambiguity.

| Business date | Total orders | Success | Cancelled | Other | Item rows | All quantity | Success quantity | Stored sales ₹ | All-status final ₹ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31 | 274 | 265 | 3 | 6 | 1013 | 1,564.5 | 1,507 | 2,00,403.00 | 2,05,682.00 |
| 2026-11-01 | 346 | 342 | 0 | 4 | 1305 | 1,874 | 1,859.5 | 2,51,318.00 | 2,52,947.00 |
| 2026-11-02 | 198 | 192 | 0 | 6 | 605 | 964.5 | 919 | 1,11,587.00 | 1,14,699.00 |
| 2026-11-03 | 211 | 207 | 1 | 3 | 690 | 1,057 | 1,038.5 | 1,33,854.00 | 1,34,530.00 |
| 2026-11-04 | 219 | 218 | 0 | 1 | 635 | 1,003 | 997 | 1,17,223.00 | 1,17,354.00 |
| 2026-11-05 | 213 | 206 | 3 | 4 | 659 | 1,001.5 | 983 | 1,24,256.00 | 1,26,477.00 |
| 2026-11-06 | 239 | 235 | 0 | 4 | 810 | 1,195 | 1,165 | 1,55,031.00 | 1,56,554.00 |
| 2026-11-07 | 270 | 263 | 1 | 6 | 991 | 1,552 | 1,536.5 | 1,91,895.00 | 1,93,080.00 |
| 2026-11-08 | 413 | 406 | 2 | 5 | 1729 | 2,583.5 | 2,559 | 3,50,629.00 | 3,52,800.00 |
| 2026-11-09 | 243 | 238 | 0 | 5 | 801 | 1,165 | 1,103.5 | 1,41,421.00 | 1,45,331.00 |
| 2026-11-10 | 205 | 200 | 1 | 4 | 680 | 1,056 | 993 | 1,22,459.00 | 1,26,678.00 |
| 2026-11-11 | 240 | 234 | 0 | 6 | 828 | 1,259 | 1,241 | 1,56,457.00 | 1,57,619.00 |
| 2026-11-12 | 213 | 208 | 0 | 5 | 730 | 1,148 | 1,128.5 | 1,52,403.00 | 1,53,533.00 |
| 2026-11-13 | 255 | 251 | 0 | 4 | 776 | 1,164.5 | 1,152 | 1,49,734.00 | 1,50,296.00 |
| 2026-11-14 | 320 | 315 | 1 | 4 | 1227 | 1,827.5 | 1,810 | 2,41,176.00 | 2,43,337.00 |
| 2026-11-15 | 352 | 345 | 2 | 5 | 1381 | 2,209.5 | 2,170 | 2,66,225.00 | 2,70,015.00 |
| 2026-11-16 | 233 | 228 | 0 | 5 | 676 | 968.5 | 941.5 | 1,29,108.00 | 1,31,148.00 |
| 2026-11-17 | 274 | 263 | 2 | 9 | 905 | 1,398 | 1,347 | 1,82,777.00 | 1,88,159.00 |
| 2026-11-18 | 231 | 223 | 1 | 7 | 764 | 1,157.5 | 1,126.5 | 1,50,646.00 | 1,53,415.00 |
| 2026-11-19 | 267 | 260 | 0 | 7 | 867 | 1,377.5 | 1,334 | 1,65,016.00 | 1,69,260.00 |
| 2026-11-20 | 297 | 287 | 2 | 8 | 1037 | 1,688 | 1,642 | 2,03,387.00 | 2,07,521.00 |
| 2026-11-21 | 346 | 336 | 2 | 8 | 1324 | 2,099 | 2,065 | 2,56,934.00 | 2,60,439.00 |
| 2026-11-22 | 400 | 390 | 5 | 5 | 1609 | 2,464.5 | 2,356.5 | 3,13,846.00 | 3,29,465.00 |

No dates are skipped within this 23-day stored interval. Last 30 Days additionally includes zero-record October 28–30 and November 23–26.

### Minimal redacted database samples

Customer names, phones, addresses, tax registrations, notes and credentials are excluded.

| External order | Business date | Status / type | Core ₹ | Discount ₹ | Tax ₹ | Final ₹ | Item rows / quantity | Inserted UTC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 53691 | 2026-10-31 | Success / Dine In | 90.00 | 0.00 | 4.50 | 95.00 | 1 / 2 | 2026-11-23T05:25:45.905+00:00 |
| 53692 | 2026-10-31 | Success / Delivery | 470.00 | 82.00 | 0.00 | 388.00 | 3 / 3 | 2026-11-23T05:25:45.888+00:00 |
| 53693 | 2026-10-31 | Success / Delivery | 405.00 | 69.00 | 0.00 | 336.00 | 3 / 3 | 2026-11-23T05:25:45.872+00:00 |
| 53694 | 2026-10-31 | Success / Delivery | 499.00 | 79.00 | 0.00 | 420.00 | 3 / 4 | 2026-11-23T05:25:45.855+00:00 |

## 5. Petpooja-to-Database Field Mapping

The normalizer parses financial values into Prisma.Decimal without recalculating invoice totals. Optional missing/invalid fields become null with issues; invalid required line fields reject the order. String decimal syntax is validated; numeric inputs are converted through their string representation.

| Actual Petpooja field | Prisma field / actual column | Transformation / meaning |
| --- | --- | --- |
| Restaurant.restID | Outlet.petpoojaRestId / outlets.petpooja_rest_id -> SalesOrder.outletId / outlet_id | Trim; exact active-outlet match; organization from outlet, independent of application central config |
| Order.orderID | SalesOrder.petpoojaOrderId / petpooja_order_id | Trim/string conversion; unique key with outlet UUID; not the refId cursor |
| Order.order_date | SalesOrder.orderDate / order_date | Validate real YYYY-MM-DD; midnight UTC Date for PostgreSQL DATE |
| Order.created_on | SalesOrder.orderedAt / ordered_at | Validate timestamp; explicit +05:30 -> UTC instant |
| No API source | SalesOrder.createdAt / created_at | Database insert default; not updated by upsert |
| Order.order_type | SalesOrder.orderType / order_type | Verbatim trimmed string, default Unknown; current values Dine In, Delivery, Pick Up |
| Order.status | SalesOrder.status / status | Verbatim trimmed string; default Success if absent/blank; no Completed alias translation |
| Order.core_total | SalesOrder.coreTotal / core_total | Direct nullable Decimal; equals summed current item totals for every stored order; no app GST/discount addition |
| Order.discount_total | SalesOrder.discountTotal / discount_total | Direct nullable Decimal; not deducted again from provided final total |
| Order.tax_total | SalesOrder.taxTotal / tax_total | Direct nullable Decimal; no GST recalculation; component definitions are not retained |
| Order.total | SalesOrder.totalAmount / total_amount | Direct nullable Decimal; no explicit recomputation/rounding or quantity multiplication |
| OrderItem[].itemid / itemcode | Used to resolve SalesOrderItem.productId / product_id | Match outlet setting then organization product code; preserve null on no match; raw external identifiers discarded |
| OrderItem[].name | SalesOrderItem.itemName / item_name | Trim; required; matched product name can be used for display |
| OrderItem[].quantity | SalesOrderItem.quantity / quantity | Required direct Decimal, fractional quantity retained to 3 places |
| OrderItem[].price | SalesOrderItem.unitPrice / unit_price | Required direct Decimal unit price; tax-exclusive base in retained examples; universal vendor definition pending |
| OrderItem[].total | SalesOrderItem.totalAmount / total_amount | Required direct Decimal line amount; every current row equals quantity×unit_price; readers do not multiply again |
| OrderItem[].total_tax | SalesOrderItem.itemTax / item_tax | Optional direct Decimal; detailed tax_ids/item_tax_info omitted |
| OrderItem[].total_discount | SalesOrderItem.itemDiscount / item_discount | Optional direct Decimal; current line revenue readers do not subtract it from line total |
| Order.round_off / service_charge / delivery_charges / container_charges | Normalized, not persisted | No columns; cannot allocate final-minus-base residual fully from DB |
| Order.payment_type / custom_payment_type | Normalized, not persisted | Reader hardcodes payment_method=Other |
| Order.refId | Pagination/normalization only | Not stored as provenance or uniqueness key |
| Order.sub_order_type / order_from / table_no / no_of_persons | Normalized, not persisted | Omitted from header storage |
| Tax[], Discount[], part_payment[], addon[], tip, waivedOff, detailed combo/tax fields; customer_invoice_id if present | Not persisted by current pull ingestion | No independent component/payment/invoice-number reconciliation possible; customer PII deliberately excluded |

**Observed amount semantics:** raw order 53691: core=90, discount=0, tax=4.50, round_off=0.50, final=95. Order 53692: core=470, discount=82, tax=0, final=388. Retained previous-day order 53481: core=95, tax=5.50, container charge=15, round_off=0.50, final=116. These demonstrate that final can include tax, rounding and charges; they do not prove every vendor convention/channel.

- PostgreSQL amount columns constrain to 2 decimals; quantities to 3. No explicit application rounding is applied during normalization. Readers convert Decimal to JS Number, and inr displays whole rupees by default. Observed floating noise is sub-paisa, not a cause of lakh-scale differences.
- Success core **₹41,83,844** minus discount **₹84,740.56** = **₹40,99,103.44**.
- Success final **₹42,67,785** minus (core - discount + tax) = **₹2,920.34**. Across all statuses **3,571 invoices** have a nonzero residual; omitted rounding/charges are plausible components, but full attribution is unverified.
- Success summed item tax **₹1,65,670.94** versus header tax **₹1,65,761.22**: **₹90.28** difference requiring source-component reconciliation. The dashboard does not add either tax sum to final again.
- Summed Success line total **₹41,83,844** equals parent core. Header final exceeds this by **₹83,941**, not by duplicated quantities.
- Items become separate child rows. Re-sync transactionally replaces children and updates the header for the same outlet/order key. Removed lines disappear only if that updated full invoice is fetched; no explicit deleted-item/invoice tombstone handling exists.
- Cancelled invoices/remaining lines are retained but excluded from Success sales/item readers. Complimentary invoices may have positive totals (e.g. C1287=84); they are still excluded. There is no forced-zero treatment.
- The unique index prevents duplicate stored outlet/order keys. It does not prove external orderID values never reset across business dates/years. Upsert can overwrite the same key, and created_at does not record update time.

## 6. Postman Manual Verification Requests

No Postman/vendor request was executed in this audit. Use existing merchant credentials privately, never in the shared report.

### Request A — orders and embedded items/details/taxes/discounts/payment fields

- Method: **POST**.
- URL: **https://api.petpooja.com/V1/thirdparty/generic_get_orders/**.
- Query parameters: **none implemented**.
- Headers: Content-Type: application/json; Accept: application/json; Cookie: {{petpooja_api_cookie}}.
- Authentication: credentials in JSON plus Cookie; no separate Basic/Bearer mechanism is implemented.
- Body:

~~~json
{
  "app_key": "{{petpooja_app_key}}",
  "app_secret": "{{petpooja_app_secret}}",
  "access_token": "{{petpooja_access_token}}",
  "restID": "{{petpooja_rest_id}}",
  "order_date": "{{order_date}}",
  "refId": ""
}
~~~

The configured merchant is 9780nusx. Make **three separate requests** for order_date **2026-11-20, 2026-11-21, 2026-11-22**. Inspect returned Order.order_date as well as the requested value. Deduplicate the union by Restaurant.restID and Order.orderID before grouping by business date. Do not sum overlapping response totals.

Retain full responses privately with request timestamp/date/cursor/count, and redact credentials/customers/notes in shared evidence. The existing inspection script saves only first-three/last fragments.

### Request B — next page when the preceding response contains 1,000 orders

Same method/URL/headers/credentials and order_date; replace refId with the **last returned Order.refId**. Follow the implemented <1,000 termination rule, retain every page, and confirm vendor cursor semantics if an actual full page occurs. Do not use orderID as the cursor.

Expected structure only (not a real invoice):

~~~json
{
  "code": "200",
  "success": "1",
  "message": "<vendor message>",
  "order_json": [
    {
      "Restaurant": { "restID": "<merchant>" },
      "Customer": { "<fields>": "<redact before sharing>" },
      "Order": {
        "orderID": "<external invoice id>",
        "refId": "<cursor>",
        "order_date": "<YYYY-MM-DD>",
        "created_on": "<YYYY-MM-DD HH:MM:SS>",
        "status": "<status>",
        "order_type": "<type>",
        "core_total": "<decimal>",
        "discount_total": "<decimal>",
        "tax_total": "<decimal>",
        "total": "<decimal>",
        "round_off": "<decimal>",
        "payment_type": "<method>"
      },
      "Tax": [],
      "Discount": [],
      "OrderItem": [
        {
          "itemid": "<external item id>",
          "itemcode": "<external item code>",
          "name": "<item>",
          "quantity": "<decimal>",
          "price": "<decimal>",
          "total": "<decimal>",
          "total_tax": "<decimal>",
          "total_discount": "<decimal>"
        }
      ]
    }
  ]
}
~~~

Compare header ID/date/status/type/core/discount/tax/final/created_on, child names/quantities/prices/totals/taxes/discounts and restaurant mapping. Keep rounding/charges/payment/refId in the independent extract because the database cannot recover them.

### Individual invoice / separate endpoints

**Not verified – requires Petpooja API documentation/vendor confirmation:** lookup by orderID/refId; separate order-detail, item/product-catalog, payment/settlement, tax or discount endpoints. None exists in the active client. Until confirmed, fetch the supported daily request and locate the desired order inside order_json; do not invent an orderID request parameter.

For the known missing November 23 invoices, inspect **59851, 59852, 59853** in a complete response.

## 7. Dashboard Metrics and Calculation Logic

SalesPage is a **Server Component**. There is no implemented /api/dashboard/sales JSON API. Flow: parseGlobalRangeParams -> resolveDateRange; getDashboardSalesScope -> getRestaurantContext; getSalesPageData -> readers/analytics -> chart/card props.

The configured outlet UUID and organization are passed through current and comparison calls. URL outletId is not used to select the normal sales outlet. Parent filters use **order_date**, not created_at; child queries apply date/status/outlet/organization through salesOrder.

Sources: [data/sales.ts](../src/lib/data/sales.ts), [data/sale-items.ts](../src/lib/data/sale-items.ts), [analytics/sales.ts](../src/lib/analytics/sales.ts), [SalesPage](../src/app/dashboard/sales/page.tsx), [dashboard-sales-scope.ts](../src/lib/auth/dashboard-sales-scope.ts), [restaurant-context.ts](../src/lib/context/restaurant-context.ts), [date-range.ts](../src/lib/analytics/date-range.ts), [format.ts](../src/lib/format.ts).

| Metric | Source / function | Exact calculation/filter |
| --- | --- | --- |
| Total Sales | sales_orders.total_amount; getSales -> getSalesSummary | Success only; sum supplied final. Per-order fallback core-discount only when final null. Any unknown reader net makes summary null. All current finals known. |
| Total Orders | getOrderHealth | All statuses; count(*) with same date/outlet/org. This card does not use getSalesSummary.orderCount. |
| Average Order Value | SalesPage aov | Success final sales / Success count, whole-rupee display. |
| Items Sold | sales_order_items.quantity; getSaleItemsInRange | Sum quantities of Success parents, including unmatched products. |
| Discount | getTotalDiscount; header discount_total | Success only; sum. Unknown discount causes null summary. Not deducted again from final. |
| Tax (GST label) | getTotalTax; header tax_total | Success only; sum available amounts; all-null returns null. Detailed tax type not validated/persisted; partial missing taxes would be summed. |
| Daily revenue | getSalesTrend | Sum reader net_amount by business date; zero-fill all days; 30-day range uses daily buckets. |
| Main Orders trend | getOrdersTrend | Success only; unlike all-status Total Orders card/mini chart. |
| Hourly sales | getHourlySales | Success reader net grouped by ordered_at hour formatted Asia/Kolkata; 24 zero-filled hours after order_date range filter. |
| Sales by Order Type | getSalesByOrderType | Success reader net grouped by verbatim order_type. |
| Payment methods | getSalesByPaymentMethod | Reader payment_method is always Other; actual payment split unavailable. |
| Product/top-item revenue | getItemSalesRanking | Sum Success child total_amount by display name; no extra multiplication; includes unmatched items. |
| Category/profitability | getProductProfitability | Only matched product item revenue; every local line unmatched, so complete attribution unavailable. |
| Daily KPI mini charts | getDailySalesKpiTrends | Parent order_date/status groups; Success total_amount for sales/AOV; all statuses for orders; Success child quantity for items. No core-discount fallback for missing final. |

Cancelled and Complimentary orders are excluded from revenue and eligible quantities; exact Success is the only included status. Duplicate-key counts are zero; schema uniqueness/upsert protect those keys. Header totals and child quantities are not multiplied through a joined aggregation.

The readers query Prisma directly without a persistent sales-result cache. Request-scoped context reuse is not a financial-data cache. Browser/router cache state was not tested, but fresh backend computations reproduce the screenshot. All current/previous page functions receive the same range and scope per period.

### Executed consistency checks

These are real function executions against local PostgreSQL inside a read-only Prisma transaction, using reference **2026-11-26T12:00:00+05:30**, not mock fixtures.

| Check | Measured result | Difference / reason |
| --- | --- | --- |
| Total Sales vs daily revenue sum | 4,267,785 = 4,267,785 | 0 |
| Total Sales vs hourly sales sum | 4,267,785 = 4,267,785 | 0 |
| Total Sales vs order-type sum | 4,267,785 = 4,267,785 | 0 |
| Total Sales vs sales mini-chart sum | 4,267,785 = 4,267,785 | 0 for current non-null data; fallback behavior differs in code |
| AOV vs sales / Success orders | 698.2632526 = 4,267,785 / 6,112 | 0 |
| AOV vs sales / displayed Total Orders | 698.2632526 vs 681.8637162 | 16.3995364 per order; different denominator |
| Items card / eligible quantity / item rankings / mini items | 32,975 in each | 0 |
| Orders card vs orders mini-chart sum | 6,259 = 6,259 | 0 |
| Orders card vs main successful Orders trend | 6,259 vs 6,112 | 147 non-Success orders |
| Header Sales vs item revenue sum | 4,267,785 vs 4,183,844 | 83,941; tax-discount+residual amount basis |
| All-status quantity vs Items Sold | 33,777.5 vs 32,975 | 802.5 excluded non-Success units |
| Order type | Success orders | Sales ₹ |
| --- | --- | --- |
| Dine In | 4398 | 34,45,587.00 |
| Delivery | 1662 | 7,78,127.00 |
| Pick Up | 52 | 44,071.00 |

## 8. Petpooja vs Database vs Dashboard Reconciliation

**A:** full latest-period API extract pending Postman; fragments cannot establish period totals.
**B:** verified DB totals within October 28–November 26; populated dates are October 31–November 22.
**C:** actual dashboard **server-function reproduction**, not authenticated HTTP/visual UI verification. No dedicated sales API exists; the four supplied screenshot figures match the reproduction.

| Metric | Petpooja full latest-period extract | PostgreSQL | Dashboard backend | Difference C−B |
| --- | --- | --- | --- | --- |
| Orders, all statuses | Pending Postman | 6,259 | 6,259 | 0 |
| Successful Orders | Pending Postman | 6,112 | 6,112 AOV denominator | 0 |
| Cancelled Orders | Pending Postman | 26 | 26 order health | 0 |
| Complimentary Orders | Pending Postman | 121 | 121 order health | 0 |
| Eligible item rows | Pending Postman | 21,507 | Not a card count | Not displayed |
| Items Sold (Success quantity) | Pending Postman | 32,975 | 32,975 | 0 |
| All-status item quantity | Pending Postman | 33,777.5 | Not Items Sold basis | 802.5 excluded units |
| Gross/core sales, Success | Pending Postman | ₹41,83,844.00 | ₹41,83,844.00 backend grossSales | 0 |
| Discounts, Success | Pending Postman | ₹84,740.56 | ₹84,740.56; display ₹84,741 | 0 before rounding |
| Tax, Success | Pending Postman | ₹1,65,761.22 | ₹1,65,761.22; display ₹1,65,761 | 0 before rounding |
| Core minus discount, Success | Pending Postman | ₹40,99,103.44 | Not current Total Sales basis | Final exceeds by ₹1,68,681.56 |
| Net/final sales as currently labeled | Pending Postman | ₹42,67,785.00 | ₹42,67,785.00 | 0 |
| AOV / successful order | Pending Postman | ₹698.2632526 derived | ₹698 displayed | Rounding only |

### Raw sample invoice reconciliation

32 retained distinct invoices across 8 fragments were inspected. **28 exist locally with identical business date, status, core, discount, tax and final total.** Four do not: October 30 order **53481**, and November 23 orders **59851, 59852, 59853**.

- Example 53691: raw October 31 07:27:49 IST -> stored ordered_at 01:57:49Z, correct offset. Core 90, tax 4.50, final 95 match. Raw round_off=0.50 cannot be recovered from a stored component column.
- C1287: raw/stored November 22 Complimentary final=84; excluded from revenue.
- Missing November 23 examples total **₹1,333**, quantity **18** (130/1 + 662/9 + 541/8). This is a lower bound from samples, not the full day's total.
- Header spot comparisons are not a complete line-by-line or period reconciliation. A fragment's absence of an invoice is not evidence that the API lacks it.

### Daily reconciliation / zero chart dates

Every stored date's backend daily revenue equals the section 4 Success final-sales column. The additional dashboard zero points are:

| Business date | Local orders | Backend sales ₹ | Source evidence / interpretation |
| --- | --- | --- | --- |
| 2026-10-28 | 0 | 0.00 | No comparable raw response inspected; actual POS sales unknown |
| 2026-10-29 | 0 | 0.00 | No comparable raw response inspected; actual POS sales unknown |
| 2026-10-30 | 0 | 0.00 | Source example 53481 absent; outside documented backfill |
| 2026-11-23 | 0 | 0.00 | Three source examples absent locally; full-day amount unknown |
| 2026-11-24 | 0 | 0.00 | No comparable raw response inspected; actual POS sales unknown |
| 2026-11-25 | 0 | 0.00 | No comparable raw response inspected; actual POS sales unknown |
| 2026-11-26 | 0 | 0.00 | No comparable raw response inspected; actual POS sales unknown |

No date with eligible local sales was erroneously zeroed by the executed backend aggregation. November 23–26 lack local records, rather than being lost through created_at filtering. November 24–26 true source sales remain unverified.

Do not compare response count 746 for request November 22 against DB business-date count 400 as if 346 orders were lost: the retained response includes November 21 too. Full returned-date grouping and deduplication are required. No “DB-only but absent in Petpooja” invoice can be established from truncated response fragments.

### Separate archived full response

[docs/petpooja-data.md](petpooja-data.md) contains 391 envelopes: **March 15:219; March 16:172, 2026**. It is not a November extract, and its request-date/run provenance is not established in the file. Its own totals are shown separately, never substituted for pending November source totals:

| Status | Orders | Item rows | Quantity | Core ₹ | Discount ₹ | Tax ₹ | Final ₹ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Complimentary | 11 | 35 | 52.5 | 3,359.50 | 0.00 | 166.50 | 3,527.00 |
| Success | 380 | 1228 | 1893 | 1,94,544.00 | 5,168.01 | 7,190.22 | 1,96,593.00 |

## 9. Confirmed Issues

These findings do not authorize correction:

1. **Net-sales definition conflict:** getSales prefers invoice total over documented core-minus-discount. The current difference is ₹1,68,681.56. The aggregation itself matches its selected field; whether the client's comparison uses ex-tax sales remains pending.
2. **Different order-count denominators:** Total Orders includes all statuses while AOV and main Orders chart use Success. This is explicit behavior, but creates misleading direct KPI comparisons unless explained.
3. **Missing recent local data:** after November 22 there are no rows. Saved November 23 invoices prove at least some source data is missing locally. Zero-filled charts do not distinguish missing synchronization from no sales.
4. **Adjacent-day source results:** retained request D includes D-1. Date-range imports can therefore store rows outside their requested first date. The extra October 31 business date accounts exactly for the difference from the documented November-only aggregate.
5. **Lost reconciliation fields:** refId, raw item IDs/codes, charge/rounding/payment details and tax/discount components are not persisted. Payment grouping becomes entirely Other, despite raw Cash/Card/Other samples.
6. **Complete product-mapping gap:** all 22,042 lines unmatched; item sales still count, but product/category/profitability attribution is incomplete.
7. **Unsubstantiated financial-status label:** all invoices are assigned reconciled by ingestion without comparing an authoritative POS/settlement total.
8. **No durable sync provenance:** latest requested bounds/pages, empty dates, retries, failures and update timestamps cannot be recovered from insert timestamps.
9. **Documentation drift:** older response-schema docs cite a removed webhook and older inspection date; current saved metadata says November 23. Current code/artifacts take precedence over historical prose.

## 10. Suspected Issues Requiring Raw API Verification

| Potential issue | Evidence / finding | Conclusion |
| --- | --- | --- |
| Wrong fetch dates / skipped dates | Documented Nov 1–22 totals reproduced; no run/page ledger; adjacent-day source windows observed | Latest executed request bounds incomplete; no skipped stored date inside Oct 31–Nov 22 |
| Timezone/date parsing | 0 order_date vs IST ordered_at-date mismatches; explicit +05:30 parser; UTC preset/CLI boundary risks | No current inflation from timestamp conversion demonstrated |
| Pagination incomplete | Cursor/threshold/error guards exist; all saved request counts <1000; no full historical log | Multi-page completeness unverified |
| Historical limit | No app day-range limit; 50 pages per date; vendor retention unknown | Vendor confirmation required |
| Duplicate orders / upsert | 0 duplicate outlet/order keys; keyed upsert and atomic line replacement | No current duplicate-key inflation; ID reuse history unknown |
| Cancelled orders included in sales | Success-only revenue/item readers; all statuses in Total Orders | No revenue inclusion found; mixed status basis confirmed |
| Wrong status mapping | Verbatim trim; missing status defaults Success; no Completed alias; no current blank/other status | Source default incidence/unknown vendor statuses unverified |
| Wrong total/GST counted twice | Order.total copied once; no dashboard GST addition; ex-tax net definition differs | Definition conflict confirmed; vendor intended basis pending |
| Discounts deducted twice | Provided final used directly; no second deduction; line revenue uses pre-discount core | No double deduction found; amount bases differ |
| Quantity/price multiplication | 0 line total vs quantity×unit_price mismatches; quantities summed once | No current multiplication inflation found |
| Joined header totals duplicated | Readers sum headers separately from children; independent SQL aggregates separate tables | No demonstrated join inflation |
| Wrong createdAt filter / inconsistent card-chart dates | Same scope/range, order_date filters; live daily/hour/type sums match | Not found in current backend |
| Stale/cache results | Fresh server functions reproduce screenshot; no persistent reader cache | Browser/router cache untested; DB coverage is demonstrably stale |
| Outlet/org scope leakage | Configured UUID/org filters present; only one outlet has sales | No local leakage evidence; no foreign-outlet sales to challenge live reads |
| Missing child records | 0 orders without items, 0 orphans; atomic replacement | No whole-invoice item omission; exact raw line fidelity pending |
| Rounding/charges/tax allocation | Success residual ₹2,920.34; header vs item tax difference ₹90.28 | Measured differences; exact component explanation pending |
| Deleted/changed invoices stale | Fetched updates replace lines; no automatic catch-up/tombstone ledger | Possible stale state, no specific stale deleted invoice proven |
| Client compares other period/channel/definition | Oct 31 adds ₹2,00,403; final vs core-discount differs ₹1,68,681.56 | Need client POS export and aligned definitions |

## 11. Missing Information / Questions for Petpooja

1. What does request order_date select: calendar day, previous/current window, operational close cutoff, creation time or update time? What timezone and inclusivity apply?
2. How should one retrieve complete, nonoverlapping business dates including late edits/cancellations?
3. Confirm 1,000-page limit, refId ordering/direction/inclusivity, concurrent-update behavior and final-page contract; what is the maximum retained history?
4. Is orderID unique forever per restaurant, or does it reset across dates/years? Is refId the stable invoice identity?
5. Define core_total, price, item.total, total_discount, tax_total, total, round_off, service/delivery/container charges, waivedOff and tip. Which are GST-inclusive/exclusive, and which correspond to POS net sales versus collections?
6. Why do summed item taxes differ from header taxes? How are packaging/charge tax, discount allocation and rounding represented?
7. Why can Complimentary carry a positive total? Which statuses belong in revenue, operational count and settlement totals?
8. Are separate invoice-detail, catalog, payment/settlement, void/refund/credit-note endpoints available? Supply real method/URL/auth/request contracts before inventing Postman calls.
9. What does payment_type=Other represent? How should part_payment/custom_payment_type be reconciled to actual collections?
10. Obtain the client's authoritative merchant 9780nusx report for **October 28–November 26** and separately **November 1–22**, with daily status, ex-tax sales, discounts, GST, charges, rounding, billed amount and receipts.
11. Recover actual sync stdout/logs from any external location. Local insert times cannot reveal failed/empty requests or subsequent updates.
12. Obtain full recent redacted source pages. The first-three/last fragments cannot establish complete period sums or line fidelity.

## 12. Recommended Next Steps

1. Agree the client's exact sales definition, dates, outlet, channel and eligible statuses. Compare billed invoice totals, ex-tax net revenue and collections separately before proposing changes.
2. Have the user retrieve full Postman responses using section 6 and preserve request date/cursor/time/count metadata privately. Do not ingest yet.
3. Deduplicate source invoices, group by returned business date, then reconcile invoice/line/daily totals. Include October 31 boundary and missing November 23 examples.
4. Recover sync execution history if available. Treat November 23–26 as unsynchronized/unknown, not certified zero-sales days.
5. Scope future persistence/provenance, payment, product-mapping, labels or scheduling changes separately after reconciliation.
6. No corrective action was taken; any sync/backfill or data/code fix needs its own authorized scope.

### SQL used for read-only verification

Connection/schema check:

~~~sql
BEGIN READ ONLY;
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(),
       current_setting('transaction_read_only');
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
COMMIT;
~~~

Each SELECT below was executed through the named local container/user/database inside this wrapper (the JSON wrapper only formats query output):

~~~sql
BEGIN READ ONLY;
SELECT coalesce(json_agg(t), '[]'::json) FROM (<SELECT below>) t;
COMMIT;
~~~

Whole-database totals equal KOZ-001 totals in this snapshot because every sales row belongs to it. For scoped independent SQL reproduction add outlet_id='4c78ce87-79cf-4f0d-817e-23e728db9bf8' and verify outlets.organization_id='cb986d43-5ac7-4731-b293-b21b66ff05a2'. Executed application analytics received both filters.

#### overview

~~~sql
SELECT count(*) orders,min(order_date) first_date,max(order_date) last_date,min(created_at) first_created_utc,max(created_at) last_created_utc,min(ordered_at) first_ordered_utc,max(ordered_at) last_ordered_utc,count(DISTINCT outlet_id) outlets,count(*) FILTER(WHERE total_amount IS NULL) null_total,count(*) FILTER(WHERE core_total IS NULL) null_core,count(*) FILTER(WHERE discount_total IS NULL) null_discount FROM sales_orders;
~~~

#### status

~~~sql
SELECT status,count(*) orders,sum(core_total) core,sum(discount_total) discount,sum(tax_total) tax,sum(total_amount) final FROM sales_orders GROUP BY status ORDER BY status;
~~~

#### items

~~~sql
SELECT count(*) item_records,min(o.order_date) first_date,max(o.order_date) last_date,sum(i.quantity) quantity,count(DISTINCT i.product_id) mapped_products,count(DISTINCT i.item_name) item_names,count(DISTINCT i.sales_order_id) orders_with_items,count(*) FILTER(WHERE i.product_id IS NULL) unmapped_rows,sum(i.total_amount) item_total,sum(i.item_tax) item_tax,sum(i.item_discount) item_discount FROM sales_order_items i JOIN sales_orders o ON o.id=i.sales_order_id;
~~~

#### daily

~~~sql
WITH a AS (SELECT order_date,count(*) orders,count(*) FILTER(WHERE status='Success') success,count(*) FILTER(WHERE status='Cancelled') cancelled,count(*) FILTER(WHERE status NOT IN ('Success','Cancelled')) other,sum(total_amount) all_final,sum(total_amount) FILTER(WHERE status='Success') success_final,sum(core_total) FILTER(WHERE status='Success') success_core,sum(tax_total) FILTER(WHERE status='Success') success_tax,sum(discount_total) FILTER(WHERE status='Success') success_discount FROM sales_orders GROUP BY order_date), b AS(SELECT o.order_date,count(*) item_records,sum(i.quantity) quantity,sum(i.quantity) FILTER(WHERE o.status='Success') success_quantity,sum(i.total_amount) FILTER(WHERE o.status='Success') success_item_total FROM sales_order_items i JOIN sales_orders o ON o.id=i.sales_order_id GROUP BY o.order_date) SELECT a.*,b.item_records,b.quantity,b.success_quantity,b.success_item_total FROM a LEFT JOIN b USING(order_date) ORDER BY order_date;
~~~

#### bycreated

~~~sql
SELECT created_at::date utc_created_date,count(*) orders,min(created_at) first_created,max(created_at) last_created,min(order_date) first_business_date,max(order_date) last_business_date FROM sales_orders GROUP BY created_at::date ORDER BY utc_created_date;
~~~

#### checks

~~~sql
SELECT (SELECT count(*) FROM (SELECT outlet_id,petpooja_order_id FROM sales_orders GROUP BY 1,2 HAVING count(*)>1) d) duplicate_keys,(SELECT count(*) FROM sales_orders o WHERE NOT EXISTS (SELECT 1 FROM sales_order_items i WHERE i.sales_order_id=o.id)) orders_without_items,(SELECT count(*) FROM sales_order_items i LEFT JOIN sales_orders o ON o.id=i.sales_order_id WHERE o.id IS NULL) orphan_items,(SELECT count(*) FROM sales_orders WHERE order_date <> (ordered_at AT TIME ZONE 'Asia/Kolkata')::date) business_vs_created_ist_mismatch,(SELECT count(*) FROM sales_order_items WHERE total_amount <> quantity*unit_price) item_multiplication_mismatch,(SELECT count(*) FROM sales_orders WHERE total_amount <> core_total-discount_total+tax_total) header_equation_mismatch;
~~~

#### headerResiduals

~~~sql
SELECT status,count(*) orders,sum(total_amount-core_total+discount_total-tax_total) residual,min(total_amount-core_total+discount_total-tax_total) min_residual,max(total_amount-core_total+discount_total-tax_total) max_residual FROM sales_orders GROUP BY status ORDER BY status;
~~~

#### headerVsItem

~~~sql
WITH a AS(SELECT o.id,o.status,o.core_total,o.total_amount,o.tax_total,o.discount_total,coalesce(sum(i.total_amount),0) item_total,sum(i.item_tax) item_tax,sum(i.item_discount) item_discount FROM sales_orders o LEFT JOIN sales_order_items i ON i.sales_order_id=o.id GROUP BY o.id) SELECT status,count(*) orders,sum(item_total) item_total,sum(core_total) core,sum(total_amount) final,sum(item_tax) item_tax,sum(item_discount) item_discount,sum(item_total-core_total) item_core_difference,count(*) FILTER(WHERE item_total<>core_total) differing_orders FROM a GROUP BY status ORDER BY status;
~~~

#### samples

~~~sql
SELECT o.petpooja_order_id,o.order_date,o.ordered_at,o.created_at,o.status,o.order_type,o.core_total,o.discount_total,o.tax_total,o.total_amount,o.financial_status,o.matching_status,count(i.id) item_rows,sum(i.quantity) quantity,sum(i.total_amount) item_total FROM sales_orders o LEFT JOIN sales_order_items i ON i.sales_order_id=o.id GROUP BY o.id ORDER BY o.order_date,o.petpooja_order_id LIMIT 4;
~~~

#### constraints

~~~sql
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE tablename IN ('sales_orders','sales_order_items') ORDER BY tablename,indexname;
~~~

#### columns

~~~sql
SELECT table_name,column_name,data_type,is_nullable,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_name IN ('sales_orders','sales_order_items','outlet_product_settings') ORDER BY table_name,ordinal_position;
~~~

#### outlet

~~~sql
SELECT o.id,o.code,o.organization_id,o.is_active,o.petpooja_rest_id,g.code organization_code,g.name organization_name FROM outlets o JOIN organizations g ON g.id=o.organization_id WHERE o.code='KOZ-001';
~~~

#### itemStatus

~~~sql
SELECT o.status,count(*) item_records,sum(i.quantity) quantity,count(DISTINCT i.sales_order_id) orders,sum(i.total_amount) item_total,sum(i.item_tax) tax,sum(i.item_discount) discount FROM sales_order_items i JOIN sales_orders o ON o.id=i.sales_order_id GROUP BY o.status ORDER BY o.status;
~~~

#### november

~~~sql
SELECT count(*) orders,count(*) FILTER(WHERE status='Success') success,sum(total_amount) FILTER(WHERE status='Success') success_final FROM sales_orders WHERE order_date BETWEEN '2026-11-01' AND '2026-11-22';
~~~

#### mapping

~~~sql
SELECT financial_status,matching_status,count(*) orders FROM sales_orders GROUP BY 1,2;
~~~

#### zeroDays

~~~sql
SELECT d::date business_date,count(o.id) orders,coalesce(sum(o.total_amount) FILTER(WHERE o.status='Success'),0) success_final FROM generate_series('2026-10-28'::date,'2026-11-26'::date,'1 day') d LEFT JOIN sales_orders o ON o.order_date=d::date GROUP BY d HAVING count(o.id)=0 ORDER BY d;
~~~

#### statusMissing

~~~sql
SELECT count(*) FILTER(WHERE tax_total IS NULL) null_tax,count(*) FILTER(WHERE status IS NULL OR status='') empty_status FROM sales_orders;
~~~

#### outletTotals

~~~sql
SELECT o.code,count(s.id) orders FROM outlets o LEFT JOIN sales_orders s ON s.outlet_id=o.id GROUP BY o.code ORDER BY o.code;
~~~

#### Archived invoice header comparison

~~~sql
SELECT petpooja_order_id,order_date,status,core_total,discount_total,tax_total,total_amount FROM sales_orders WHERE petpooja_order_id IN ('53481','53691','53956','53957','53958','54298','54299','54300','57830','58320','58321','58322','58323','58547','58804','58805','58806','58807','59093','59094','59095','59096','59431','59432','59433','59434','59827','59828','59851','59852','59853','C1287');
~~~

### Read-only backend reproduction and limitations

The separate verification process parsed .env with node:util parseEnv without setting process.env, checked the datasource host/database, and instantiated Prisma with that explicit datasource. It began an interactive transaction, executed SET TRANSACTION READ ONLY and supplied that transaction client as the singleton only inside the verification process. The running app was not changed.

It called resolveDateRange({preset:'last30Days'}, referenceDate=2026-11-26T12:00:00+05:30), then actual getSalesSummary, getOrderHealth, getSalesTrend, getOrdersTrend, getHourlySales, getSalesByOrderType, getSalesByPaymentMethod, getDailySalesKpiTrends and getItemSalesRanking with the verified organization/outlet.

Current test outputs in this report are direct function results, not mocked sales. Monetary report tables use database decimals rounded to two places for presentation; JS sub-paisa noise is not misreported as a discrepancy.

No authenticated page/API response, browser console, production dashboard, external scheduler or fresh Petpooja response was tested. No verification script that seeds/mutates data was run.

