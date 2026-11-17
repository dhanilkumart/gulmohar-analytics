# Gulmohar Analytics – Final Multi-Outlet Architecture & Database Readiness Audit

**Document Type:** Final Architecture Checkpoint & System Design Specification
**Status:** Approved Architecture Specification (Documentation Only – Prior to Implementation)
**Date:** November 11, 2026
**Target Organization:** Ashirvad Gulmohar
**Target Roles:** Admin, Manager, Operator

---

## 1. Executive Summary & Prompt Reference

This document serves as the final, authoritative architecture specification for the Gulmohar Analytics platform prior to database migration and application implementation. It refines the previous audit with latest management decisions and technical guardrails.

### Antigravity Task Prompt Reference:
```text
# Gulmohar Analytics – Final Multi-Outlet Architecture Refinement

1. Confirmed Business Decisions:
- Organization & Outlets: One organization (Ashirvad Gulmohar), multiple outlets. Permanent UUID and unique human-readable outlet code. City is an attribute, not an identifier. Multiple outlets can exist in the same city.
- Roles:
  * Admin: Organization-wide access to all outlets, full access to all modules, manages employees, user accounts, and outlets.
  * Manager: Can be assigned to multiple outlets, switch between assigned outlets, access wastage & breakage dashboards, charts, records, and management actions for assigned outlets only. Cannot access sales, profitability, manpower, overall dashboard, or user management.
  * Operator: One shared Operator login per outlet initially, dedicated simplified entry interface, add wastage and breakage records for assigned outlet only. Cannot access analytics, charts, financial info, or edit/delete records. Database must not impose a permanent one-account-per-outlet limit.
- Employee Master: Separate from application logins, managed by Admin, no automatic credentials, no attendance/biometrics/shifts.
- Menu and Recipes: One shared organization-level product/menu and recipe master. Outlets can have selling-price and availability overrides. Do not duplicate master catalogs per outlet.
- Database: Local PostgreSQL via Docker Compose + Prisma Migrate. Local test data stays local. Production PostgreSQL on Hostinger KVM2 VPS using same Prisma migration history. Production org, outlets, and Admin provisioned separately. Never import test records to production.

2. Required Technical Corrections:
- Petpooja mapping: restID 53qcgrdis8 belongs to Petpooja_Rider_Testing (NOT confirmed for Gulmohar). Keep petpooja_rest_id nullable. Map production outlets only after Petpooja confirms actual IDs. POS IDs remain separate from outlet UUIDs.
- User outlet authorization: Managers have multiple outlet assignments. Do not rely on assignedOutletIds[0]. For every request, resolve current role and assignments from DB on the server, validate requested outlet, apply scope to reads/writes/deletes, never trust browser. Admin has access to all outlets.
- Employee & department relationship: Relational relationship rather than arbitrary string. Departments are outlet-specific, allowing outlets to maintain their own department structures. No attendance functionality.
- Operational record attribution: Wastage and breakage records contain outlet relation, authenticated user reference (recorded_by FK to UserAccount, not arbitrary text or employee). Shared operator login identifies operator account. Operator APIs accept permitted fields only; costs not controlled by client.
- Shared menu & recipe architecture: Minimum org-level menu & recipe structure with outlet-specific price/availability overrides. Food-cost & profitability rules intact.
```

---

## 2. Organization and Outlet Hierarchy

The business hierarchy enforces a clean separation between the enterprise legal entity, physical premises, and geographical attributes:

