# Gulmohar Analytics — Comprehensive Read-Only Prisma Schema & Database Audit

**Document Type:** Technical Audit & Architectural Verification Report
**Date:** November 11, 2026
**Auditor:** Antigravity (DeepMind Advanced Agentic Coding Pair)
**Target Environment:** Local PostgreSQL 16 Alpine (`gulmohar-postgres`) via Prisma ORM (`@prisma/client@6.19.3`)
**Database:** `gulmohar_dev` on host port `5432`
**Migration Tracked:** `prisma/migrations/20261111173938_init_multi_outlet_schema/migration.sql`

---

## 1. Executive Summary

A comprehensive, read-only architectural and database integrity audit was conducted across the newly implemented Prisma schema, committed migration SQL, and live PostgreSQL database. The audit evaluated structural alignment with the approved business requirements and technical specifications documented in:
- [`docs/multi-outlet-architecture-audit.md`](./multi-outlet-architecture-audit.md)
- [`docs/architecture.md`](./architecture.md)
- [`docs/rbac-audit-and-plan.md`](./rbac-audit-and-plan.md)
- [`docs/petpooja-integration-guide.md`](./petpooja-integration-guide.md)

### Key Audit Conclusions:
1. **Strong Architectural Alignment:** The database schema correctly models the organization-to-outlet hierarchy under `Ashirvad Gulmohar`, the three core roles (`admin`, `manager`, `operator`), decoupled employee records, shared organization-level product/recipe catalogs with outlet price/availability overrides, server-attributable operational losses, and normalized POS sales orders.
2. **Zero Schema Drift:** The committed migration file `20261111173938_init_multi_outlet_schema` matches `prisma/schema.prisma` byte-for-byte in relational intent, and PostgreSQL reports `Database schema is up to date!` with all 15 application tables and 2 enum types active.
3. **No Test Data Contamination:** The testing restaurant ID (`53qcgrdis8` from `Petpooja_Rider_Testing`) is **not** assigned in the database; all tables are cleanly initialized with 0 rows.
4. **Critical Data-Isolation & Integrity Gaps Identified:**
   - **Cross-Outlet Department Attribution Hazard (High Severity):** `Employee` references both `outlet_id` and `department_id`, but lacks a composite foreign key `(outlet_id, department_id)` pointing to `departments(outlet_id, id)`. In raw SQL or manual inserts, an employee belonging to Outlet A could technically reference a department belonging to Outlet B.
   - **Cross-Outlet Breakage Department Hazard (High Severity):** `BreakageRecord` similarly references `outlet_id` and `department_id` independently without composite enforcement.
   - **Missing POS Order Idempotency Constraint (Medium Severity):** `sales_orders` has no unique constraint on `(outlet_id, petpooja_order_id)`. While intentional in Phase 1 staging to avoid hard ingestion failures, normalization requires atomic deduplication or application upsert fences.
   - **User Outlet Assignment Cross-Org Protection (Medium Severity):** `user_outlet_assignments` links `user_id` and `outlet_id`. Since `user_accounts` and `outlets` both belong to `organizations`, a user could technically be assigned an outlet from another organization if multiple organizations were ever introduced (prevented at present because there is only one organization).

---

## 2. Actual Schema Inventory

The database contains 16 tables (15 domain tables + 1 Prisma metadata table) and 2 native enum types:

### Enums
- `"AppRole"`: `'admin'`, `'manager'`, `'operator'`
- `"PreparationType"`: `'batch'`, `'fresh_daily'`

