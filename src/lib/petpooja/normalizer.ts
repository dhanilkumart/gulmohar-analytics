import { Prisma } from "@prisma/client";
import {
  NormalizationIssue,
  NormalizeBatchResult,
  NormalizeOrderResult,
  NormalizedSalesOrder,
  NormalizedSalesOrderItem,
  PetpoojaPullOrderEntry,
  PetpoojaPullOrderItem,
} from "@/types/petpooja";

/**
 * Result of parsing a decimal value with issue categorization.
 */
interface ParseDecimalResult {
  value: Prisma.Decimal | null;
  issue?: NormalizationIssue;
}

/**
 * Safely converts an input into a Prisma.Decimal or null.
 *
 * Distinguishes:
 * - Empty / undefined / null: returns { value: null } (optional field absence, no issue).
 * - Valid string or number: returns { value: Prisma.Decimal } (no issue).
 * - Malformed string or non-numeric: returns { value: null, issue: NormalizationIssue } with severity.
 *
 * Avoids any JavaScript floating point calculations.
 */
export function parseDecimalValue(
  raw: unknown,
  fieldName: string,
  isRequired = false
): ParseDecimalResult {
  if (raw === null || raw === undefined) {
    if (isRequired) {
      return {
        value: null,
        issue: {
          severity: "error",
          field: fieldName,
          message: `Required financial field '${fieldName}' is missing or null.`,
        },
      };
    }
    return { value: null };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (isRequired) {
        return {
          value: null,
          issue: {
            severity: "error",
            field: fieldName,
            message: `Required financial field '${fieldName}' is empty.`,
            value: raw,
          },
        };
      }
      return { value: null };
    }

    // Strict decimal validation: optional leading minus, digits, optional dot with digits
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return {
        value: null,
        issue: {
          severity: isRequired ? "error" : "warning",
          field: fieldName,
          message: `Invalid decimal format for '${fieldName}': '${raw}'.`,
          value: raw,
        },
      };
    }

    try {
      return { value: new Prisma.Decimal(trimmed) };
    } catch {
      return {
        value: null,
        issue: {
          severity: isRequired ? "error" : "warning",
          field: fieldName,
          message: `Failed to construct Decimal for '${fieldName}' from '${raw}'.`,
          value: raw,
        },
      };
    }
  }

  if (typeof raw === "number") {
    if (Number.isNaN(raw) || !Number.isFinite(raw)) {
      return {
        value: null,
        issue: {
          severity: isRequired ? "error" : "warning",
          field: fieldName,
          message: `Invalid number value for '${fieldName}': ${raw}.`,
          value: raw,
        },
      };
    }

    try {
      return { value: new Prisma.Decimal(raw.toString()) };
    } catch {
      return {
        value: null,
        issue: {
          severity: isRequired ? "error" : "warning",
          field: fieldName,
          message: `Failed to construct Decimal for '${fieldName}' from number ${raw}.`,
          value: raw,
        },
      };
    }
  }

  // Unsupported type (e.g. object, boolean)
  return {
    value: null,
    issue: {
      severity: isRequired ? "error" : "warning",
      field: fieldName,
      message: `Unexpected data type for '${fieldName}': ${typeof raw}.`,
      value: raw,
    },
  };
}

/**
 * Result of parsing and validating an operational date.
 */
interface ParseDateResult {
  dateString?: string;
  issue?: NormalizationIssue;
}

/**
 * Validates operational business date string in YYYY-MM-DD format.
 * Checks actual calendar validity (leap years, month days).
 */
export function parseOperationalDate(raw: unknown, fieldName: string): ParseDateResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Missing or non-string operational date for '${fieldName}'.`,
        value: raw,
      },
    };
  }

  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Invalid operational date format for '${fieldName}'. Expected YYYY-MM-DD, got '${raw}'.`,
        value: raw,
      },
    };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Month out of range (1-12) in '${fieldName}': ${month}.`,
        value: raw,
      },
    };
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Day ${day} invalid for month ${month} (has ${daysInMonth} days) in '${fieldName}'.`,
        value: raw,
      },
    };
  }

  return { dateString: trimmed };
}

/**
 * Result of parsing a timestamp in Asia/Kolkata (IST).
 */
interface ParseTimestampResult {
  date?: Date;
  issue?: NormalizationIssue;
}

