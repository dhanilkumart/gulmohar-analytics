# Gulmohar Analytics – Complete Application Audit & RBAC Permission Plan

**Status:** Confirmed Architecture Specification & RBAC Planning (Revised per Confirmed Business Requirements)
**Date:** November 11, 2026
**Document Type:** Audit Report, Permission Matrix & System Design
**Target Roles & Logins:** Three Application Roles: `Admin`, `Manager`, `Operator` (Multi-Outlet Scoped)

---

## 1. Confirmed Business Requirements & Corrections

Following management review, the RBAC architecture is revised based on confirmed multi-outlet business rules:

1. **Organization and Outlet Hierarchy with Three Application Roles:**
   - Organization: **Ashirvad Gulmohar**.
   - Outlets: Multiple restaurant locations (e.g. `KOZ-001`, `KOZ-002`, `BLR-001`).
   - Three Application Roles:
     1. **Admin:** Organization-wide full access to all outlets and modules.
     2. **Manager:** Access restricted to assigned outlet(s) for Wastage & Breakage dashboards/management.
     3. **Operator:** Access restricted to assigned outlet(s) for dedicated simplified data entry (Wastage & Breakage).
   - **Crucial Architecture Rule:** We do **NOT** create individual application login accounts for every restaurant employee. Application user accounts and employee master records remain completely separate. The system initially requires accounts for the three roles, but does not hardcode an account limit.
2. **Strict Admin Domain:**
   - Complete organization-wide and outlet-specific access: Executive Dashboard, Sales Analytics, Profitability Analytics, Wastage & Preparation Analytics, Breakage Analytics, Manpower Analytics, Reports & Exports, Staff/Employee Master Record Management, User Account Management, and consolidated multi-outlet reporting.
3. **Focused Manager Permissions (Operational Loss Management per Assigned Outlet):**
   - **Allowed:**
     - Access `/dashboard/wastage` (Wastage & Preparation page) scoped to assigned outlet(s).
     - View wastage analytical charts, preparation vs sold trends, waste percentages, and detailed records for assigned outlet(s).
     - Add, edit, and manage wastage entries for assigned outlet(s).
     - Access `/dashboard/breakage` (Breakage page) scoped to assigned outlet(s).
     - View breakage analytical charts, department trends, and detailed records for assigned outlet(s).
     - Add, edit, and manage breakage entries for assigned outlet(s).
   - **Strictly Prohibited:**
     - Overall Executive Dashboard (`/dashboard`).
     - Sales Analytics (`/dashboard/sales`).
     - Profitability Analytics (`/dashboard/profitability`) — recipe costs, ingredient food costs, and profit margins.
     - Manpower Analytics (`/dashboard/manpower`).
     - Management Reports (`/dashboard/reports`).
     - Staff / Employee master management.
     - User / Account management.
     - Access to unassigned outlets.
4. **Operator Role (Dedicated Simplified Operational Data Entry per Assigned Outlet):**
   - **Purpose:** Fast, floor-level data logging (kitchen spoiled/wasted dish logging, steward broken tableware logging) on assigned outlet terminals.
   - **Allowed:**
     - Wastage entry form (submit new wastage records for assigned outlet).
     - Breakage entry form (submit new breakage records for assigned outlet).
   - **Strictly Prohibited:**
     - Wastage analytical charts, preparation trends, or management overview.
     - Breakage analytical charts or department metrics.
     - Sales Analytics, Profitability, Executive Dashboard, Manpower, Reports, Staff management, or User management.
     - **Cannot edit or delete** submitted records (append/submit-only).
     - Access to unassigned outlets.
   - **UI Design Rule:** Operator receives a **dedicated simplified operational interface** (e.g., `/operator/entry` or `/staff/entry`). We do **not** simply render the Manager page with hidden charts, as that would risk leaking analytical summaries and cost breakdowns through page props or JSON payloads.
     - Breakage entry form (submit new breakage records).
   - **Strictly Prohibited:**
     - Wastage analytical charts, preparation trends, or management overview.
     - Breakage analytical charts or department metrics.
     - Sales Analytics, Profitability, Executive Dashboard, Manpower, Reports, Staff management, or User management.
     - **Cannot edit or delete** submitted records (append/submit-only).
   - **UI Design Rule:** Staff receives a **dedicated simplified operational interface** (e.g., `/staff/entry` or clean entry modal views). We do **not** simply render the Manager page with hidden charts, as that would risk leaking analytical summaries and cost breakdowns through page props or JSON payloads.
5. **Separation of Staff/Employee Records vs Application Accounts:**
   - The restaurant maintains a staff list (employee master) containing employee details.
   - This is strictly an employee master directory managed by Admin, **not** an application login list.
   - Existing mock data fields in `mock_data/employees.json`:
     - `employee_id` (string, e.g. `"E001"`)
     - `name` (string, e.g. `"Arun 1"`)
     - `department_id` (string, e.g. `"D01"`)
     - `role` (string, e.g. `"Cook"`, `"Steward"`, `"Cashier"`, `"Helper"`, `"Supervisor"`, `"Storekeeper"`, `"Cleaner"`, `"Captain"`)
     - `monthly_salary` (number, e.g. `26000`)
     - `employment_status` (string, e.g. `"active"`)
   - No additional mandatory business fields will be invented.