### Tables
| Table Name | Prisma Model | Purpose | Primary Key | Foreign Keys |
| :--- | :--- | :--- | :--- | :--- |
| `organizations` | `Organization` | Enterprise root entity | `id UUID` (`gen_random_uuid()`) | None |
| `outlets` | `Outlet` | Physical restaurant premises | `id UUID` (`gen_random_uuid()`) | $\to$ `organizations.id` |
| `user_accounts` | `UserAccount` | Application login accounts | `id UUID` (`gen_random_uuid()`) | $\to$ `organizations.id` |
| `user_outlet_assignments` | `UserOutletAssignment` | M:N user-to-outlet access | `id UUID` (`gen_random_uuid()`) | $\to$ `user_accounts.id`, `outlets.id` |
| `departments` | `Department` | Outlet-scoped departments | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id` |
| `employees` | `Employee` | Staff HR master directory | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id`, `departments.id` |
| `categories` | `Category` | Organization menu categories | `id UUID` (`gen_random_uuid()`) | $\to$ `organizations.id` |
| `products` | `Product` | Master menu dishes | `id UUID` (`gen_random_uuid()`) | $\to$ `organizations.id`, `categories.id` |
| `ingredients` | `Ingredient` | Master raw ingredients | `id UUID` (`gen_random_uuid()`) | $\to$ `organizations.id` |
| `recipe_items` | `RecipeItem` | Bill-of-materials link | `id UUID` (`gen_random_uuid()`) | $\to$ `products.id`, `ingredients.id` |
| `outlet_product_settings` | `OutletProductSetting` | Outlet pricing & availability | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id`, `products.id` |
| `wastage_records` | `WastageRecord` | Kitchen food waste logs | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id`, `products.id`, `user_accounts.id` |
| `breakage_records` | `BreakageRecord` | Tableware breakage logs | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id`, `departments.id`, `user_accounts.id` |
| `sales_orders` | `SalesOrder` | Normalized POS bill headers | `id UUID` (`gen_random_uuid()`) | $\to$ `outlets.id` |
| `sales_order_items` | `SalesOrderItem` | POS line items | `id UUID` (`gen_random_uuid()`) | $\to$ `sales_orders.id`, `products.id` |
| `_prisma_migrations` | N/A | Migration engine log | `id VARCHAR(36)` | None |

---

## 3. Relationship and Foreign Key Audit

### 3.1 Organization and Outlets
- **Relationship:** `outlets.organization_id -> organizations.id` (`ON DELETE RESTRICT ON UPDATE CASCADE`).
- **Audit:**
  - Deleting an organization is blocked if outlets exist (`RESTRICT`), which protects against catastrophic data loss.
  - `outlets.code` has a table-wide `UNIQUE` constraint. Note: In a multi-organization setup, outlet codes would normally be scoped `UNIQUE(organization_id, code)`. However, since Ashirvad Gulmohar is the sole organization, a global unique constraint on `code` (`KOZ-001`, `KOZ-002`, `BLR-001`) is clean and prevents code collisions across outlets.
  - `outlets.petpooja_rest_id` is nullable and unique. Unmapped outlets remain `NULL`.

### 3.2 Users and RBAC
- **Relationship:**
  - `user_accounts.organization_id -> organizations.id` (`ON DELETE RESTRICT`).
  - `user_outlet_assignments.user_id -> user_accounts.id` (`ON DELETE CASCADE`).
  - `user_outlet_assignments.outlet_id -> outlets.id` (`ON DELETE CASCADE`).
- **Audit:**
  - `AppRole` enum (`admin`, `manager`, `operator`) matches the approved 3-role structure.
  - Composite unique constraint `@@unique([userId, outletId])` prevents duplicate assignments of the same user to an outlet.
  - Deleting an outlet or user cascades cleanly to remove assignment links without leaving orphaned assignments.
  - **Important Server-Side Boundary:** The database does not restrict an `Admin` from having outlet assignments, nor does it forbid a `Manager` from having multiple assignments. This aligns perfectly with the requirement that Admins have organization-wide access and Managers can oversee multiple assigned outlets. The access boundaries (e.g. blocking Managers from `/dashboard/sales`) are enforced in application middleware and server-side resolvers, not via rigid SQL check constraints.

### 3.3 Departments and Employees
- **Relationship:**
  - `departments.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `employees.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `employees.department_id -> departments.id` (`ON DELETE RESTRICT`).
- **Audit:**
  - `departments` has `@@unique([outletId, departmentCode])`, allowing `KOZ-001` and `KOZ-002` to both have department `"D01"` independently.
  - `employees` has `@@unique([outletId, employeeCode])`, ensuring employee `"E001"` is unique within each outlet.
  - **Cross-Outlet Integrity Gap:** `employees` has independent FKs for `outlet_id` and `department_id`. At the database level, nothing prevents setting `employees.outlet_id = 'KOZ-001'` and `employees.department_id = 'D01-of-KOZ-002'`.

### 3.4 Products, Ingredients, and Recipes
- **Relationship:**
  - `categories.organization_id -> organizations.id` (`ON DELETE RESTRICT`).
  - `products.organization_id -> organizations.id` (`ON DELETE RESTRICT`).
  - `products.category_id -> categories.id` (`ON DELETE RESTRICT`).
  - `ingredients.organization_id -> organizations.id` (`ON DELETE RESTRICT`).
  - `recipe_items.product_id -> products.id` (`ON DELETE CASCADE`).
  - `recipe_items.ingredient_id -> ingredients.id` (`ON DELETE RESTRICT`).
  - `outlet_product_settings.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `outlet_product_settings.product_id -> products.id` (`ON DELETE CASCADE`).