/**
 * Parses Petpooja `created_on` timestamp as an Asia/Kolkata (UTC+05:30) timestamp.
 *
 * Verifies exact calendar components:
 * - Expected format: "YYYY-MM-DD HH:MM:SS"
 * - Calendar validity: 1-12 months, valid days per month, 0-23 hours, 0-59 minutes, 0-59 seconds.
 * - Server timezone independent: Explicitly parses as UTC+05:30 instant.
 */
export function parseAsiaKolkataTimestamp(raw: unknown, fieldName: string): ParseTimestampResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Missing or non-string timestamp for '${fieldName}'.`,
        value: raw,
      },
    };
  }

  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Invalid timestamp format for '${fieldName}'. Expected 'YYYY-MM-DD HH:MM:SS', got '${raw}'.`,
        value: raw,
      },
    };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);

  if (month < 1 || month > 12) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Month ${month} out of range in '${fieldName}'.`,
        value: raw,
      },
    };
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Day ${day} invalid for month ${month} in '${fieldName}'.`,
        value: raw,
      },
    };
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Time component out of range in '${fieldName}': ${hour}:${minute}:${second}.`,
        value: raw,
      },
    };
  }

  // Construct ISO 8601 string explicitly pegged to IST (+05:30)
  const pad = (n: number) => n.toString().padStart(2, "0");
  const isoWithOffset = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`;
  const parsedDate = new Date(isoWithOffset);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      issue: {
        severity: "error",
        field: fieldName,
        message: `Failed to construct valid Date object for '${fieldName}'.`,
        value: raw,
      },
    };
  }

  return { date: parsedDate };
}

/**
 * Normalizes an individual line item (`OrderItem`).
 *
 * Rules:
 * - `itemid`, `itemcode`, `name`, `quantity`, `price`, `total` are required.
 * - Missing non-critical optional fields (e.g. `specialnotes`, `categoryid`) do not reject the item.
 * - Invalid decimals on optional fields (like tax or discount) report warnings without rejecting the order.
 */
export function normalizeOrderItem(
  rawItem: PetpoojaPullOrderItem,
  itemIndex: number
): { item?: NormalizedSalesOrderItem; issues: NormalizationIssue[] } {
  const issues: NormalizationIssue[] = [];

  const petpoojaItemId = typeof rawItem.itemid === "string" ? rawItem.itemid.trim() : String(rawItem.itemid ?? "").trim();
  const petpoojaItemCode = typeof rawItem.itemcode === "string" ? rawItem.itemcode.trim() : String(rawItem.itemcode ?? "").trim();
  const itemName = typeof rawItem.name === "string" ? rawItem.name.trim() : "";

  if (!petpoojaItemId) {
    issues.push({
      severity: "error",
      field: `OrderItem[${itemIndex}].itemid`,
      message: `OrderItem at index ${itemIndex} is missing 'itemid'.`,
    });
  }

  if (!petpoojaItemCode) {
    issues.push({
      severity: "error",
      field: `OrderItem[${itemIndex}].itemcode`,
      message: `OrderItem at index ${itemIndex} is missing 'itemcode'.`,
    });
  }

  if (!itemName) {
    issues.push({
      severity: "error",
      field: `OrderItem[${itemIndex}].name`,
      message: `OrderItem at index ${itemIndex} is missing 'name'.`,
    });
  }

  // Required Item Financials
  const qtyResult = parseDecimalValue(rawItem.quantity, `OrderItem[${itemIndex}].quantity`, true);
  if (qtyResult.issue) issues.push(qtyResult.issue);

  const priceResult = parseDecimalValue(rawItem.price, `OrderItem[${itemIndex}].price`, true);
  if (priceResult.issue) issues.push(priceResult.issue);

  const totalResult = parseDecimalValue(rawItem.total, `OrderItem[${itemIndex}].total`, true);
  if (totalResult.issue) issues.push(totalResult.issue);

  // Optional Item Financials
  const taxResult = parseDecimalValue(rawItem.total_tax, `OrderItem[${itemIndex}].total_tax`, false);
  if (taxResult.issue) issues.push(taxResult.issue);

  const discountResult = parseDecimalValue(rawItem.total_discount, `OrderItem[${itemIndex}].total_discount`, false);
  if (discountResult.issue) issues.push(discountResult.issue);

  const hasFatalItemError = issues.some((i) => i.severity === "error");
  if (hasFatalItemError || !qtyResult.value || !priceResult.value || !totalResult.value) {
    return { issues };
  }

  const normalizedItem: NormalizedSalesOrderItem = {
    itemIndex,
    petpoojaItemId,
    petpoojaItemCode,
    itemName,
    categoryId: rawItem.categoryid?.trim() || undefined,
    categoryName: rawItem.categoryname?.trim() || undefined,
    quantity: qtyResult.value,
    unitPrice: priceResult.value,
    totalAmount: totalResult.value,
    itemTax: taxResult.value,
    itemDiscount: discountResult.value,
    specialNotes: rawItem.specialnotes?.trim() || undefined,
  };

  return { item: normalizedItem, issues };
}

