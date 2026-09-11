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
export { getDepartments } from "./departments";
export { getCategories } from "./categories";
export { getProducts } from "./products";
export { getIngredients } from "./ingredients";
export { getRecipes } from "./recipes";
export { getEmployees } from "./employees";
export { getSales } from "./sales";
export { getSaleItems } from "./sale-items";
export { getPreparation } from "./preparation";
export { getWastage } from "./wastage";
export { getBreakage } from "./breakage";
export { getAttendance } from "./attendance";
export { getOperatingCosts } from "./operating-costs";