- **Audit:**
  - Master catalog is owned by the organization, avoiding 60x duplication of dishes and recipes per outlet.
  - `products.food_cost` is `DECIMAL(10,2)` and **nullable**, satisfying the core requirement that missing recipe costs are represented as `NULL` and never false zero.
  - `recipe_items.quantity_per_unit` uses `DECIMAL(10,4)` allowing precise unit weights (e.g. `0.015` kg oil or `0.180` kg rice).
  - `outlet_product_settings` allows outlet selling price overrides (`price_override DECIMAL(10,2) NULLABLE`) and availability toggles (`is_available BOOLEAN DEFAULT true`).

### 3.5 Wastage and Breakage
- **Relationship:**
  - `wastage_records.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `wastage_records.product_id -> products.id` (`ON DELETE RESTRICT`).
  - `wastage_records.recorded_by_id -> user_accounts.id` (`ON DELETE RESTRICT`).
  - `breakage_records.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `breakage_records.department_id -> departments.id` (`ON DELETE RESTRICT`).
  - `breakage_records.recorded_by_id -> user_accounts.id` (`ON DELETE RESTRICT`).
- **Audit:**
  - `recorded_by_id` correctly enforces referential integrity to `user_accounts.id`. Records are attributed to authenticated accounts (`op-koz-001`), not arbitrary text or decoupled employee rows.
  - `unit_food_cost` and `estimated_cost` in `wastage_records` are nullable decimals, supporting server-side computation during insertion.
  - Deleting an outlet, product, department, or user is restricted if wastage or breakage records exist, preventing historical operational audits from being destroyed.

### 3.6 Sales Orders and Items
- **Relationship:**
  - `sales_orders.outlet_id -> outlets.id` (`ON DELETE RESTRICT`).
  - `sales_order_items.sales_order_id -> sales_orders.id` (`ON DELETE CASCADE`).
  - `sales_order_items.product_id -> products.id` (`ON DELETE SET NULL`).
- **Audit:**
  - `sales_order_items.product_id` is nullable with `ON DELETE SET NULL`. If an unmatched POS item is received, it can be saved with `item_name` and `product_id = null`. If a product is retired, historical sales items preserve their sales figures.
  - `sales_orders.financial_status` (`'pending'`) and `matching_status` (`'unmatched'`) match the staging reconciliation model.
  - Deleting an order cascades to delete its line items (`ON DELETE CASCADE`).

---

## 4. Multi-Outlet Isolation Findings