```
┌────────────────────────────────────────────────────────┐
│              Organization: Ashirvad Gulmohar           │
│  - id: UUID (Permanent Primary Key)                    │
│  - code: "AG"                                          │
│  - name: "Ashirvad Gulmohar Restaurant"                │
└──────────────────────────┬─────────────────────────────┘
                           │ 1:N
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Outlet    │    │    Outlet    │    │    Outlet    │
│   KOZ-001    │    │   KOZ-002    │    │   BLR-001    │
├──────────────┤    ├──────────────┤    ├──────────────┤
│ Kozhikode 1  │    │ Kozhikode 2  │    │ Bangalore 1  │
│ City: Kozh.  │    │ City: Kozh.  │    │ City: Bang.  │
│ POS: Pending │    │ POS: Pending │    │ POS: Pending │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Key Structural Rules:
1. **Permanent UUIDs:** All database foreign keys reference internal UUIDs (`gen_random_uuid()`), never city names, codes, or POS IDs.
2. **Human-Readable Outlet Codes:** `code` is a business-friendly unique constraint (e.g. `KOZ-001`, `KOZ-002`, `BLR-001`) used in UI displays, report exports, receipt badges, and terminal configs.
3. **City as Attribute:** `city` (e.g. `"Kozhikode"`, `"Bangalore"`) is an informational string column on `outlets`. It is **never** a primary key or unique identifier. Multiple distinct outlets can coexist in the same city.
4. **Active Status:** Outlets have `is_active: BOOLEAN DEFAULT true` to allow soft-deactivation without cascading deletion of historical data.

---

## 3. Final Database Entities and Relational Architecture

The relational architecture is modeled for Prisma ORM with PostgreSQL. It eliminates duplication by hoisting products, categories, ingredients, and recipes to the organization level while allowing outlet-level pricing, availability, and department customization.

```
                   ┌───────────────────────────────────┐
                   │           organizations           │
                   └─┬───────────────┬─────────────────┘
                     │ 1:N           │ 1:N
                     ▼               ▼
         ┌───────────────────┐     ┌───────────────────────────────────┐
         │      outlets      │     │  categories / products / recipes  │
         └─┬───────┬───────┬─┘     └─┬─────────────────────────────────┘
           │       │       │         │ (Shared Org Master)
           │ 1:N   │ 1:N   │ 1:N     │
           │       │       │         ▼
           │       │       │       ┌───────────────────────────────────┐
           │       │       └──────►│     outlet_product_settings       │
           │       │               │ (Outlet Selling Price & Avail.)   │
           │       │               └───────────────────────────────────┘
           │       │ 1:N
           │       └──────────────►┌───────────────────────────────────┐
           │                       │            departments            │
           │                       └─┬─────────────────────────────────┘
           │ 1:N                     │ 1:N
           │                         ▼
           │                       ┌───────────────────────────────────┐
           ├──────────────────────►│             employees             │
           │                       │   (Staff HR Master - No Logins)   │
           │                       └───────────────────────────────────┘
           │ 1:N
           ├──────────────────────►┌───────────────────────────────────┐
           │                       │  wastage_records / breakage_rec.  │
           │                       │ (recorded_by -> user_accounts.id) │
           │                       └───────────────────────────────────┘
           │ 1:N
           └──────────────────────►┌───────────────────────────────────┐
                                   │     sales_orders & items          │
                                   └───────────────────────────────────┘
