# Wastage & Preparation Module – User Guide & Operational Runbook

Welcome to the **Wastage & Preparation** module of **Gulmohar Analytics**.

This guide is designed for restaurant owners, general managers, kitchen supervisors, and floor operators. It explains how to set up your master catalogs, record daily kitchen production batches, log food waste and tableware breakage, and interpret reports and analytics to control restaurant food cost.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [User Roles and Access Permissions](#2-user-roles-and-access-permissions)
3. [Master Data: Setup & Configuration](#3-master-data-setup--configuration)
   - [A. Preparation Items](#a-preparation-items)
   - [B. Wastage Reasons](#b-wastage-reasons)
   - [C. Breakage Items](#c-breakage-items)
   - [D. Breakage Reasons](#d-breakage-reasons)
   - [Master Data Relationship Table](#master-data-relationship-table)
4. [Kitchen Preparation Workflow](#4-kitchen-preparation-workflow)
5. [Food Wastage Workflow](#5-food-wastage-workflow)
6. [Tableware Breakage Workflow](#6-tableware-breakage-workflow)
7. [Understanding Dashboard KPIs and Analytics](#7-understanding-dashboard-kpis-and-analytics)
8. [Common Issues and Troubleshooting](#8-common-issues-and-troubleshooting)

---

## 1. Introduction

### What is the Wastage & Preparation Module?
In a restaurant like Ashirvad Gulmohar, the kitchen continuously produces intermediate food batches throughout the day—such as pots of Basmati Rice, Sambar, Coconut Chutney, gravies, and Idli/Dosa Batter. 

These items are **not** customer-facing menu dishes with selling prices; they are intermediate kitchen preparations.

The **Wastage & Preparation module** provides three essential functions:
1. **Daily Batch Preparation Tracking:** Records how much food your kitchen prepared on any given date.
2. **Food Wastage Control:** Records how much prepared food remained unsold, spoiled, or got burned, strictly validated against what was actually prepared.
3. **Tableware Breakage Tracking:** Records broken plates, glasses, bowls, and cutlery so dining room damage is tracked separately from food loss.

### Why Are Preparation and Wastage Recorded Separately?
* **Accurate Waste Percentage:** If your kitchen prepares 50 kg of Rice and loses 2.5 kg at the end of the night, your wastage is 5%. Without recording the prepared batch first, a computer system has no baseline to determine whether 2.5 kg is a small fraction or an alarming loss.
* **Overproduction Detection:** When food waste occurs because too much was cooked rather than poor sales, comparing preparation batches to sales highlights over-preparation trends.
* **Strict Stock Invariant:** A kitchen cannot throw away more food than it actually cooked. The system automatically enforces this: you can only log wastage if a preparation batch was previously recorded for that day.

### Why is Breakage Tracked Separately?
Crockery and glassware breakages are dining room and wash-station equipment costs, not food ingredient loss. Tracking them separately ensures that a bad day of dropped plates does not distort kitchen food cost benchmarks or recipe yields.

### Workflow Overview
```
┌────────────────────────────────────────────────────────┐
│ 1. ADMIN CONFIGURATION                                 │
│ Admin creates Preparation Items, Breakage Items, &     │
│ Standard Reasons in Master Data Management.            │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. DAILY KITCHEN BATCH PREPARATION                     │
│ Kitchen staff logs morning & evening cooked batches.   │
│ (e.g. 25 kg Cooked Rice, 30 Litres Sambar)             │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. END-OF-DAY WASTAGE & BREAKAGE LOGGING               │
│ Staff selects from configured items & logs waste/loss. │
│ System checks stock: Wasted Qty ≤ Prepared Qty.        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. MANAGEMENT REVIEW & ANALYTICS                       │
│ Admin & Managers view live KPI cards, waste trends,    │
│ cost impacts, and preparation vs waste charts.         │
└────────────────────────────────────────────────────────┘
```

---

## 2. User Roles and Access Permissions

Gulmohar Analytics uses strict role-based access control (RBAC). Three distinct roles interact with this module:

### A. Role Definitions & Permissions

| Role | Operational Responsibility | Navigation & Page Access | Master Data Management | Operational Logging | Reports & History |
|---|---|---|---|---|---|
| **Admin** | Organization owner or executive director. Manages global catalogs, outlets, and users. | Full access to all modules (`/dashboard/*`). | **Full Access** (Add, Edit, Activate, Deactivate). | Can log preparation, wastage, and breakage from dashboard. | Can view all records and financial analytics. |
| **Manager** | Branch manager or head supervisor. Oversees daily shifts and branch performance. | Operations only: `/dashboard/wastage` and `/dashboard/breakage`. | **Read-Only / No Access** to Master Data. | Can log, view, edit, and delete branch operational records. | Can view operational history and trends for assigned outlets. |
| **Operator** | Kitchen cook, steward, or cashier on the restaurant floor. | Dedicated Floor Portal (`/operator/entry`). | **No Access** to Master Data or management dashboards. | Quick touch-friendly logging of daily waste and breakage. | Views recent logs for the active session only. |

### B. Outlet Scope & Multi-Outlet Context
* **Organization-Wide Scope (Admin):** Admins can switch between individual outlets (e.g., `KOZ-001`) or view consolidated metrics across all branches.
* **Assigned Outlets (Manager & Operator):** Managers and Operators are assigned to specific restaurant branches. When an operator logs a transaction, it is strictly stamped with their assigned branch. Users cannot view or modify transactions from other branches.
* **Unauthorized Access:** If an operator attempts to access `/dashboard` or master data routes, the system automatically redirects them to `/operator/entry`. If a manager attempts to access sales or master data, they are redirected to their operational dashboard.

---

## 3. Master Data: Setup & Configuration

> [!IMPORTANT]
> **Master Data is a Prerequisite.** Staff and floor operators **never** create new master items while logging daily food batches or broken items. They choose from active items created by the Administrator. If an item is not configured in Master Data, staff cannot log it.

To open Master Data Management:
1. Log in with your **Admin** account.
2. In the left navigation sidebar, look under the **Administration** heading and click **Master Data** (`/dashboard/master-data`).
3. You will see seven tabs: **Departments**, **Preparation Items**, **Menu Products**, **Ingredients**, **Recipes**, **Breakage Items**, and **Reasons**.

---

### A. Preparation Items
Preparation Items represent food prepared in bulk inside your kitchen before serving.

* **Where to find:** Click the **Preparation Items** tab in Master Data.
* **Who uses this:** Used by staff in the **Preparation Form** (to log cooked batches) and the **Wastage Form** (to record unsold or spoiled quantities).

#### Step-by-Step: Adding a Preparation Item
1. Click the **Add Preparation Item** button at the top right of the section.
2. Fill in the fields:
   * **Item Code (Required):** A short unique identifier (e.g., `PREP-01`, `PREP-RICE`, `PREP-SAMBAR`). The system will automatically convert this to uppercase.
   * **Item Name (Required):** The clear kitchen name of the item (e.g., `Cooked Basmati Rice`, `Idli Batter`, `Veg Sambar`, `Coconut Chutney`).
   * **Measurement Unit (Required):** Select the physical unit used to weigh or measure the batch:
     * `kg` (Kilograms) – best for cooked rice, dough, batter, noodles.
     * `litre` (Litres) – best for sambar, rasam, soups, gravies, tea/coffee.
     * `portion` (Portions) – best for pre-portioned desserts or specialty sides.
   * **Standard Cost (₹) (Optional):** The estimated food cost per unit (e.g., `₹45.00` per kg of cooked rice). When staff record wastage, the system multiplies the wasted quantity by this standard cost to calculate the exact financial loss. If left blank, cost will be recorded as unconfigured.
   * **Department / Section (Optional):** Assigns the preparation to a kitchen section (e.g., `Kitchen`, `South Indian Section`).
   * **Active Checkbox:** Checked by default. Leave checked so staff can select it.
3. Click **Create Item**.

#### Deactivating a Preparation Item
* Click the **Deactivate** icon (orange circle) next to the item.
* **What happens:** The item immediately disappears from staff dropdowns. Staff cannot select it for new entries. All historical preparation batches and wastage logs recorded with this item remain intact and visible in past reports.

---

### B. Wastage Reasons
Standardized reasons explaining why kitchen food had to be discarded.

* **Where to find:** Click the **Reasons** tab in Master Data, then click **Wastage Reasons**.
* **Who uses this:** Used by staff in the **Wastage Form** on both the management dashboard and the operator floor portal.

#### Step-by-Step: Adding a Wastage Reason
1. Click **Add Reason**.
2. Fill in the fields:
   * **Reason Code (Required):** Short code (e.g., `WR-01`, `WR-SPOIL`).
   * **Reason Label (Required):** The clear reason staff will see (e.g., `End-of-day unsold`, `Over-preparation`, `Kitchen spoiled/burnt`, `Quality drop`, `Customer return / Re-cook`).
   * **Display Order:** Number controlling which reason appears first in the dropdown (e.g., `1` for the most common reason).
   * **Description / Guidance (Optional):** Helpful explanation for staff regarding when to choose this option.
3. Click **Create Reason**.

---

### C. Breakage Items
Trackable crockery, glassware, cutlery, and kitchen tableware that can be dropped, chipped, or damaged.

* **Where to find:** Click the **Breakage Items** tab in Master Data.
* **Who uses this:** Used by staff in the **Breakage Form** on both the management dashboard and the floor portal.

#### Step-by-Step: Adding a Breakage Item
1. Click **Add Breakage Item**.
2. Fill in the fields:
   * **Item Code (Required):** Short code (e.g., `BRK-01`, `BRK-PLATE`, `BRK-GLASS`).
   * **Item Name (Required):** Name of the physical article (e.g., `Dinner Plate`, `Quarter Plate`, `Water Glass`, `Tea Cup`, `Soup Bowl`).
   * **Category:** Select `Tableware`, `Glassware`, `Cutlery`, or `Kitchenware`.
   * **Standard Replacement Cost (₹) (Optional):** The purchase or replacement price per piece (e.g., `₹180.00` for a porcelain dinner plate, `₹65.00` for a water glass). When staff enter broken quantities, the system automatically calculates the total monetary loss.
3. Click **Create Item**.

---

### D. Breakage Reasons
Standardized classifications for why tableware broke.

* **Where to find:** Click the **Reasons** tab in Master Data, then click **Breakage Reasons**.
* **Who uses this:** Used in the **Breakage Form**.

#### Step-by-Step: Adding a Breakage Reason
1. Click **Add Reason** (ensure the Breakage Reasons sub-tab is active).
2. Fill in:
   * **Reason Code:** e.g., `BR-01`.
   * **Reason Label:** e.g., `Handling damage`, `Dropped by steward/customer`, `Damaged during washing`, `Chipped/Cracked (wear & tear)`.
   * **Display Order:** e.g., `1`.
3. Click **Create Reason**.

---

### Master Data Relationship Table

| Admin Configures in Master Data | Where Staff Sees It | Purpose & Calculation |
|---|---|---|
| **Preparation Item** (e.g., Cooked Rice, kg, ₹45/kg) | **Preparation Form** & **Wastage Form** | Establishes the daily cooked batch and sets unit cost for wastage calculations. |
| **Wastage Reason** (e.g., Over-preparation) | **Wastage Form** | Categorizes food loss for waste-reduction analysis. |
| **Breakage Item** (e.g., Water Glass, ₹65/each) | **Breakage Form** | Identifies the damaged article and computes replacement cost ($Qty \times Cost$). |
| **Breakage Reason** (e.g., Dropped) | **Breakage Form** | Explains the physical cause of dining room loss. |

---

## 4. Kitchen Preparation Workflow

Preparation logging records the bulk food produced in the kitchen on a specific day.

### Where to Open the Form
* **Management Dashboard:** In the left sidebar, click **Wastage & Preparation** under **Operations**. Scroll down to the **Preparation History** card and click the **Log Preparation** button.

### Step-by-Step Instructions
1. **Date:** Today's date is filled in automatically. Change it if you are entering a batch from an earlier shift.
2. **Preparation Item:** Select the cooked item from the dropdown (e.g., `Cooked Basmati Rice (PREP-RICE) — kg`).
   * *Notice:* The form immediately displays the measurement unit (`kg`) and the configured standard cost (`₹45.00/kg`).
3. **Prepared Quantity:** Enter the actual cooked quantity (e.g., `25.0`).
4. **Kitchen Section (Optional):** Select the department responsible (e.g., `Kitchen`).
5. **Notes (Optional):** Add operational context (e.g., *"Morning rush cooking batch 1"*).
6. **Save:** Click **Save Batch**.

### What if No Preparation Items Are Configured?
If no active preparation items exist in the database, the form will not let you guess. It shows an amber warning message:
> *"No active preparation items configured. An administrator must configure active Preparation Items in Master Data Management before kitchen batches can be logged."*

---

## 5. Food Wastage Workflow

Wastage logging records unsold, spoiled, or spilled food batches at the end of a shift or day.

### Where to Open the Form
* **Management Dashboard:** Go to **Wastage & Preparation** in the sidebar. Scroll to **Wastage Records** and click **Record Wastage**.
* **Floor Operator Portal:** On a kitchen tablet or floor terminal (`/operator/entry`), click the **Log Food Wastage** tab.

### Step-by-Step Instructions
1. **Date:** Select the date the food was wasted.
2. **Preparation Item:** Choose the prepared food item (e.g., `Cooked Basmati Rice`).
   * *Live Stock Check:* The system checks the database for that date and displays:
     > *"Available for waste: 25.00 kg prepared on 2026-11-21."*
3. **Wasted Quantity:** Enter the weight or volume discarded (e.g., `2.5`).
4. **Reason for Wastage:** Select a standard reason from the dropdown (e.g., `Over-preparation` or `End-of-day unsold`).
5. **Kitchen Department (Optional):** Select the section (e.g., `Kitchen`).
6. **Notes (Optional):** e.g., *"Lunch rush ended early due to rain."*
7. Click **Record Wastage**.

### Key Rules & Safety Validations
* **Available Preparation Invariant:** You cannot waste more food than was prepared on that day. If 25 kg was prepared and 2 kg was previously wasted, only 23 kg is available. If you try to enter `24 kg`, the system displays:
  > *"Wasted quantity (24 kg) exceeds available preparation (23 kg)."*
* **Automatic Cost Calculation:**
  $$\text{Wastage Cost} = \text{Wasted Quantity} \times \text{Standard Unit Cost}$$
  *Example:* $2.5\text{ kg} \times ₹45.00 = ₹112.50$. The system calculates this automatically on the server.

---

## 6. Tableware Breakage Workflow

Breakage logging records damaged plates, cups, glasses, or cutlery.

### Where to Open the Form
* **Management Dashboard:** In the left sidebar, click **Breakage** under **Operations**. Scroll to **Breakage Records** and click **Record Breakage**.
* **Floor Operator Portal:** In `/operator/entry`, click the **Log Tableware Breakage** tab.

### Step-by-Step Instructions
1. **Date:** Today's date is pre-filled.
2. **Department:** Select where the breakage occurred (e.g., `Service` or `Kitchen`).
3. **Breakage Item:** Select the item from the dropdown (e.g., `Dinner Plate (BRK-01) — Tableware`).
   * *Notice:* The form shows the replacement cost: `Standard Replacement Cost: ₹180`.
4. **Damaged Quantity:** Enter how many pieces broke (e.g., `3`).
5. **Reason:** Select a reason (e.g., `Dropped by steward/customer`).
6. **Notes (Optional):** Add incident details.
7. Click **Save Breakage**.

### Financial Calculation
$$\text{Total Damage Cost} = \text{Broken Quantity} \times \text{Standard Replacement Cost}$$
*Example:* $3\text{ plates} \times ₹180.00 = ₹540.00$.

---

## 7. Understanding Dashboard KPIs and Analytics

When you open **Wastage & Preparation** in the dashboard, the page presents live operational figures:

### A. The 4 Top KPI Cards
1. **Prepared Quantity:** Displays the total bulk food cooked during the selected date range, **grouped clearly by unit** (for example: `120 kg • 45 litre`).
   * *Why unit separation matters:* Adding 100 kg of rice and 20 litres of sambar into "120" is meaningless. The system groups each unit cleanly.
2. **Wasted Quantity:** Total food discarded, also grouped by unit (e.g., `5.5 kg • 2 litre`).
3. **Wastage Cost:** Total financial loss in Rupees (₹) across all wasted items, with a comparison indicator versus the previous period.
4. **Wastage %:** The percentage of prepared food that ended up in the bin:
   $$\text{Wastage } \% = \left(\frac{\text{Total Wasted Weight}}{\text{Total Prepared Weight}}\right) \times 100$$
   *Benchmark:* Well-run commercial kitchens target under **3% to 5%** total preparation wastage.

### B. Analytical Charts
* **Prepared vs. Wasted Chart:** A side-by-side bar comparison showing how much was cooked versus how much was wasted for each preparation item.
* **Wastage Trend Chart:** A timeline showing whether food waste is increasing or decreasing across days or weeks.
* **Wastage by Item Chart:** Highlights your top financial loss items so the head chef knows which recipe batches to resize.
* **Wastage by Reason Chart:** A percentage breakdown showing whether food is being lost due to over-preparation, spoilage, or kitchen cooking errors.

---

## 8. Common Issues and Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| **A food item is missing from the Preparation or Wastage dropdown.** | The item has not been added to Master Data, or it was marked Inactive. | Log in as **Admin**, navigate to **Master Data > Preparation Items**, verify the item exists, and ensure its status is **Active**. |
| **System shows: *"Wasted quantity exceeds available preparation"*.** | Staff are trying to log wastage for an item where no preparation batch was entered for that date, or the waste exceeds the remaining cooked stock. | Verify that the morning cooking batch was logged in the **Preparation History** table for that exact date before recording wastage. |
| **A tableware item is missing from the Breakage dropdown.** | The item is not configured in Master Data or is marked Inactive. | Go to **Master Data > Breakage Items** and create or activate the item. |
| **No reasons appear in the Wastage Reason dropdown.** | The Administrator has not yet configured standard reasons. | Go to **Master Data > Reasons > Wastage Reasons** and add your restaurant's standard waste categories. |
| **A Manager cannot find the Master Data tab.** | By design, Master Data is restricted strictly to the **Admin** role to protect organization-wide catalogs. | Request the restaurant **Admin** to update catalogs, items, or costs. |
| **An item was deactivated by mistake.** | Deactivating an item hides it from staff forms but keeps its data safe in the database. | Open **Master Data**, locate the item in the table, and click the green **Activate** checkmark icon. |