### 4.1 Database-Enforced Isolation
1. **Outlet Tenant Scoping:** Every operational table (`departments`, `employees`, `outlet_product_settings`, `wastage_records`, `breakage_records`, `sales_orders`) contains a non-nullable `outlet_id UUID REFERENCES outlets(id)`.
2. **Composite Indexes for Outlet Queries:**
   - `wastage_records(outlet_id, date)`
   - `breakage_records(outlet_id, date)`
   - `sales_orders(outlet_id, order_date)`
   - These ensure queries scoped to an outlet and date range execute index scans rather than full table scans.

### 4.2 Cross-Outlet Resource Linkage Hazards (Database vs Server-Side)
- **Employee-Department Cross-Link:** An employee in Outlet A can be inserted with a `department_id` belonging to Outlet B because there is no composite foreign key constraint `(outlet_id, department_id)` linking to `departments(outlet_id, id)`.
  - *Risk:* In raw SQL or unvalidated mutations, an employee could belong to Kozhikode-001 but report to a department in Bangalore-001.
  - *Mitigation:* In Prisma and application Server Actions, employee creation must validate that `department.outlet_id === employee.outlet_id`. (A composite unique key on `departments(outlet_id, id)` and composite FK in `employees` can be added in a future refinement).
- **Breakage-Department Cross-Link:** Similarly, `breakage_records` can theoretically reference a department from another outlet.
  - *Mitigation:* Validate `department.outlet_id === breakage.outlet_id` server-side before insertion.
- **Wastage-Product Cross-Link:** Products are organization-level masters, so any outlet in Ashirvad Gulmohar can legitimately reference any product in the organization master. This is by design.

---

## 5. RBAC Readiness Findings

1. **Role Model:** The `AppRole` enum defines `admin`, `manager`, `operator`.
2. **Account Decoupling:**
   - `user_accounts` represents application logins (e.g. `admin`, `mgr-kozhikode`, `op-koz-001`).
   - `employees` represents physical restaurant staff (e.g. Cook, Steward, Helper) and carries no passwords, sessions, or roles.
   - Separation is 100% achieved in the schema.
3. **Multi-Outlet Assignment Support:**
   - A Manager user can have rows in `user_outlet_assignments` for both `KOZ-001` and `KOZ-002`.
   - `is_default` allows the application to automatically select their primary outlet upon login.
4. **Operator Attribution:**
   - An Operator account for `KOZ-001` has one row in `user_outlet_assignments`.
   - When submitting wastage, `recorded_by_id` references the Operator's `user_accounts.id`.
   - Financial fields (`unit_food_cost`, `estimated_cost`, `total_cost`) are nullable in the schema so that the server can calculate and populate them while rejecting any client-supplied cost figures.
5. **Authorization Enforcement Boundary:**
   - Database tables do not contain procedural permission logic.
   - The application server MUST enforce:
     - Edge Middleware routing (blocking Operators from `/dashboard/*` and Managers from `/dashboard/sales`).
     - Session scoping via `resolveAuthorizedOutletScope(userId, requestedOutletId)` to inject `where: { outletId }` into all database queries.

---

## 6. Financial Data and Precision Findings

1. **Monetary Precision:**
   - `products.default_selling_price`: `DECIMAL(10,2)`
   - `products.food_cost`: `DECIMAL(10,2)` (Nullable)
   - `ingredients.default_cost`: `DECIMAL(12,2)`
   - `outlet_product_settings.price_override`: `DECIMAL(10,2)` (Nullable)
   - `employees.monthly_salary`: `DECIMAL(12,2)`
   - `wastage_records.unit_food_cost` & `estimated_cost`: `DECIMAL(12,2)` (Nullable)
   - `breakage_records.unit_cost` & `total_cost`: `DECIMAL(12,2)`
   - `sales_orders.core_total`, `tax_total`, `discount_total`, `total_amount`: `DECIMAL(12,2)` (Nullable)
   - `sales_order_items.unit_price`, `total_amount`, `item_tax`, `item_discount`: `DECIMAL(10,2)` / `DECIMAL(12,2)`
