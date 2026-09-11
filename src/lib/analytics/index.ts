import "server-only";

/**
 * Analytics layer: pure aggregation/calculation functions built on top of
 * `src/lib/data`, following the definitions in mock_data/business-rules.md.
 * Dashboard pages should prefer these over calling the data layer (or
 * mock_data) directly. See docs/architecture.md.
 */
export * from "./date-range";
export * from "./comparison";
export * from "./sales";
export * from "./profitability";
export * from "./wastage";
export * from "./breakage";
export * from "./preparation";
export * from "./attendance";
export * from "./manpower";
export * from "./operating-costs";
export * from "./operational-contribution";
export * from "./summary";
