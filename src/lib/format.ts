/**
 * Shared number/currency formatting, ported from the Lovable UI's
 * src/lib/format.ts (pure functions, no analytics or framework
 * coupling — safe to use from both server and client components).
 * Centralized here so every dashboard widget formats numbers the same
 * way instead of ad-hoc `toLocaleString()` calls scattered per component.
 */

export const inr = (value: number, opts: { compact?: boolean; decimals?: number } = {}) => {
  const { compact = false, decimals = 0 } = opts;
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (abs >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  }
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const num = (value: number, decimals = 0) =>
  value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const pct = (value: number, decimals = 1) => `${value.toFixed(decimals)}%`;

export const signedPct = (value: number, decimals = 1) =>
  `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