```

### Complete Prisma Reference Specification:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// =============================================================================
// 1. Organization & Outlet Core
// =============================================================================

model Organization {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code      String   @unique // e.g. "AG"
  name      String   // e.g. "Ashirvad Gulmohar"
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlets      Outlet[]
  users        UserAccount[]
  categories   Category[]
  products     Product[]
  ingredients  Ingredient[]

  @@map("organizations")
}

model Outlet {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  code           String   @unique // e.g. "KOZ-001", "KOZ-002", "BLR-001"
  name           String   // e.g. "Ashirvad Gulmohar - Kozhikode 1"
  city           String   // Informational: e.g. "Kozhikode"
  address        String?
  timezone       String   @default("Asia/Kolkata")
  petpoojaRestId String?  @unique @map("petpooja_rest_id") // Nullable, verified production ID only
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization    Organization            @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  userAssignments UserOutletAssignment[]
  departments     Department[]
  employees       Employee[]
  productSettings OutletProductSetting[]
  wastageRecords  WastageRecord[]
  breakageRecords BreakageRecord[]
  salesOrders     SalesOrder[]

  @@index([organizationId])
  @@map("outlets")
}

// =============================================================================
// 2. Authentication & Outlet Assignments
// =============================================================================

enum AppRole {
  ADMIN    @map("admin")
  MANAGER  @map("manager")
  OPERATOR @map("operator")
}

model UserAccount {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  username       String   @unique // e.g. "admin", "mgr-kozhikode", "op-koz-001"
  passwordHash   String   @map("password_hash")
  role           AppRole
  displayName    String   @map("display_name")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization      Organization           @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  outletAssignments UserOutletAssignment[]
  recordedWastage   WastageRecord[]        @relation("WastageRecordedBy")
  recordedBreakage  BreakageRecord[]       @relation("BreakageRecordedBy")

  @@index([organizationId])
  @@map("user_accounts")
}

model UserOutletAssignment {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  outletId  String   @map("outlet_id") @db.Uuid
  isDefault Boolean  @default(false) @map("is_default")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  user   UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)
  outlet Outlet      @relation(fields: [outletId], references: [id], onDelete: Cascade)

  @@unique([userId, outletId])
  @@index([userId])
  @@index([outletId])
  @@map("user_outlet_assignments")
}

// =============================================================================
// 3. Outlet-Specific Departments & Employee Master (Decoupled from Users)
// =============================================================================

model Department {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId           String   @map("outlet_id") @db.Uuid
  departmentCode     String   @map("department_code") // e.g. "D01", "D02"
  name               String   // e.g. "Kitchen", "Service", "Cleaning"
  benchmarkHeadcount Int      @default(0) @map("benchmark_headcount")
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlet          Outlet           @relation(fields: [outletId], references: [id], onDelete: Restrict)
  employees       Employee[]
  breakageRecords BreakageRecord[]

  @@unique([outletId, departmentCode])
  @@index([outletId])
  @@map("departments")
}

model Employee {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId         String   @map("outlet_id") @db.Uuid
  departmentId     String   @map("department_id") @db.Uuid
  employeeCode     String   @map("employee_code") // e.g. "E001"
  name             String   // e.g. "Arun 1"
  role             String   // e.g. "Cook", "Steward", "Captain"
  monthlySalary    Decimal  @map("monthly_salary") @db.Decimal(12, 2)
  employmentStatus String   @default("active") @map("employment_status")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlet     Outlet     @relation(fields: [outletId], references: [id], onDelete: Restrict)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Restrict)

  @@unique([outletId, employeeCode])
  @@index([outletId])
  @@index([departmentId])
  @@map("employees")
}

// =============================================================================
// 4. Organization-Level Menu & Recipe Master with Outlet Overrides
// =============================================================================

model Category {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  categoryCode   String   @map("category_code") // e.g. "C01", "C02"
  name           String   // e.g. "South Indian", "Breads", "Curries"
  displayOrder   Int      @default(0) @map("display_order")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  products     Product[]

  @@unique([organizationId, categoryCode])
  @@map("categories")
}

enum PreparationType {
  BATCH       @map("batch")
  FRESH_DAILY @map("fresh_daily")
}

model Product {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId      String          @map("organization_id") @db.Uuid
  categoryId          String          @map("category_id") @db.Uuid
  productCode         String          @map("product_code") // e.g. "P001", "P009"
  name                String          // e.g. "Masala Dosa", "Meals"
  defaultSellingPrice Decimal         @map("default_selling_price") @db.Decimal(10, 2)
  foodCost            Decimal?        @map("food_cost") @db.Decimal(10, 2) // Nullable, never false zero
  unit                String          @default("portion") // "portion", "piece", "glass"
  preparationType     PreparationType @default(BATCH) @map("preparation_type")
  isActive            Boolean         @default(true) @map("is_active")
  createdAt           DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  category       Category               @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  recipes        RecipeItem[]
  outletSettings OutletProductSetting[]
  wastageRecords WastageRecord[]
  orderItems     SalesOrderItem[]

  @@unique([organizationId, productCode])
  @@index([organizationId, categoryId])
  @@map("products")
}

model Ingredient {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  ingredientCode String   @map("ingredient_code") // e.g. "I001"
  name           String   // e.g. "Rice", "Toor Dal", "Ghee"
  unit           String   // e.g. "kg", "liter"
  defaultCost    Decimal  @map("default_cost") @db.Decimal(12, 2)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  recipeItems  RecipeItem[]

  @@unique([organizationId, ingredientCode])
  @@map("ingredients")
}

model RecipeItem {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  productId       String   @map("product_id") @db.Uuid
  ingredientId    String   @map("ingredient_id") @db.Uuid
  quantityPerUnit Decimal  @map("quantity_per_unit") @db.Decimal(10, 4) // e.g. 0.18 kg Rice for Meals

  product    Product    @relation(fields: [productId], references: [id], onDelete: Cascade)
  ingredient Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Restrict)

  @@unique([productId, ingredientId])
  @@index([productId])
  @@map("recipe_items")
}

model OutletProductSetting {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId         String   @map("outlet_id") @db.Uuid
  productId        String   @map("product_id") @db.Uuid
  priceOverride    Decimal? @map("price_override") @db.Decimal(10, 2) // Nullable; falls back to defaultSellingPrice
  isAvailable      Boolean  @default(true) @map("is_available")
  petpoojaItemId   String?  @map("petpooja_item_id") // External POS Item ID mapping per outlet
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlet  Outlet  @relation(fields: [outletId], references: [id], onDelete: Restrict)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([outletId, productId])
  @@index([outletId])
  @@map("outlet_product_settings")
}

// =============================================================================
// 5. Operational Records (Attributed to UserAccount)
// =============================================================================

model WastageRecord {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId         String   @map("outlet_id") @db.Uuid
  productId        String   @map("product_id") @db.Uuid
  recordedById     String   @map("recorded_by_id") @db.Uuid // Strict FK to user_accounts.id
  date             DateTime @db.Date
  preparedQuantity Decimal  @map("prepared_quantity") @db.Decimal(10, 3)
  wastedQuantity   Decimal  @map("wasted_quantity") @db.Decimal(10, 3)
  unitFoodCost     Decimal? @map("unit_food_cost") @db.Decimal(12, 2) // Server-populated, never trusted from client
  estimatedCost    Decimal? @map("estimated_cost") @db.Decimal(12, 2) // Server-computed
  reason           String   // e.g. "Over-preparation", "End-of-day unsold"
  notes            String?
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlet     Outlet      @relation(fields: [outletId], references: [id], onDelete: Restrict)
  product    Product     @relation(fields: [productId], references: [id], onDelete: Restrict)
  recordedBy UserAccount @relation("WastageRecordedBy", fields: [recordedById], references: [id], onDelete: Restrict)

  @@index([outletId, date])
  @@index([recordedById])
  @@map("wastage_records")
}

model BreakageRecord {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId     String   @map("outlet_id") @db.Uuid
  departmentId String   @map("department_id") @db.Uuid // Strict FK to departments.id
  recordedById String   @map("recorded_by_id") @db.Uuid // Strict FK to user_accounts.id
  date         DateTime @db.Date
  item         String   // e.g. "Cup", "Dinner Plate", "Glass"
  brokenQty    Int      @map("broken_qty")
  unitCost     Decimal  @map("unit_cost") @db.Decimal(12, 2) // Server-populated
  totalCost    Decimal  @map("total_cost") @db.Decimal(12, 2) // Server-computed
  reason       String   // e.g. "Handling damage", "Dropped"
  notes        String?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  outlet     Outlet      @relation(fields: [outletId], references: [id], onDelete: Restrict)
  department Department  @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  recordedBy UserAccount @relation("BreakageRecordedBy", fields: [recordedById], references: [id], onDelete: Restrict)

  @@index([outletId, date])
  @@index([departmentId])
  @@index([recordedById])
  @@map("breakage_records")
}

// =============================================================================
// 6. Normalized POS Sales Orders & Items
// =============================================================================

model SalesOrder {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  outletId        String   @map("outlet_id") @db.Uuid
  petpoojaOrderId String   @map("petpooja_order_id")
  orderDate       DateTime @map("order_date") @db.Date
  orderedAt       DateTime @map("ordered_at") @db.Timestamptz
  orderType       String   @map("order_type") // DineIn, Delivery, Takeaway
  coreTotal       Decimal? @map("core_total") @db.Decimal(12, 2)
  taxTotal        Decimal? @map("tax_total") @db.Decimal(12, 2)
  discountTotal   Decimal? @map("discount_total") @db.Decimal(12, 2)
  totalAmount     Decimal? @map("total_amount") @db.Decimal(12, 2)
  financialStatus String   @default("pending") @map("financial_status")
  matchingStatus  String   @default("unmatched") @map("matching_status")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  outlet Outlet           @relation(fields: [outletId], references: [id], onDelete: Restrict)
  items  SalesOrderItem[]

  @@index([outletId, orderDate])
  @@map("sales_orders")
}

model SalesOrderItem {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  salesOrderId String   @map("sales_order_id") @db.Uuid
  productId    String?  @map("product_id") @db.Uuid // Nullable if unmatched to master
  itemName     String   @map("item_name")
  quantity     Decimal  @db.Decimal(10, 3)
  unitPrice    Decimal  @map("unit_price") @db.Decimal(10, 2)
  totalAmount  Decimal  @map("total_amount") @db.Decimal(12, 2)
  itemTax      Decimal? @map("item_tax") @db.Decimal(10, 2)
  itemDiscount Decimal? @map("item_discount") @db.Decimal(10, 2)

  salesOrder SalesOrder @relation(fields: [salesOrderId], references: [id], onDelete: Cascade)
  product    Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([salesOrderId])
  @@index([productId])
  @@map("sales_order_items")
}
```