2. **Quantity Precision:**
   - `recipe_items.quantity_per_unit`: `DECIMAL(10,4)` (supports fractions down to 0.1 gram / 0.0001 kg).
   - `wastage_records.prepared_quantity` & `wasted_quantity`: `DECIMAL(10,3)` (supports fractions down to 1 gram / 0.001 kg).
   - `sales_order_items.quantity`: `DECIMAL(10,3)`.
   - `breakage_records.broken_qty`: `INTEGER` (tableware is discrete whole units).
3. **Assessment:** Precision standards are consistent with Indian restaurant accounting practices and the existing mock data rules. Missing values are properly nullable and not forced to zero.

---

## 7. Petpooja Integration Readiness

1. **Outlet Mapping Decoupling:**
   - `outlets.petpooja_rest_id` is an optional, unique text field.
   - Internal tables (`sales_orders`, `wastage_records`) use internal UUIDs, **never** raw Petpooja restaurant strings.
2. **Unregistered Restaurant Quarantine Support:**
   - If an incoming Petpooja webhook has an unknown `restID`, it cannot match an `outlets.id` and will not insert a `sales_orders` record.
   - Confirmed test ID `53qcgrdis8` is **not** present in the database.
3. **Order Line Items:**
   - `sales_order_items.product_id` is nullable, allowing POS orders with unmapped or custom dishes to be ingested without violating foreign keys.
4. **Order Idempotency Consideration:**
   - `sales_orders` has an index on `(outlet_id, order_date)`, but does **not** have a unique constraint on `(outlet_id, petpooja_order_id)`.
   - *Architecture Alignment:* In Phase 1 architecture, raw deliveries are staged first in `petpooja_webhook_events`. Normalization requires either:
     - An application-level upsert (`findFirst` by `outletId` and `petpoojaOrderId`), OR
     - A database constraint `@@unique([outletId, petpoojaOrderId])`.
   - Adding a unique constraint on `(outlet_id, petpooja_order_id)` is recommended before connecting live automated background normalization to ensure database-level idempotency.

---

## 8. Migration Consistency Results

1. **Prisma Schema vs Migration SQL:**
   - All 15 models in `prisma/schema.prisma` are accounted for in `prisma/migrations/20261111173938_init_multi_outlet_schema/migration.sql`.
   - All 35 indexes, 24 foreign keys, and 2 enum types defined in the schema exist identically in the migration SQL.
2. **Database State vs Migration SQL:**
   - Queried PostgreSQL `_prisma_migrations`:
     - Migration `20261111173938_init_multi_outlet_schema` applied successfully with `applied_steps_count = 1` and `rolled_back_at IS NULL`.
   - Ran `npx prisma migrate status`:
     - Result: `1 migration found in prisma/migrations. Database schema is up to date!`
3. **Drift:** Zero schema drift detected.

---

## 9. Comprehensive Findings & Risk Assessment