6. **Attendance Scope Removal:**
   - There is **no requirement** for attendance marking, entry, approval, shift scheduling, biometric integration, or staff attendance self-service.
   - All attendance management features are completely removed from planned RBAC scope.
   - The existing `/dashboard/manpower` page is retained strictly as read-only mock-data analytics accessible **exclusively to Admin**.

---

## 2. Complete Route and Page Inventory

The application is built on Next.js 16 App Router (React 19, TypeScript, Tailwind CSS v4, Server Components). Every route was inspected directly on disk:

| Route Path | Page Name / Component | Purpose | Main Information Displayed | Key Components Used | Available User Actions | Backing Data Source | Current Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | Root Landing Page (`src/app/page.tsx`) | Redirect/Entry point | Welcome headline and navigation link to dashboard | Static HTML, Hero container | Click link to `/dashboard` | None (Static) | **Implemented** |
| `/dashboard` | Executive Dashboard (`src/app/dashboard/page.tsx`) | High-level executive overview of restaurant health | KPI stat-tiles (Net Sales, Gross Food Margin, Attendance %, Breakage Cost, Wastage Cost), Combined Sales/Orders Trend Chart, Operating Costs Breakdown, Items Needing Attention, Top Performing Items | `PageContainer`, `MetricCard`, `SalesPerformanceChart`, `TopPerformingItems`, `ItemsNeedingAttention`, `DateRangeControl`, `ComparisonControl` | Date range filtering (`7d`, `30d`, `90d`, Custom), period comparison toggle (`None`, `Previous Period`) | `src/lib/analytics/` (`sales`, `profitability`, `attendance`, `operating-costs`, `breakage`, `wastage`) via `mock_data/*.json` | **Implemented** (Server-rendered, read-only analytics) |
| `/dashboard/sales` | Sales Analytics (`src/app/dashboard/sales/page.tsx`) | In-depth sales volume, ticket size, and channel performance | Headline KPIs (Net Sales, Order Count, AOV, Items Sold, Discounts), Sales vs Orders Trend, Hourly Sales Curve, Order Type Distribution (Dine-in, Takeaway, Delivery), Payment Tender Breakdown (UPI, Cash, Card), Category Performance, Product Performance Table | `MetricCard`, `SalesPerformanceChart`, `HourlySalesChart`, `OrderTypeChart`, `PaymentMethodChart`, `CategoryPerformanceChart`, `ProductPerformanceTable`, `DataTable` | Filter by date range, toggle comparison period, search products, sort columns, paginate product table | `src/lib/data/sales.ts`, `src/lib/data/sale-items.ts`, `src/lib/analytics/sales.ts` | **Implemented** (Server-rendered, read-only analytics) |
| `/dashboard/profitability` | Profitability & Menu Engineering (`src/app/dashboard/profitability/page.tsx`) | Dish margin analysis, recipe cost tracking, menu matrix | Headline KPIs (Gross Food Margin, Revenue, Total Food Cost, Avg Margin %, High Sales / Low Margin Count), Margin Matrix Scatter/Bubble Chart, Menu Classification Table (Stars, Plowhorses, Puzzles, Dogs), Detailed Dish Profitability Table | `MetricCard`, `ProfitabilityMatrixChart`, `ProfitabilityClassificationTable`, `ProductProfitabilityTable`, `DataTable` | Filter date range, compare periods, search dishes, sort by revenue/cost/margin %, paginate dish list | `src/lib/data/products.ts`, `src/lib/data/sales.ts`, `src/lib/data/sale-items.ts`, `src/lib/analytics/profitability.ts` | **Implemented** (Server-rendered, read-only analytics) |
| `/dashboard/wastage` | Wastage & Preparation (`src/app/dashboard/wastage/page.tsx`) | Food waste auditing and prep-vs-sold analysis | Headline KPIs (Total Wastage Cost, Wasted Qty, Prep Qty, Waste %, Items Tracked), Prepared vs Sold Trend, Wastage by Product, Wastage by Reason, Food Prep vs Wastage Details, Interactive Wastage Records Table | `MetricCard`, `PreparedVsSoldTrendChart`, `WastageByProductChart`, `WastageByReasonChart`, `FoodPrepWastageChart`, `WastageDetailTable`, `WastageRecordsSection` | Date range filter, compare periods, **Add Wastage**, **Edit Wastage**, **View Wastage Detail**, **Delete Wastage** (local UI state) | Analytics: `src/lib/data/wastage.ts`, `src/lib/data/preparation.ts`. Local CRUD: React `useState` | **Implemented** (Analytics read-only; CRUD actions operate in local UI state prototype) |
| `/dashboard/manpower` | Manpower & Staffing (`src/app/dashboard/manpower/page.tsx`) | Labor attendance, department staffing vs benchmarks, labor cost | Headline KPIs (Total Employees, Present, Absent, Leave, Attendance %, Monthly Labor Cost), Attendance Trend Chart, Department Headcount Chart, Actual vs Benchmark Chart, Department Staffing Detail Table | `MetricCard`, `AttendanceTrendChart`, `DepartmentHeadcountChart`, `ActualVsBenchmarkChart`, `DepartmentStaffingTable`, `DataTable` | Date range filter (for attendance), compare periods, search department table, sort variance/costs | `src/lib/data/employees.ts`, `src/lib/data/departments.ts`, `src/lib/data/attendance.ts`, `src/lib/analytics/manpower.ts` | **Implemented** (Server-rendered, read-only analytics) |
| `/dashboard/breakage` | Tableware Breakage (`src/app/dashboard/breakage/page.tsx`) | Crockery, glassware, and equipment damage tracking | Headline KPIs (Total Breakage Cost, Items Broken, Top Broken Item, Impacted Depts), Breakage by Department Chart, Breakage by Item Chart, Breakage Detail Table, Interactive Breakage Records Table | `MetricCard`, `BreakageByDepartmentChart`, `BreakageByItemChart`, `BreakageDetailTable`, `BreakageRecordsSection` | Date range filter, compare periods, **Add Breakage**, **Edit Breakage**, **View Detail**, **Delete Breakage** (local UI state) | Analytics: `src/lib/data/breakage.ts`, `src/lib/analytics/breakage.ts`. Local CRUD: React `useState` | **Implemented** (Analytics read-only; CRUD actions operate in local UI state prototype) |
| `/dashboard/reports` | Management Reports (`src/app/dashboard/reports/page.tsx`) | Formal printable/exportable operational and executive summaries | Executive Summary, Sales & Revenue Summary, Profitability & Margin Summary, Operations & Labor Summary, High Sales / Low Margin Product List, Highest Food Cost Product List | `PageContainer`, `ReportComparisonTable`, `ReportProductLists`, `ReportExportControls` | Date range selection, period comparison, **Export CSV** (genuine client-side CSV download), **Print** (triggers `window.print()`), **Export PDF** (toast prototype) | Aggregates all analytics modules (`sales`, `profitability`, `attendance`, `breakage`, `wastage`, `operating-costs`) | **Implemented** (CSV export & Print functional; PDF export is UI stub) |
| `/api/webhooks/petpooja` | Webhook Receiver Route (`src/app/api/webhooks/petpooja/route.ts`) | Ingests real-time POS "orderdetails" pushes | GET: Health check & diagnostic status (`{"status":"ready"}`). POST: Ingests raw payload, validates signature/token, and persists to Supabase staging | Next.js App Router Route Handler (Node.js runtime) | GET health query, POST webhook ingestion | Live Supabase table `public.petpooja_webhook_events` | **Implemented** (Deployed & verified in production) |