---

## 4. Final Authorization Model & Server-Side Scoping

The authorization system adheres to strict Zero-Trust boundaries: **the client's requested outlet is treated as an untrusted hint**. Authorization is verified from live database assignments on the server.

### 4.1 Role & Outlet Access Matrix

| Role | Outlet Access | Wastage & Preparation | Tableware Breakage | Sales, Profitability & Manpower | Executive Dashboard | Staff Master (`/settings/staff`) | User & Outlet Management |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Admin** | All organization outlets | Full Access (Consolidated or Filtered) | Full Access (Consolidated or Filtered) | **Full Access** | **Full Access** | **Full Access** | **Full Access** |
| **Manager** | Multiple assigned outlets | Full Access for assigned outlets only | Full Access for assigned outlets only | **Blocked (403)** | **Blocked (403)** | **Blocked (403)** | **Blocked (403)** |
| **Operator** | Single assigned outlet | **Add Only** (No charts/edit/delete) | **Add Only** (No charts/edit/delete) | **Blocked (403)** | **Blocked (403)** | **Blocked (403)** | **Blocked (403)** |

### 4.2 Dynamic Server-Side Authorization Resolver (`src/lib/auth/scope.ts`)

Instead of caching a stale list of assigned outlets in a client JWT or long-lived cookie, every request resolves current authority from PostgreSQL:

```typescript
import { prisma } from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

export interface AuthorizedScope {
  userId: string;
  role: "admin" | "manager" | "operator";
  organizationId: string;
  targetOutletId?: string; // Resolved single outlet filter
  allowedOutletIds: string[]; // Set of authorized outlet UUIDs
}

/**
 * Resolves current user role and outlet assignments directly from PostgreSQL.
 * Validates requested outlet against database authority.
 */
export async function resolveAuthorizedOutletScope(
  userId: string,
  requestedOutletId?: string | null
): Promise<AuthorizedScope> {
  // 1. Fetch live user state & active outlet assignments
  const user = await prisma.userAccount.findUnique({
    where: { id: userId, isActive: true },
    include: {
      outletAssignments: {
        where: { outlet: { isActive: true } },
        select: { outletId: true, isDefault: true },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError("Session invalid or user deactivated.");
  }

  // 2. Admin: Organization-wide access
  if (user.role === "ADMIN") {
    if (requestedOutletId && requestedOutletId !== "all") {
      // Validate requested outlet belongs to user's organization
      const outletExists = await prisma.outlet.findFirst({
        where: { id: requestedOutletId, organizationId: user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!outletExists) {
        throw new ForbiddenError("Outlet does not exist in this organization.");
      }
      return {
        userId: user.id,
        role: "admin",
        organizationId: user.organizationId,
        targetOutletId: requestedOutletId,
        allowedOutletIds: [requestedOutletId],
      };
    }
    // Consolidated view: targetOutletId is undefined
    return {
      userId: user.id,
      role: "admin",
      organizationId: user.organizationId,
      targetOutletId: undefined,
      allowedOutletIds: [], // Empty denotes unscoped / organization-wide
    };
  }

  // 3. Manager & Operator: Assigned outlets only
  const assignedIds = user.outletAssignments.map((a) => a.outletId);
  if (assignedIds.length === 0) {
    throw new ForbiddenError("User is not assigned to any active outlet.");
  }

  // Determine active outlet
  let targetId: string;
  if (requestedOutletId && requestedOutletId !== "all") {
    if (!assignedIds.includes(requestedOutletId)) {
      throw new ForbiddenError("Forbidden: You are not authorized for this outlet.");
    }
    targetId = requestedOutletId;
  } else {
    // Default to the user's marked default assignment, or first assigned
    const defaultAssignment = user.outletAssignments.find((a) => a.isDefault);
    targetId = defaultAssignment ? defaultAssignment.outletId : assignedIds[0];
  }

  return {
    userId: user.id,
    role: user.role.toLowerCase() as "manager" | "operator",
    organizationId: user.organizationId,
    targetOutletId: targetId,
    allowedOutletIds: assignedIds,
  };
}
```

