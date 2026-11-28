# Petpooja Sales Data — Reconciliation Notes

**Prepared:** 27 November 2026  
**Source basis:** Petpooja API/database audit dated 23 November and synchronization/backfill reports supplied in this conversation.

> This is a dated evidence record. The figures below belong to different audit windows and must not be treated as one combined current total.

## 1. 23 November local database snapshot

The Petpooja API/database technical reference recorded this local PostgreSQL snapshot:

| Measure | Recorded value |
|---|---:|
| Successful orders | 547 |
| Complimentary orders | 15 |
| Cancelled orders | 2 |
| Total orders | 564 |
| Line items | 1,904 |
| Distinct item names | 311 |
| Mapped line items | 0 |
| Unmapped line items | 1,904 |

The report covered 19–20 November 2026.

### Financial totals recorded by status

| Status | Orders | Core total | Tax total | Discount total | Total amount |
|---|---:|---:|---:|---:|---:|
| Success | 547 | ₹3,60,470.00 | ₹14,367.70 | ₹6,499.29 | ₹3,68,403.00 |
| Complimentary | 15 | ₹7,495.00 | ₹374.78 | ₹0.00 | ₹7,871.00 |
| Cancelled | 2 | ₹495.00 | ₹11.50 | ₹0.00 | ₹507.00 |

These are reported audit values, not a live query result.

## 2. Financial definitions recorded in the audit

The source audit observed this relationship in its successful-order dataset:

`totalAmount = coreTotal - discountTotal + taxTotal + roundOff`

Definitions in that report:
- `coreTotal`: gross menu sales before discounts and taxes.
- `taxTotal`: GST charged on the order.
- `discountTotal`: discounts applied.
- `totalAmount`: total collection figure from Petpooja.
- Complimentary and cancelled orders retain payload financial values but are excluded from recognized net sales under the reported Sales Analytics rules.

Validate this against current business rules and real records before changing calculations.

## 3. Status treatment

| POS status | Reported treatment |
|---|---|
| Success | Included in successful sales and revenue |
| Complimentary | Tracked separately; not treated automatically as revenue |
| Cancelled | Excluded from recognized sales revenue |
| Unknown | Explicit handling required; do not default to Success |

## 4. Backfill report — 1 to 22 November 2026

The synchronization report recorded a local-development historical backfill:

| Status | Orders |
|---|---:|
| Success | 5,847 |
| Complimentary | 115 |
| Cancelled | 23 |
| **Total** | **5,985** |

Reported successful sales revenue: **₹40,67,382**.

The report stated zero ingestion failures and that existing 19–20 November records were updated rather than duplicated. It also states that this was a local development backfill, not a production ingestion.

## 5. Later outlet-scoped sales reader check

The 26 November pending-features register recorded:
- Sales reader returned 6,112 successful orders for 31 October–22 November 2026.
- Sales summary returned the same 6,112 successful orders.
- Both matched an independent outlet-scoped database count.

This count has a different date window and status scope from the 5,985-order backfill total. Do not infer a discrepancy without reproducing equivalent filters.

## 6. Operational-date rollover issue

The backfill report identified early-morning orders requested under 1 November that were assigned to 31 October by operational-date logic. It also reported a discrepancy between the 31 October rollover count and the Last Month dashboard count.

**Unresolved:** Reconcile the relevant raw API request dates, normalized `order_date`, database counts and dashboard date boundaries before treating the October rollover totals as final.

The worker report notes that Petpooja's inspected payload exposes `created_on` and `order_date`, but no verified source modification/version timestamp. Do not invent stale-response protection based on `created_on`.

## 7. Product mapping gap

The 23 November audit reported all 1,904 line items as unmapped at that snapshot. The integration is designed to preserve those items using `itemName` and nullable `productId`, so unmapped items do not disappear from item-name sales ranking.

Next steps, if still relevant:
1. Compare current Petpooja item IDs/codes with `OutletProductSetting` and `Product`.
2. Confirm product-code scope and duplicate handling.
3. Map only verified products.
4. Re-run mapped/unmapped counts and product analytics.

## 8. Known reporting/data gaps

The API/data audit listed these fields as not persisted in the audited schema:
- Payment type / multi-tender breakdown.
- Cancellation description.
- Online aggregator/channel.
- Table number and covers.
- Category mapping.

Do not build analytics on these dimensions until persistence and validation are implemented.

## 9. Reconciliation checklist for a future controlled run

- [ ] Record environment and database target.
- [ ] Confirm Petpooja `restID` maps to the intended active outlet.
- [ ] Record requested operational dates and all pagination pages.
- [ ] Compare fetched, normalized, ingested, updated and failed order counts.
- [ ] Compare order counts by POS status.
- [ ] Compare financial totals by status using identical filters.
- [ ] Check unique `(outletId, petpoojaOrderId)` behavior and line-item counts.
- [ ] Check unmapped product counts.
- [ ] Reconcile operational-date/IST boundaries.
- [ ] Verify dashboard and report outputs against the same database query.
- [ ] Preserve sanitized evidence; do not store raw customer payloads.

## 10. Source-of-truth caution

Use the current PostgreSQL database and repeatable SQL/Prisma queries for new reconciliations. This document preserves historical audit findings only; it must not be used as a substitute for a fresh query.