---

## 3. Component & Action Inventory

| Component File Path | Component Name | Action Category | Trigger Element | Actual Underlying Behavior | Functional Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src/components/layout/date-range-control.tsx` | `DateRangeControl` | Filter | Popover / Calendar & Quick Preset Buttons (`7d`, `30d`, `90d`) | Updates URL search parameters (`?from=...&to=...&preset=...`) triggering server re-render | **100% Functional** |
| `src/components/layout/comparison-control.tsx` | `ComparisonControl` | Filter | Dropdown Menu (`None`, `Previous Period`) | Updates URL search parameters (`?comparison=previous`) triggering server re-render | **100% Functional** |
| `src/components/layout/header.tsx` | `Header` / Mobile Menu | Navigation | Hamburger Button | Opens responsive slide-out `Sheet` navigation drawer on mobile | **100% Functional** |
| `src/components/layout/notification-center.tsx` | `NotificationCenter` | View / Mark Read | Bell Icon Button / Dropdown | Opens dropdown showing demo attention alerts; "Mark all as read" toggles local React state | **Partially Functional** (UI state only; alerts are demo items, not dynamic DB alerts) |
| `src/components/layout/user-menu.tsx` | `UserMenu` | Account Actions | Avatar Button / Dropdown | Clicking "Profile", "Settings", or "Logout" triggers an informational toast message | **UI Only / Prototype** (No auth/session backend connected) |
| `src/components/dashboard/data-table.tsx` | `DataTable` | View / Search / Sort / Paginate | Search Input, Column Header Clicks, Prev/Next Buttons | Client-side fuzzy text filtering, multi-type ascending/descending sorting, and page slicing | **100% Functional** |
| `src/components/dashboard/wastage-records-table.tsx` | `WastageRecordsSection` | Create | Button "+ Add Wastage Record" | Opens `WastageFormDialog`, validates inputs via Zod, appends record to React `useState` array, shows success toast | **Functional in Memory** (Lost on page refresh; no backend API) |
| `src/components/dashboard/record-actions.tsx` | `RecordActions` | View Details | "View" Dropdown Item | Opens `RecordDetailDialog` displaying read-only modal with record fields | **Functional in Memory** |
| `src/components/dashboard/record-actions.tsx` | `RecordActions` | Edit | "Edit" Dropdown Item | Opens form dialog pre-filled with record data; updates item in React `useState` array | **Functional in Memory** |
| `src/components/dashboard/record-actions.tsx` | `RecordActions` | Delete | "Delete" Dropdown Item | Opens `ConfirmDialog` warning modal; on confirmation, removes item from React `useState` | **Functional in Memory** |
| `src/components/dashboard/breakage-records-table.tsx` | `BreakageRecordsSection` | Create / Edit / View / Delete | Buttons & `RecordActions` dropdown | Manages local breakage additions, edits, and deletions via React `useState` | **Functional in Memory** (Lost on page refresh; no backend API) |
| `src/components/dashboard/report-export-controls.tsx` | `ReportExportControls` | Export CSV | "Export CSV" Button | Generates standard CSV string from aggregated summary rows in memory, creates `Blob`, and triggers browser download | **100% Functional** |
| `src/components/dashboard/report-export-controls.tsx` | `ReportExportControls` | Print | "Print" Button | Calls native browser `window.print()` using print CSS media queries | **100% Functional** |
| `src/components/dashboard/report-export-controls.tsx` | `ReportExportControls` | Export PDF | "Export PDF" Button | Shows toast: *"PDF export is not connected yet"* | **UI Only / Prototype** (Pending PDF generation service) |

---

## 4. Module-by-Module Audit & Manpower Clarification

### 4.1 Audit of Manpower vs Actual Employee Management
- **Current Manpower Page (`/dashboard/manpower`):**
  - Displays attendance rates, present/absent counts, headcount versus benchmark, and estimated monthly labor cost derived from `mock_data/attendance.json` and `mock_data/employees.json`.
  - **Does not contain:** Employee profile creation, editing, salary modification, department creation, or attendance marking forms.
- **Clarification:**
  - Manpower is currently an **analytical read-only reporting screen** built on mock data.
  - Per confirmed business requirements, attendance marking/scheduling is **out of scope**.
  - Access to `/dashboard/manpower` will be restricted **exclusively to Admin**.
  - A separate, simple Employee Master management interface (viewing and editing the staff list) will be planned for the **Admin** role under `/dashboard/settings/staff`.

---

## 5. Revised RBAC Permission Matrix & Route Access

### 5.1 Route Access Control Matrix

| Route Path | Navigation Label | Admin Access | Manager Access | Operator Access | Enforcement Mechanism |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `/login` | Login | Yes | Yes | Yes | Public authentication route |
| `/dashboard` | Executive Dashboard | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Server Component session check + Middleware |
| `/dashboard/sales` | Sales Analytics | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Server Component session check + Middleware |
| `/dashboard/profitability` | Profitability | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Server Component session check + Middleware |
| `/dashboard/wastage` | Wastage & Preparation | **Allow (Org or Outlet)** | **Allow (Assigned Outlet)** | **Block (Redirect to `/operator/entry`)** | Server Component session check + Middleware |
| `/dashboard/breakage` | Breakage | **Allow (Org or Outlet)** | **Allow (Assigned Outlet)** | **Block (Redirect to `/operator/entry`)** | Server Component session check + Middleware |
| `/dashboard/manpower` | Manpower | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Server Component session check + Middleware |
| `/dashboard/reports` | Reports | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Server Component session check + Middleware |
| `/dashboard/settings/staff` | Staff List (Master) | **Allow (Org or Outlet)** | **Block (403/Redirect)** | **Block (403/Redirect)** | Admin-only HR master screen |
| `/operator/entry` | Operational Entry | **Allow (Any Outlet)** | **Allow (Assigned Outlet)** | **Allow (Assigned Outlet)** | **Dedicated simplified Operator entry interface** |

### 5.2 Granular Action-Level Permissions

| Domain / Resource | Specific Action | Admin | Manager | Operator | Behavioral Specification & Guardrails |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Authentication** | Sign in to assigned role account | Yes | Yes | Yes | User accounts with assigned outlet mappings |
| **Executive Overview** | View revenue, margin, costs | Yes | No | No | Strictly Admin; Org-wide or per outlet |
| **Sales Analytics** | View sales, orders, AOV, channels | Yes | No | No | Strictly Admin; Org-wide or per outlet |
| **Profitability** | View recipe costs, margins %, BOM | Yes | No | No | Strictly Admin; proprietary business metrics |
| **Wastage Analytics** | View wastage charts & trends | Yes | Yes | No | Manager and Admin analyze kitchen prep waste |
| **Wastage Entry** | Submit new wastage record | Yes | Yes | **Yes** | Operator submits food waste via simplified form |
| **Wastage Management**| Edit / Delete existing records | Yes | **Yes** | **No** | Operator cannot alter submitted records |
| **Breakage Analytics** | View breakage charts & trends | Yes | Yes | No | Manager and Admin analyze tableware loss |
| **Breakage Entry** | Submit new breakage record | Yes | Yes | **Yes** | Operator logs broken items via simplified form |
| **Breakage Management**| Edit / Delete existing records | Yes | **Yes** | **No** | Operator cannot alter submitted records |
| **Manpower Analytics** | View labor headcount/costs | Yes | No | No | Strictly Admin |
| **Staff Master List** | View/Add/Edit Employee records | Yes | No | No | Strictly Admin (HR staff directory per outlet) |
| **Reports & Exports** | View reports, Export CSV, Print | Yes | No | No | Strictly Admin |

---

## 6. Application Account Structure vs Employee Master

The business requires exactly **three application logins** while maintaining an employee directory for staff details. The relational architecture reflects this complete separation:

```
┌────────────────────────────────────────────────────────┐
│               public.organizations                     │
├────────────────────────────────────────────────────────┤
│ id: UUID (PK) -> 'Ashirvad Gulmohar'                   │
│ name: TEXT                                             │
│ code: TEXT -> 'AG'                                     │
└────────────────────────────────────────────────────────┘
                          │ 1:N
                          ▼