---

## 5. Shared Menu and Recipe Architecture

### 5.1 Business Requirement & Rationalization
- Ashirvad Gulmohar operates a standardized culinary brand across outlets. Recipes and preparation formulations (e.g. 0.18 kg Rice per Meals portion) are identical across outlets.
- Replicating 60 products and their ingredient recipes for every new outlet leads to data drift, sync errors, and maintenance nightmares.
- **Solution:** Products, Ingredients, and Recipes are defined once at the `Organization` level.
- **Outlet Variations:** Selling prices and availability (e.g. an item temporarily unavailable at `KOZ-002`) are managed in `outlet_product_settings`:
  - `price_override`: If `NULL`, queries fall back to `products.default_selling_price`.
  - `is_available`: Allows individual outlets to 86 items without modifying the master catalog.
  - `petpooja_item_id`: Accommodates POS outlet item ID variations across terminals.

### 5.2 Profitability & Food-Cost Rule Continuity
- Recipe cost calculations remain governed by `mock_data/business-rules.md`:
  $$\text{Dish Food Cost} = \sum (\text{Ingredient Quantity} \times \text{Ingredient Unit Cost})$$
- Missing food costs or recipe definitions result in `food_cost = NULL`, **never false zero**.
- Analytics compute `food_cost_coverage_pct`, maintaining reporting integrity.

---

## 6. Employee and Department Architecture

