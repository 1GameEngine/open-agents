/**
 * Formats a billable points count for UI (same rounding rules as `usdToPoints`).
 */
export function formatPointsDisplay(
  points: number,
  locale: string = "zh-CN",
): string {
  const n = Math.max(0, Math.round(points));
  return `${n.toLocaleString(locale)} 积分`;
}