┌────────────────────────────────────────────────────────┐
│                  public.outlets                        │
├────────────────────────────────────────────────────────┤
│ id: UUID (PK)                                          │
│ organization_id: UUID (FK)                             │
│ code: TEXT (Unique) -> 'KOZ-001', 'KOZ-002', 'BLR-001' │
│ name: TEXT                                             │
│ city: TEXT (Informational attribute, e.g. 'Kozhikode') │
│ petpooja_rest_id: TEXT (Unique, Nullable)              │
│ is_active: BOOLEAN                                     │
└────────────────────────────────────────────────────────┘
          ▲                                    ▲
          │ 1:N                                │ 1:N
┌───────────────────────────────┐    ┌──────────────────────────────────┐
│ public.user_outlet_assignments│    │       public.employees           │
├───────────────────────────────┤    │  (Physical Restaurant Master)    │
│ id: UUID (PK)                 │    ├──────────────────────────────────┤
│ user_id: UUID (FK)            │    │ id: UUID (PK)                    │
│ outlet_id: UUID (FK)          │    │ outlet_id: UUID (FK)             │
│ is_default: BOOLEAN           │    │ employee_id: TEXT (e.g. 'E001')  │
└───────────────────────────────┘    │ name: TEXT (e.g. 'Arun 1')       │
          ▲                          │ role: TEXT ('Cook', 'Steward')   │
          │ N:1                      │ monthly_salary: NUMERIC(12, 2)   │