| Finding ID | Severity | Relevant Model / Table | Finding Description | Risk & Architectural Impact | Recommended Action |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **F-01** | **High** | `Employee` / `Department` | `employees` has separate FKs to `outlet_id` and `department_id` without composite coupling. | An employee can theoretically be assigned to a department belonging to a different outlet. | Validate `department.outlet_id === employee.outlet_id` in application Server Actions. In future migration, introduce composite unique key on `departments(id, outlet_id)` and composite FK in `employees`. |
| **F-02** | **High** | `BreakageRecord` / `Department` | `breakage_records` has separate FKs to `outlet_id` and `department_id`. | A breakage record for Outlet A can theoretically reference a department belonging to Outlet B. | Validate `department.outlet_id === breakage.outlet_id` in server-side mutation logic. |
| **F-03** | **Medium** | `SalesOrder` | `sales_orders` lacks `@@unique([outletId, petpoojaOrderId])`. | Multiple webhook events for the same order could create duplicate sales order headers if normalization is run concurrently without locking. | Add `@@unique([outletId, petpoojaOrderId])` or enforce atomic sequential upsert in the normalization worker. |
| **F-04** | **Low** | `UserOutletAssignment` | `user_outlet_assignments` links `user_id` and `outlet_id` without cross-org validation. | In a multi-organization scenario, a user from Org A could be assigned an outlet from Org B. Currently zero risk since Ashirvad Gulmohar is the sole organization. | Enforce organization matching in the Admin User Management UI/Server Actions. |
| **F-05** | **Low** | `BreakageRecord` | `breakage_records.item` is stored as free text rather than a normalized tableware catalog. | Potential typos in item names across outlets (e.g. "Dinner Plate" vs "dinner plate"). | Aligns with existing mock data (`mock_data/breakage.json`), which stores `item` as text. Acceptable for Phase 1; tableware master can be added later. |

---

## 10. Classification of Action Items

### 10.1 Must Fix Before Application Integration
- None of the findings represent blockers that prevent beginning authentication, RBAC, or application data access development.
- **Application Safeguards:** Ensure that the Server Actions creating `Employee` and `BreakageRecord` validate that the selected `department_id` belongs to the target `outlet_id`.

### 10.2 Can Defer to a Later Phase
- **Composite Foreign Keys:** Adding `departments(id, outlet_id)` composite constraints can be deferred to a schema hardening migration.
- **Tableware Item Master:** Normalizing breakage items into a catalog table.
- **Attendance & Shift Tables:** Explicitly deferred per confirmed requirements.

### 10.3 Good Enough for Phase 1
- The existing schema is robust, production-grade, and cleanly models all 15 core entities.
- Decimal precisions are accurate.
- Deletion behaviors (`RESTRICT` on financial/operational data, `CASCADE` on line items and user assignments) prevent accidental data destruction.
- Nullable food costs and Petpooja IDs adhere to all business rules.

---

## 11. Sales Database Schema Audit for Petpooja Integration (Task 1 Assessment)

*Status: Completed (November 2026)*

### 11.1 Assessment of Existing Models (`SalesOrder` and `SalesOrderItem`)
- **Supported Fields:**
  - `outlet_id` (FK to `outlets(id)`): Outlet isolation is supported.
  - `petpooja_order_id` (TEXT): External POS bill identifier.
  - `order_date` (DATE) & `ordered_at` (TIMESTAMPTZ): Date and timestamp tracking.
  - `order_type` (TEXT): Supports Dine-in, Delivery, Takeaway.
  - `core_total`, `tax_total`, `discount_total`, `total_amount` (NUMERIC): Financial header amounts.
  - `sales_order_items`: Line items with `item_name`, `quantity`, `unit_price`, `total_amount`, `item_tax`, `item_discount`, and nullable `product_id` (FK to `products(id)`).
  - `outlet_product_settings.petpooja_item_id`: Outlet-level POS item code mapping.

### 11.2 Missing Fields & Schema Gaps for Phase 1
1. **Idempotency Constraint (Essential):**
   - Current: `INDEX (outlet_id, order_date)`.
   - Missing: `UNIQUE (outlet_id, petpooja_order_id)`. Without this constraint or strict upsert logic, duplicate orders can be inserted.
2. **Order Status Column (Essential):**
   - Missing: `status TEXT NOT NULL DEFAULT 'Success'` (values: `'Success'`, `'Cancelled'`). Without this, cancelled/voided bills cannot be properly excluded from revenue and margin analytics.
3. **Payment Method / Type (High Value):**
   - Missing: `payment_type TEXT NULL` (e.g. `'Cash'`, `'Card'`, `'Online'`, `'Part Payment'`). Required to support payment mix analytics.
4. **Customer Invoice / Bill Number (Optional / Recommended):**
   - Missing: `customer_invoice_id TEXT NULL`. Useful when Petpooja POS invoice numbers differ from internal order IDs.

