# Business Rules
Net sales = gross - discount.
Food cost = sold quantity × product food cost.
Gross food margin = net sales - food cost.
Wastage cost = wasted quantity × product food cost.
Wastage % = wasted / prepared × 100.
Sell-through % = sold / prepared × 100.
Estimated operational contribution = sales - food cost - wastage - breakage - variable operating costs.
Do not label contribution as net profit unless all relevant accounting expenses are included.
Preparation recommendations should initially be transparent/rule-based using same-weekday history, recent average, trend and safety buffer.

---

## Petpooja POS Sales Integration Business Rules (Phase 1)

1. **Order Status & Revenue Inclusion:**
   - Only orders with `status = 'Success'` are included in gross sales, net sales, and order volume calculations.
   - Orders with `status = 'Cancelled'` are excluded from sales and margin calculations.
2. **Missing & Unknown Values:**
   - Missing discounts, taxes, or food costs are stored as `NULL`, never forced to `0.00`.
   - If a product food cost is `NULL`, margin percentage displays as `—` (dash) to prevent false profitability figures.
3. **Data Source Separation:**
   - In `DATA_SOURCE=mock` mode, analytics continue reading from `mock_data/*.json`.
   - In `DATA_SOURCE=database` mode, analytics read strictly from PostgreSQL `sales_orders` and `sales_order_items`. If no records exist, the UI renders an empty state rather than falling back to mock fixtures.
4. **Phase 2+ Deferred Rules:**
   - Automated inventory depletion and recipe consumption are deferred to Phase 2.
   - Multi-tender gateway fee reconciliation is deferred to Phase 2.