┌───────────────────────────────┐    │ employment_status: TEXT          │
│     public.user_accounts      │    └──────────────────────────────────┘
├───────────────────────────────┤
│ id: UUID (PK)                 │
│ username: TEXT (Unique)       │
│ role: TEXT ('admin',          │
│       'manager', 'operator')  │
│ is_active: BOOLEAN            │
└───────────────────────────────┘
```

### Architectural Distinctions:
1. **Application Accounts (`user_accounts` & `user_outlet_assignments`):**
   - Stores login users with assigned roles (`admin`, `manager`, `operator`).
   - Managers and Operators are linked to their authorized `outlet_id`(s) via `user_outlet_assignments`.
   - Admin has implicit organization-wide access to all outlets.
   - Employees do **not** have individual login rows in this table.
2. **Employees Directory (`employees`):**
   - The restaurant's physical staff list, scoped to an `outlet_id`, pre-seeded from `mock_data/employees.json`.
   - Managed exclusively by the **Admin** role for organizational record-keeping.
   - Completely decoupled from application authentication and carries zero passwords or tokens.

---

## 7. Dedicated Simplified Operator Interface (`/operator/entry`)

Per confirmed requirement, Operator must **not** be given the Manager page with hidden charts, as Server Components or Client Component props could still leak analytical summaries, cost estimates, or aggregate figures over the network.

### Specification of `/operator/entry`:
- **Route:** `/operator/entry`
- **Shell:** Minimalist mobile/tablet-friendly layout without the executive sidebar.
- **Header:** Displays simple branding ("Gulmohar Operations"), outlet badge (`KOZ-001`), current date, active role badge ("Operator"), and a Logout button.
- **Content:**
  - Tab 1: **Log Food Wastage**
    - Clean form: Date (defaults to today), Product selector (dish name), Prepared Quantity, Wasted Quantity, Reason dropdown, optional Notes.
    - **No financial values:** Food cost (₹) and estimated wastage cost (₹) are **completely omitted** from the Operator form and props.
    - Submit button: Sends POST request to `/api/operations/wastage`.
  - Tab 2: **Log Tableware Breakage**
    - Clean form: Date (defaults to today), Item selector, Department dropdown, Broken Quantity, Reason dropdown.
    - **No financial values:** Replacement cost (₹) is **completely omitted**.
    - Submit button: Sends POST request to `/api/operations/breakage`.
- **Recent Submissions Banner:**
  - Displays a simple read-only list of records submitted during the current shift (Item Name, Quantity, Timestamp) with status "Submitted".
  - **No edit or delete buttons** are rendered for the Operator role.

---

## 8. Revised Navigation Structure by Role

### Admin Navigation Menu:
- **Main:** Executive Dashboard (`/dashboard`), Sales Analytics (`/dashboard/sales`), Profitability (`/dashboard/profitability`)
- **Operations:** Wastage & Preparation (`/dashboard/wastage`), Breakage (`/dashboard/breakage`), Manpower (`/dashboard/manpower`)
- **Reports:** Management Reports (`/dashboard/reports`)
- **Administration:** Staff List (`/dashboard/settings/staff`)
*(Outlet selector allows toggling between All Outlets or a specific outlet).*

### Manager Navigation Menu:
- **Operations:**
  - Wastage & Preparation (`/dashboard/wastage`) — full analytics and record management for assigned outlet
  - Tableware Breakage (`/dashboard/breakage`) — full analytics and record management for assigned outlet
*(All other routes hidden and blocked at middleware/server level. If assigned to one outlet, auto-scoped; if multiple, dropdown of authorized outlets only).*

### Operator Navigation Menu:
- Direct landing on `/operator/entry` (Single-purpose operational portal; sidebar navigation disabled).

---

## 9. Security Enforcement Architecture

1. **Edge Middleware (`src/middleware.ts`):**
   - Verifies the encrypted session cookie on all requests matching `/dashboard/*` and `/operator/*`.
   - Redirects unauthenticated users to `/login`.
   - If `role === 'operator'` and URL begins with `/dashboard/*`, redirects to `/operator/entry`.
   - If `role === 'manager'` and URL is not `/dashboard/wastage` or `/dashboard/breakage`, returns HTTP 403 or redirects to `/dashboard/wastage`.
2. **Server Component & Route Handler Guards:**
   - Every page component and Server Action inspects `await getSession()` and dynamically resolves authorized outlet scope against PostgreSQL authority via `resolveAuthorizedOutletScope(session.userId, requestedOutletId)`.
   - Managers may have multiple outlet assignments; the server validates the requested outlet against their live database assignments. It never assumes `assignedOutletIds[0]`.
   - Dedicated Operator mutation API routes (`/api/operations/wastage`, `/api/operations/breakage`):
     - Accept only permitted operational fields (date, item, quantity, reason, notes).
     - Financial costs (`unit_food_cost`, `estimated_cost`, `unit_cost`, `total_cost`) are strictly computed on the server and never accepted from the client.
     - Operational records strictly attribute `recorded_by_id` as a foreign key to `user_accounts.id`.
     - The shared Operator account represents the terminal login, not an arbitrary individual employee.
   - Management mutation routes (PUT/DELETE on wastage/breakage records) validate `session.role in ['admin', 'manager']` and verify outlet authority against PostgreSQL.
3. **Session Management:**
   - Cookie-based session using signed, HTTP-only, `SameSite=Lax`, `Secure` cookies containing `userId` and `role`. Authoritative outlet permissions are resolved live from PostgreSQL on the server rather than relying on stale cookie state.

---

## 10. Audit Requirements Reference Prompt (Preserved)

The original prompt and task requirements governing this revision are preserved below for traceability:

```text
# Antigravity Task: Revise Gulmohar RBAC Plan Based on Confirmed Business Requirements

1. Application login structure: Exactly three role types and three application logins (Admin, Manager, Staff). Employee records and user accounts remain separate.
2. Admin permissions: Complete application access across business dashboard, sales, profitability, wastage, breakage, manpower, reports, staff management, and user management.
3. Manager permissions: Operational wastage and breakage management only. Prohibited from overall dashboard, sales, profitability, food costs, manpower, reports, and staff management.
4. Staff permissions: Operational data-entry role only for wastage and breakage. Prohibited from analytical charts, overall dashboard, sales, profitability, manpower, reports, and staff management. Cannot edit or delete submitted records. Dedicated simplified Staff interface.
5. Staff / employee management: Admin manages employee master list based on existing mock data fields (employee_id, name, department_id, role, monthly_salary, employment_status). No logins per employee.
6. Attendance: No requirement for marking, entry, approval, shift scheduling, or biometric integration. Existing Manpower page kept available to Admin only.
7. Navigation and route permissions: Clear role matrix for routes and APIs with frontend navigation and server-side authorization.
```

---

## 11. Implementation Status & Phase 1 Verification

### Phase 1 Implementation & Security Hardening Complete (November 12, 2026)
Phase 1 of the Authentication and RBAC architecture has been implemented, hardened against verification audit findings, tested, and verified on PostgreSQL:

1. **Authentication Engine:**
   - **Argon2id Hashing:** `src/lib/auth/password.ts` using memory cost 19456 KiB, time cost 2 iterations, parallelism 1, generating secure PHC-formatted strings.
   - **Durable Server-Side Session Validation & Revocation:** `src/lib/auth/session.ts` and `src/lib/auth/scope.ts`. Session payloads are sealed with HMAC-SHA256, but authenticated requests strictly validate the session against the `user_sessions` PostgreSQL table using a SHA-256 hash of the token. Stolen or copied tokens cannot authenticate after logout, as logout marks `revoked_at = NOW()`.
   - **Persistent Rate Limiting:** `src/lib/auth/rate-limit.ts` storing attempt history in PostgreSQL (`login_attempts` table). Rate limits on both client IP (`ip:<address>`) and normalized username (`user:<username>`), providing resilience across restarts and clustering while preventing DoS lockouts.
   - **Route Handlers:** `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me`.
   - **Edge Protection:** `src/middleware.ts` intercepting `/dashboard/*` and `/operator/*`.

2. **Multi-Outlet Authorization Scope:**
   - Multi-outlet resolution in `src/lib/auth/scope.ts` dynamically verifies access against PostgreSQL (`user_outlet_assignments` and `outlets`).
   - Admin access can be consolidated or outlet-specific.
   - Manager access is strictly checked against assigned outlets (e.g. `KOZ-001`, `KOZ-002`).
   - Operator access is locked to their designated outlet floor terminal.

3. **Production-Safe Development Seeding:**
   - `prisma/seeds/seed.dev.ts` includes strict guards refusing execution if `NODE_ENV === "production"`.
   - Fallback/default passwords removed; requires explicit `DEV_*_PASSWORD` environment variables.

4. **Multi-Tier Automated & Runtime Verification:**
   - **Unit / Logic Tests (`prisma/seeds/test-auth.ts`):** 12/12 passing tests verifying token hash creation, session expiration, inactive user rejection, and seed guards.
   - **Database Runtime Tests (`prisma/seeds/verify-runtime.ts`):** 17/17 passing assertions verifying direct PostgreSQL reads/writes, revocation isolation, and persistent rate-limiting table updates.
   - **Actual HTTP Endpoint Tests (`prisma/seeds/verify-http-endpoints.ts`):** 31/31 passing assertions testing real HTTP calls against `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`, verifying `Set-Cookie` flags (`HttpOnly`, `SameSite=Lax`), concurrent multi-device session isolation, 401 rejections on revoked token replay, and HTTP 429 lockout responses.

5. **Operator Persistence & Cost Engine Implementation (November 13, 2026):**
   - **Operator APIs Implemented:** `POST /api/operator/wastage`, `POST /api/operator/breakage`, and `GET /api/operator/meta`.
   - **Server-Side Financial Security:** Food costs and replacement costs are strictly calculated on the server; client-provided financial fields or attempted outlet overrides are completely ignored.
   - **NULL-Cost Policy Respected:** When a product's ingredient cost is unknown, `unitFoodCost` and `estimatedCost` store `NULL` (never assumed zero).
   - **Cross-Outlet Integrity:** Department and outlet associations are validated against the operator's assigned outlet in PostgreSQL.
   - **Floor UI Connected:** `src/components/operator/operator-portal.tsx` connected to actual API endpoints with loading spinners, error toasts, and active session history (append-only, zero charts, no financial metrics).
   - **HTTP Verification (`prisma/seeds/verify-operator-api.ts`):** 28/28 assertions passed covering authenticated submissions, server cost computation, NULL-cost policy, validation, tampering rejection, and 403 non-operator blocking.
   - Production build (`npm run build`) and ESLint (`npm run lint`) pass with 0 errors.

6. **Manager Module & Dashboard PostgreSQL Integration (November 13, 2026):**
   - **Header Outlet Selector (`src/components/layout/outlet-selector.tsx`):** Added to top navigation bar. Automatically reads user's role and assigned outlets from `/api/dashboard/outlets`. Renders static badge for single-outlet managers, interactive dropdown for multi-outlet managers (switching between assigned outlets), and full list + consolidated option for Admins. Operators are hidden from this selector.
   - **Manager Wastage CRUD (`/api/dashboard/wastage`):** Full GET, POST, PUT, DELETE implementation. Recalculates cost strictly server-side using `product.food_cost`. Follows strict NULL-cost policy. Validates outlet ownership and blocks unauthorized outlet switching.
   - **Manager Tableware Breakage CRUD (`/api/dashboard/breakage`):** Full GET, POST, PUT, DELETE implementation. Scopes departments to authorized outlet. Client-supplied costs are strictly ignored. Due to the absence of a tableware replacement master catalog in the database schema, unit and total costs are stored as `NULL` (strict NULL-cost policy; no invented baselines or hardcoded fallbacks). Recomputation on update only evaluates existing non-null costs.
   - **Client Tables Integrated with PostgreSQL:** `src/components/dashboard/wastage-records-table.tsx` and `src/components/dashboard/breakage-records-table.tsx` updated to fetch live records from Route Handlers and submit create/edit/delete requests with toast notifications. Breakage UI cleanly formats null costs with a neutral dash (`—`).
   - **Role Isolation:** Operators are strictly forbidden from all Manager CRUD endpoints (HTTP 403). Managers are restricted to their assigned outlets (cross-outlet queries/mutations return HTTP 403).
   - **HTTP Integration Verification (`prisma/seeds/verify-manager-api.ts`):** 46/46 assertions passed covering single-outlet auto-selection, multi-outlet switching, unassigned outlet 403 rejection, Operator 403 blocking, server-side food cost calculations, NULL-cost policy compliance for both wastage and breakage, client cost injection rejection, and full CRUD operations.
   - Verified with Next.js Turbopack build (`npm run build`) and ESLint (`npm run lint`) passing with 0 errors.

7. **Admin Module — Master Data Management (November 14, 2026):**
   - **Admin Navigation & Middleware Route Guard:** `/dashboard/master-data` added to navigation for Admins only. Next.js edge middleware (`src/middleware.ts`) blocks Managers and Operators, redirecting web requests and returning HTTP 403 on `/api/admin/*` API calls.
   - **Departments API (`/api/admin/departments`):** Admin CRUD with tenant organization scoping, benchmark headcount, unique code enforcement (HTTP 409), and soft deactivation (`is_active: false`) to safeguard referential integrity with wastage/breakage history.
   - **Products API (`/api/admin/products`):** Admin catalog management with category validation, preparation type, food cost handling, and outlet-level overrides via `OutletProductSetting`. Strictly adheres to the **NULL-cost policy** (omitted food cost stored as `NULL`, never 0).
   - **Ingredients API (`/api/admin/ingredients`):** Admin raw material CRUD with unit of measure, unit cost tracking, and active status flag.
   - **Recipe Mapping API (`/api/admin/recipes`):** Component association linking products to ingredients with `quantityPerUnit` via `recipe_items`. Safely adds and removes recipe items without automatic stock deduction or premature inventory side effects.
   - **Master Data UI (`/dashboard/master-data`):** Server Component with client tabs for Departments, Menu & Products, Ingredients, and Recipe Mapping, built using shadcn/ui components, search filters, and dialog forms.
   - **Database Migration:** Applied non-destructive migration `20261114074821_add_is_active_to_department_and_ingredient` adding `is_active` to `departments` and `ingredients`.
   - **HTTP Integration Verification (`prisma/seeds/verify-admin-master-data.ts`):** 41/41 passing assertions verifying:
     - 403 Forbidden rejection for Managers and Operators on all admin endpoints.
     - Foreign outlet department rejection (HTTP 400).
     - Department CRUD, duplicate code handling (HTTP 409), and active toggle.
     - Product CRUD, NULL-cost verification, duplicate code rejection, and outlet-specific override creation.
     - Ingredient CRUD, unit cost update, and duplicate code rejection.
     - Recipe component mapping, lookup, and safe deletion.
   - **Regression Verification:** Manager API test suite (46/46 passing) and Operator API test suite (28/28 passing) executed cleanly.
   - **Code Quality & Build:** ESLint passed with 0 errors / 0 warnings; Next.js Turbopack build passed cleanly with all 28 routes compiled.

8. **Overall Phase 1 Integration Audit (November 14, 2026):**
   - **Role Workflows:** Verified end-to-end for Admin, Manager, and Operator. All 8 core views (`/dashboard`, `/dashboard/sales`, `/dashboard/profitability`, `/dashboard/wastage`, `/dashboard/breakage`, `/dashboard/manpower`, `/dashboard/reports`, `/dashboard/master-data`, and `/operator/entry`) load with zero runtime errors.
   - **Reports & Exporting:** Verified Reports page CSV export triggers work cleanly without client crashes.
   - **Multi-Tier Automated Test Pass Rate:**
     - HTTP Auth Endpoints: **31 / 31 passing**
     - Operator Module API: **28 / 28 passing**
     - Manager Module API: **46 / 46 passing**
     - Admin Master Data API: **41 / 41 passing**
     - Overall Browser Smoke & Workflow Audit: **32 / 32 passing**
     - Total: **178 passing assertions, 0 failures, 0 blockers**.
   - **Production Readiness:** Prisma schema valid (`The schema at prisma\schema.prisma is valid`), ESLint 0 errors / 0 warnings, Next.js Turbopack build passes cleanly (`✓ Compiled successfully`).

---

## 12. Summary of Updated Documentation & Decisions

### Documentation Files Updated:
1. **[`docs/rbac-audit-and-plan.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/rbac-audit-and-plan.md):** Fully revised with confirmed business rules, three-login architecture, simplified Staff interface specification, and removal of attendance scope.
2. **[`docs/architecture.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/architecture.md):** Synchronized Section 9 to reflect the 3-login structure, Manager loss-management boundaries, and the `/staff/entry` interface.

### Important Architectural Distinctions Established:
- **No employee credential explosion:** Exactly 3 role logins (`admin`, `manager`, `staff`).
- **Zero data leakage to Staff:** Staff uses `/staff/entry`, ensuring financial metrics, food costs, and executive charts never touch Staff client bundles.
- **Attendance out of scope:** No unnecessary biometric, scheduling, or attendance marking complexity introduced.

### Git Status Check:
- Documentation updated cleanly in `docs/rbac-audit-and-plan.md` and `docs/architecture.md`.
- No application source code, mock data, or database migrations were created or modified.
- Ready for management sign-off before Phase 1 implementation.