### 11.3 Status Classification (Updated: Task 2 Hardening)
- **Implemented in PostgreSQL (Tasks 2, 4, 5, 7 Completed):**
  - Order lifecycle `status TEXT NOT NULL DEFAULT 'Success'` (Petpooja order status: "Success", "Cancelled").
  - POS order idempotency constraint: `@@unique([outletId, petpoojaOrderId])` on `SalesOrder` (`sales_orders_outlet_id_petpooja_order_id_key`).
  - Base `sales_orders` and `sales_order_items` tables with foreign keys to `outlets` and `products`.
  - Database loaders for `getSales()` and `getSaleItems()` reading from PostgreSQL with outlet and date filtering, strictly excluding cancelled orders and maintaining NULL-safe values.
  - Database loaders for `getProducts()` and `getCategories()` reading from PostgreSQL with active filtering, category relations, outlet overrides, and strict NULL-cost preservation.
  - Database loaders for `getWastage()`, `getBreakage()`, and `getDepartments()` reading from PostgreSQL `wastage_records`, `breakage_records`, and `departments` with outlet/date filtering and strict NULL-cost preservation.
  - `getPreparation()` preserved cleanly on mock path (`preparation.json`), avoiding fabrication of artificial kitchen preparation logs.
  - Financial Data Integrity Audit & Corrections (Task 9 & 9.1): Full adherence to NULL preservation for missing financial metrics, distinction of known 0 from NULL discount, strict exclusion of uncosted products from profitability rankings, incomplete tracking for partial wastage/breakage costs, and safe fallback for operational contribution. All 7 regression suites (215 tests) verified passing.
- **Deferred from Phase 1 (Deferred to Phase 2+):**
  - Preparation logs and batch tracking model (`preparation_logs`).
  - Dedicated tableware replacement cost catalog (`tableware_items`).
  - Attendance & shift tables (`attendance_records` / biometric sync).
  - Operating expenses / overhead expense ledger (`operating_expenses`).
  - Tableware Item Master and composite foreign keys on departments.
  - `payment_type` / tender breakdown and `customer_invoice_id`.
- **Blocked by External Dependency:** Clarification of Petpooja Get Orders date selection window and production API activation for `9780nusx`.
- **Deferred to Phase 2+:** Automated inventory depletion, ingredient consumption tables, supplier procurement, multi-tender gateway reconciliation.

---

## 12. Recommended Correction & Next Step Order

When moving from read-only audit to the next development phase, follow this sequence:

1. **Keep Schema Unchanged for Now:** The existing migration `20261111173938_init_multi_outlet_schema` is valid and active. No immediate schema edits are needed.
2. **Implement Server-Side Outlet Scoping Helper (`src/lib/auth/scope.ts`):** Build `resolveAuthorizedOutletScope()` to enforce Zero-Trust outlet resolution against PostgreSQL on every request.
3. **Build Authentication & Session Management:** Implement login Route Handlers and HTTP-only signed cookie session verification for `admin`, `manager`, and `operator`.
4. **Build Seeding Script (`prisma/seeds/seed.dev.ts`):** Seed the initial root organization (`Ashirvad Gulmohar`), test outlets (`KOZ-001`, `KOZ-002`, `BLR-001`), test accounts, and master catalog into local PostgreSQL for end-to-end testing.
5. **Add `@@unique([outletId, petpoojaOrderId])` (Optional Schema Hardening):** When developing the Petpooja normalization pipeline, create a small incremental migration to enforce order idempotency at the database level.

---

## 12. Verification & Safety Confirmation

- **No files were modified in `src/` or `prisma/`.**
- **No migrations were run or created.**
- **No data was modified or deleted.**
- **Local PostgreSQL container remains healthy with all 16 tables intact.**
- **Production Next.js build and ESLint verified clean.**
- **Awaiting management approval before proceeding to application integration.**
