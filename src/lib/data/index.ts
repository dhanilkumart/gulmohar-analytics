import "server-only";

/**
 * Centralized data access layer (mock-data implementation).
 *
 * This is the ONLY layer allowed to know that data currently lives in
 * `mock_data/*.json`. Pages and components must go through these
 * functions (or, preferably, through `src/lib/analytics`) instead of
 * reading JSON files directly. See docs/architecture.md.
 */
export { getRestaurant } from "./restaurant";
export { getDepartments, type DepartmentFilterOptions } from "./departments";
export { getCategories, type CategoryFilterOptions } from "./categories";
export { getProducts, type ProductFilterOptions } from "./products";
export { getIngredients } from "./ingredients";
export { getRecipes } from "./recipes";
export { getEmployees } from "./employees";
export { getSales, type SalesFilterOptions } from "./sales";
export { getSaleItems } from "./sale-items";
export { getPreparation } from "./preparation";
export { getPreparationLogs, type PreparationFilterOptions, type PreparationRecordItem } from "./preparation-logs";
export { getPreparationItems, type PreparationItemOption } from "./preparation-items";
export { getWastage, type WastageFilterOptions } from "./wastage";
export { getBreakage, type BreakageFilterOptions } from "./breakage";
export { getAttendance } from "./attendance";
export { getOperatingCosts } from "./operating-costs";
export { getActiveMasterOptions, type MasterOptions } from "./master-options";
