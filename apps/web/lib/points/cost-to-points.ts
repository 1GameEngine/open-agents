/**
 * Converts a gateway-reported USD cost to billable points (same rules as server deduction).
 * 1 point = $0.001, so points = ceil(usdCost * 1000).
 * Returns at least 1 point when cost > 0 so every paid turn is visible in the ledger.
 */
export function usdToPoints(usdCost: number): number {
  if (usdCost <= 0) return 0;
  return Math.max(1, Math.ceil(usdCost * 1000));
}