### 6.1 Relational Department Hierarchy
- In mock data, departments were represented as a standalone file `mock_data/departments.json` (`D01` to `D06`) and referenced as text codes in `employees.json`.
- In the refined relational architecture:
  - `Department` is explicitly modeled with `outlet_id UUID REFERENCES outlets(id)`.
  - This allows different outlets to have customized staffing benchmarks and department configurations (e.g. an outlet with a Bakery counter vs. standard Kitchen).
- `Employee` carries foreign keys to both `outlet_id` and `department_id`.
- Primary keys are UUIDs; `(outlet_id, employee_code)` is enforced as unique (e.g., `KOZ-001` has `E001`, `KOZ-002` can also have `E001`).

### 6.2 Decoupling from Application Logins
- Employees are an HR staff directory managed exclusively by the **Admin** role under `/dashboard/settings/staff`.
- Employees do **not** have application logins, passwords, or session tokens.
- Attendance marking, shift planning, leaves, and biometric integrations remain **strictly out of scope**. The existing `/dashboard/manpower` analytics page is preserved for Admin review using existing mock metrics.

---

## 7. Operational Record Attribution & Operator Interface

### 7.1 Accountability and User Foreign Keys
- Every wastage entry (`wastage_records`) and breakage entry (`breakage_records`) carries:
  - `outlet_id UUID REFERENCES outlets(id)` (Strict boundary).
  - `recorded_by_id UUID REFERENCES user_accounts(id)` (Strict authentication trail).
  - Accurate `date` (accounting day) and `created_at` (audit timestamp).
- **Attribution Rule:** The entry is attributed to the authenticated application account that submitted it (e.g., `op-koz-001` or `mgr-kozhikode`). It is **never** attributed to an arbitrary employee string or unverified text.
- If physical staff attribution is requested in a future phase, it will be added as an optional dropdown field (`employee_id UUID REFERENCES employees(id)`).

### 7.2 Dedicated Operator Interface (`/operator/entry`)
- Operators receive a streamlined, single-purpose mobile/tablet interface.
- **Client Security:**
  - Operator entry forms accept only operational fields: Date, Product/Item selector, Quantity, Reason, Notes.
  - Cost calculations (`unit_food_cost`, `estimated_cost`, `unit_cost`, `total_cost`) are **completely computed on the server** during insertion.
  - The Operator client bundle is never sent cost values (₹), recipe ingredient details, or margins.
  - Operators have **zero access** to charts, analytics, or the executive dashboard.
  - Operators **cannot edit or delete** existing records (append-only).

---

## 8. Petpooja POS Integration Strategy

### 8.1 Clarification on Observed Test ID (`53qcgrdis8`)
- In previous tests, a webhook payload with `restID = 53qcgrdis8` was processed.
- Investigation confirmed that `53qcgrdis8` belongs to `Petpooja_Rider_Testing` (a staging test outlet).
- **Rule:** `53qcgrdis8` is **NOT** Gulmohar's production outlet ID. It must not be associated with any production outlet record.
- `outlets.petpooja_rest_id` remains `NULL` until Petpooja provides Gulmohar's verified production outlet credentials in writing.

### 8.2 Webhook Quarantine Pipeline
1. Incoming POS webhooks push to `/api/webhooks/petpooja`.
2. Raw delivery is logged in `petpooja_webhook_events` with byte-for-byte SHA-256 integrity hashing.
3. If `properties.Restaurant.restID` does not match an active outlet in `outlets`:
   - The event status is marked as `'unregistered_restaurant'`.
   - The payload is quarantined safely. No `sales_orders` are created, and no errors crash the endpoint.
4. When management confirms the outlet's `restID`, an Admin updates `outlets.petpooja_rest_id`, and quarantined events are reprocessed sequentially.

---

## 9. PostgreSQL & Prisma Migration Strategy (Local Docker + VPS)

