"use client";

import useSWR from "swr";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PointsTransactionsResponse } from "@/app/api/points/transactions/route";
import { POINTS_TRANSACTIONS_SWR_KEY } from "@/lib/points/swr-key";
import { fetcher } from "@/lib/swr";
import { usePointsBalance } from "@/hooks/use-points-balance";

function displayModelId(modelId: string | null): string {
  if (!modelId) return "—";
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function PointsLedgerSection() {
  const { balance, dailyMax, isLoading: balanceLoading } = usePointsBalance();
  const { data, error, isLoading } = useSWR<PointsTransactionsResponse>(
    POINTS_TRANSACTIONS_SWR_KEY,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );

  const items = data?.items ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">每日积分</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按 UTC 自然日统计；余额会在聊天消耗后自动更新。
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
        {balanceLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-muted-foreground">今日剩余</span>
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {balance?.toLocaleString("zh-CN") ?? "—"}
            </span>
            <span className="text-sm text-muted-foreground">
              / {dailyMax.toLocaleString("zh-CN")}（每日上限）
            </span>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          今日消耗明细
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            无法加载明细，请稍后重试。
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            今日尚无积分消耗记录。
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-mono tabular-nums font-semibold text-foreground">
                      −{row.points.toLocaleString("zh-CN")} 分
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {formatTime(row.createdAt)}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate text-muted-foreground">
                      {displayModelId(row.modelId)}
                    </span>
                  </div>
                  <Button
                    variant="link"
                    asChild
                    className="h-auto min-h-0 p-0 text-left text-sm font-normal text-foreground underline-offset-4 hover:text-foreground"
                  >
                    <Link
                      href={row.href}
                      className="inline-flex items-center gap-1"
                    >
                      <span className="truncate">
                        来源会话：{row.sessionTitle}
                        {row.chatTitle !== row.sessionTitle ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {row.chatTitle}
                          </span>
                        ) : null}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
