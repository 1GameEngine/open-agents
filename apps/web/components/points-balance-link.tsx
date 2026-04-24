"use client";

import Link from "next/link";
import { usePointsBalance } from "@/hooks/use-points-balance";

type PointsBalanceLinkProps = {
  className?: string;
};

/**
 * Compact daily points balance; links to activity detail in settings.
 */
export function PointsBalanceLink({ className }: PointsBalanceLinkProps) {
  const { balance, dailyMax, isLoading, error } = usePointsBalance();

  if (error) {
    return null;
  }

  const label =
    balance === null || isLoading ? "…" : balance.toLocaleString("zh-CN");
  const suffix =
    balance !== null && !isLoading
      ? ` / ${dailyMax.toLocaleString("zh-CN")}`
      : "";

  return (
    <Link
      href="/settings/points"
      className={
        className ??
        "flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      }
      title="每日积分 · 点击查看明细"
    >
      <span className="shrink-0 font-medium text-foreground/80">积分</span>
      <span className="truncate font-mono tabular-nums">
        {label}
        <span className="text-muted-foreground">{suffix}</span>
      </span>
    </Link>
  );
}