/**
 * Normalizes a single raw Petpooja order entry (`PetpoojaPullOrderEntry`).
 *
 * Core Guarantees:
 * 1. Independent of database access or state.
 * 2. Strictly excludes all Customer PII (name, phone, address, gstin).
 * 3. Preserves exact Petpooja financial values without modifying or recalculating totals.
 * 4. Preserves order status, including "Cancelled".
 * 5. Handles mixed string/number financial types without float rounding.
 * 6. Explicitly reports validation issues without silent discards.
 */
export function normalizePetpoojaOrder(entry: PetpoojaPullOrderEntry): NormalizeOrderResult {
  const issues: NormalizationIssue[] = [];

  if (!entry || typeof entry !== "object") {
    return {
      success: false,
      issues: [
        {
          severity: "error",
          field: "entry",
          message: "Order entry must be a non-null object.",
        },
      ],
    };
  }

  // 1. Restaurant / Outlet Identifier
  const restID = entry.Restaurant?.restID?.trim();
  if (!restID) {
    issues.push({
      severity: "error",
      field: "Restaurant.restID",
      message: "Order entry is missing required 'Restaurant.restID'.",
    });
  }

  // 2. Order Header
  const order = entry.Order;
  if (!order || typeof order !== "object") {
    return {
      success: false,
      issues: [
        ...issues,
        {
          severity: "error",
          field: "Order",
          message: "Order entry is missing required 'Order' object.",
        },
      ],
    };
  }

  const petpoojaOrderId = typeof order.orderID === "string" ? order.orderID.trim() : String(order.orderID ?? "").trim();
  if (!petpoojaOrderId) {
    issues.push({
      severity: "error",
      field: "Order.orderID",
      message: "Order is missing required 'orderID'.",
    });
  }

  const refId = typeof order.refId === "string" ? order.refId.trim() : String(order.refId ?? "").trim();
  if (!refId) {
    issues.push({
      severity: "warning",
      field: "Order.refId",
      message: "Order has missing or empty 'refId'.",
    });
  }

  // 3. Operational Date & Timestamps
  const dateResult = parseOperationalDate(order.order_date, "Order.order_date");
  if (dateResult.issue) issues.push(dateResult.issue);

  const timestampResult = parseAsiaKolkataTimestamp(order.created_on, "Order.created_on");
  if (timestampResult.issue) issues.push(timestampResult.issue);

  // 4. Status & Order Classification
  const status = typeof order.status === "string" && order.status.trim() ? order.status.trim() : "Success";
  const orderType = typeof order.order_type === "string" && order.order_type.trim() ? order.order_type.trim() : "Unknown";
  const subOrderType = typeof order.sub_order_type === "string" && order.sub_order_type.trim() ? order.sub_order_type.trim() : undefined;
  const orderFrom = typeof order.order_from === "string" && order.order_from.trim() ? order.order_from.trim() : "POS";

  // 5. Financial Totals (Preserving exact reported precision, null when missing)
  const coreTotalRes = parseDecimalValue(order.core_total, "Order.core_total", false);
  if (coreTotalRes.issue) issues.push(coreTotalRes.issue);

  const taxTotalRes = parseDecimalValue(order.tax_total, "Order.tax_total", false);
  if (taxTotalRes.issue) issues.push(taxTotalRes.issue);

  const discountTotalRes = parseDecimalValue(order.discount_total, "Order.discount_total", false);
  if (discountTotalRes.issue) issues.push(discountTotalRes.issue);

  const totalAmountRes = parseDecimalValue(order.total, "Order.total", false);
  if (totalAmountRes.issue) issues.push(totalAmountRes.issue);

  const roundOffRes = parseDecimalValue(order.round_off, "Order.round_off", false);
  if (roundOffRes.issue) issues.push(roundOffRes.issue);

  const serviceChargeRes = parseDecimalValue(order.service_charge, "Order.service_charge", false);
  if (serviceChargeRes.issue) issues.push(serviceChargeRes.issue);

  const deliveryChargesRes = parseDecimalValue(order.delivery_charges, "Order.delivery_charges", false);
  if (deliveryChargesRes.issue) issues.push(deliveryChargesRes.issue);

  const containerChargesRes = parseDecimalValue(order.container_charges, "Order.container_charges", false);
  if (containerChargesRes.issue) issues.push(containerChargesRes.issue);

  // 6. Operational Metadata (Non-PII)
  const paymentType = typeof order.payment_type === "string" && order.payment_type.trim() ? order.payment_type.trim() : "Other";
  const customPaymentType = typeof order.custom_payment_type === "string" && order.custom_payment_type.trim() ? order.custom_payment_type.trim() : undefined;
  const tableNo = typeof order.table_no === "string" && order.table_no.trim() ? order.table_no.trim() : undefined;

  let noOfPersons: number | undefined;
  if (order.no_of_persons !== undefined && order.no_of_persons !== null) {
    const rawPersons = String(order.no_of_persons).trim();
    if (rawPersons !== "") {
      const parsedInt = parseInt(rawPersons, 10);
      if (!Number.isNaN(parsedInt) && parsedInt >= 0) {
        noOfPersons = parsedInt;
      } else {
        issues.push({
          severity: "warning",
          field: "Order.no_of_persons",
          message: `Could not parse 'no_of_persons': '${order.no_of_persons}'.`,
          value: order.no_of_persons,
        });
      }
    }
  }

  // 7. Order Items
  const rawItems = entry.OrderItem;
  const normalizedItems: NormalizedSalesOrderItem[] = [];

  if (!Array.isArray(rawItems)) {
    issues.push({
      severity: "error",
      field: "OrderItem",
      message: "Order is missing 'OrderItem' array or it is not an array.",
    });
  } else if (rawItems.length === 0) {
    // Some cancelled orders at POS may have 0 items, but active orders should have items
    if (status !== "Cancelled") {
      issues.push({
        severity: "warning",
        field: "OrderItem",
        message: "Order has empty 'OrderItem' array.",
      });
    }
  } else {
    for (let i = 0; i < rawItems.length; i++) {
      const { item, issues: itemIssues } = normalizeOrderItem(rawItems[i], i);
      issues.push(...itemIssues);
      if (item) {
        normalizedItems.push(item);
      }
    }
  }

  // Determine fatal failure
  const hasFatalError = issues.some((i) => i.severity === "error");
  if (hasFatalError || !restID || !petpoojaOrderId || !dateResult.dateString || !timestampResult.date) {
    return {
      success: false,
      issues,
    };
  }

  const normalizedOrder: NormalizedSalesOrder = {
    petpoojaRestId: restID,
    petpoojaOrderId,
    refId: refId || "",
    orderDate: dateResult.dateString,
    orderedAt: timestampResult.date,
    orderType,
    subOrderType,
    status,
    orderFrom,
    coreTotal: coreTotalRes.value,
    taxTotal: taxTotalRes.value,
    discountTotal: discountTotalRes.value,
    totalAmount: totalAmountRes.value,
    roundOff: roundOffRes.value,
    paymentType,
    customPaymentType,
    tableNo,
    noOfPersons,
    serviceCharge: serviceChargeRes.value,
    deliveryCharges: deliveryChargesRes.value,
    containerCharges: containerChargesRes.value,
    items: normalizedItems,
  };

  return {
    success: true,
    order: normalizedOrder,
    issues,
  };
}

/**
 * Normalizes an array of raw Petpooja order entries.
 *
 * Provides summary statistics and aggregates all validation issues.
 */
export function normalizePetpoojaBatch(
  entries: PetpoojaPullOrderEntry[]
): NormalizeBatchResult {
  const normalizedOrders: NormalizedSalesOrder[] = [];
  const issuesList: NormalizeBatchResult["issues"] = [];
  let successfulCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const { success, order, issues } = normalizePetpoojaOrder(entry);

    if (issues.length > 0) {
      issuesList.push({
        orderIndex: idx,
        petpoojaOrderId: entry?.Order?.orderID ? String(entry.Order.orderID) : undefined,
        issues,
      });
    }

    if (success && order) {
      successfulCount++;
      normalizedOrders.push(order);
    } else {
      errorCount++;
    }
  }

  return {
    totalReceived: entries.length,
    successfulCount,
    errorCount,
    orders: normalizedOrders,
    issues: issuesList,
  };
}