### 9.1 Local Development (Docker Compose) - Implemented & Verified
- Docker Compose configuration: `compose.yaml` running `postgres:16-alpine`.
  - Container name: `gulmohar-postgres`
  - Database: `gulmohar_dev`
  - Database User: `gulmohar_app`
  - Host Port: `5432`
  - Volume: `gulmohar_postgres_data`
  - Credentials: `.env.docker` (ignored by Git)
- Prisma ORM (`@prisma/client@^6.19.3` & `prisma@^6.19.3`):
  - Schema: `prisma/schema.prisma`
  - Initial Migration: `20261111173938_init_multi_outlet_schema` applied successfully.
  - Generates Prisma Client: `npx prisma generate` (or `npm run db:generate`).
  - Verified 15 application tables and 2 enums (`AppRole`, `PreparationType`) in `gulmohar_dev`.
- Convenience Scripts in `package.json`:
  - `npm run db:migrate` -> `prisma migrate dev`
  - `npm run db:deploy` -> `prisma migrate deploy`
  - `npm run db:status` -> `prisma migrate status`
  - `npm run db:generate` -> `prisma generate`
  - `npm run db:studio` -> `prisma studio`

### 9.2 Production VPS Deployment (Hostinger KVM2)
- Production PostgreSQL 16 runs on the Hostinger KVM2 VPS.
- Migrations are applied in production using:
  ```bash
  npm run db:deploy
  ```
  This applies pending committed migration SQL files idempotently without dropping data or prompting for inputs.

### 9.3 Strict Seed Script Isolation
- `prisma/seeds/seed.dev.ts`: Seeds local mock fixtures, test outlets (`KOZ-001`, `KOZ-002`, `BLR-001`), and sample entries for local development.
- `prisma/seeds/seed.prod.ts`: Idempotently provisions only the root organization (`Ashirvad Gulmohar`), production outlets, and initial Admin credentials.
- **Rule:** Local test records are **never** migrated, imported, or seeded into the production VPS database.

---

## 10. Status of Business Decisions

### 10.1 Confirmed Decisions
1. **Single Org, Multiple Outlets:** Ashirvad Gulmohar is the single organization; outlets have UUID PKs and unique codes (`KOZ-001`).
2. **Three Application Roles:** Admin (org-wide), Manager (multi-outlet loss management), Operator (assigned outlet data entry).
3. **Decoupled Staff Directory:** Employee master has no login accounts; attendance is out of scope.
4. **Shared Menu & Recipe Master:** Defined at organization level; outlets override pricing and availability.
5. **Dynamic Scoping:** Server resolves authorizations from DB; client outlet selectors are untrusted hints.
6. **Docker & VPS Strategy:** `prisma migrate dev` locally; `prisma migrate deploy` on Hostinger VPS; zero test data in production.

### 10.2 Remaining External Dependencies
1. **Official Petpooja Production Credentials:** Pending receipt of Gulmohar's confirmed production `restID` and API token from Petpooja.
2. **Production Outlet Metadata:** Pending final list of initial outlet names and codes to include in `seed.prod.ts`.
3. **Hostinger App Deployment Target:** Confirmation whether Next.js runs as a container/PM2 on the VPS or on Hostinger Web Hosting.

---

## 11. Verification & Documentation Checklist

- [`docs/multi-outlet-architecture-audit.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/multi-outlet-architecture-audit.md): Updated with final prompt, schema, and rules.
- [`docs/architecture.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/architecture.md): Synchronized with final multi-outlet, shared menu, and dynamic authorization model.
- [`docs/rbac-audit-and-plan.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/rbac-audit-and-plan.md): Updated role matrix, Operator interface specification, and DB-resolved scoping.
- [`docs/petpooja-integration-guide.md`](file:///d:/Dhanil/Git%20Repositeries/gulmohar-analytic-dashboard/docs/petpooja-integration-guide.md): Updated with `restID` quarantine rules and POS decoupling.
- **Verification:** `npm run build` and `npm run lint` verified clean; `git status` confirms zero modifications to `src/` application code.
