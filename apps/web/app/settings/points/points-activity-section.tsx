"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PointsTransactionsResponse } from "@/app/api/points/transactions/route";
import { usePointsBalance } from "@/hooks/use-points-balance";
import { POINTS_TRANSACTIONS_API_PATH } from "@/lib/points/swr-key";
import { fetcher } from "@/lib/swr";

const PAGE_LIMIT = 50;
const FIRST_PAGE_URL = `${POINTS_TRANSACTIONS_API_PATH}?offset=0&limit=${PAGE_LIMIT}`;

function formatModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const i = modelId.indexOf("/");
  return i >= 0 ? modelId.slice(i + 1) : modelId;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PointsActivitySection() {
  const { balance, dailyMax, isLoading: balanceLoading } = usePointsBalance();
  const { data, error, isLoading, mutate } = useSWR<PointsTransactionsResponse>(
    FIRST_PAGE_URL,
    fetcher,
    { refreshInterval: 15_000 },
  );

  const [extraItems, setExtraItems] = useState<
    PointsTransactionsResponse["items"]
  >([]);
  /** After at least one extra page fetch, next offset from the last tail response. */
  const [tailNextOffset, setTailNextOffset] = useState<number | null>(null);
  const [tailLoading, setTailLoading] = useState(false);
  const [tailError, setTailError] = useState<string | null>(null);
  const firstPageHeadIdRef = useRef<string | null>(null);

  const firstPageItems = data?.items;
  const page1NextOffset = data?.nextOffset ?? null;
  const firstPageHeadId = firstPageItems?.[0]?.id ?? null;

  useEffect(() => {
    if (firstPageHeadId === null) {
      return;
    }
    if (firstPageHeadIdRef.current !== firstPageHeadId) {
      firstPageHeadIdRef.current = firstPageHeadId;
      setExtraItems([]);
      setTailNextOffset(null);
      setTailError(null);
    }
  }, [firstPageHeadId]);

  const items = useMemo(
    () => [...(firstPageItems ?? []), ...extraItems],
    [firstPageItems, extraItems],
  );

  const nextListOffset =
    extraItems.length === 0 ? page1NextOffset : tailNextOffset;

  const canLoadMore = nextListOffset !== null && items.length > 0;

  const loadMore = useCallback(async () => {
    if (nextListOffset === null) return;

    setTailLoading(true);
    setTailError(null);
    try {
      const res = await fetch(
        `${POINTS_TRANSACTIONS_API_PATH}?offset=${nextListOffset}&limit=${PAGE_LIMIT}`,
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const body = (await res.json()) as PointsTransactionsResponse;
      setExtraItems((prev) => [...prev, ...body.items]);
      setTailNextOffset(body.nextOffset);
    } catch {
      setTailError("加载失败，请重试");
    } finally {
      setTailLoading(false);
    }
  }, [nextListOffset]);

  const balanceLabel =
    balance === null || balanceLoading ? "…" : balance.toLocaleString("zh-CN");

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          今日剩余积分（UTC 日）
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {balanceLabel}
          <span className="text-base font-normal text-muted-foreground">
            {" "}
            / {dailyMax.toLocaleString("zh-CN")}
          </span>
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          消耗与变动明细
        </h2>
        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">无法加载明细。</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无积分流水记录。</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((row) => {
              const sessionHref = `/sessions/${row.sessionId}/chats/${row.chatId}`;
              const modelShort = formatModelId(row.modelId);
              const isConsume = row.type === "consume";

              return (
                <li key={row.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {isConsume ? "对话消耗" : "每日重置"}
                        {modelShort ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            · {modelShort}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatTime(row.createdAt)}
                      </p>
                      <Link
                        href={sessionHref}
                        className="mt-1 inline-block max-w-full truncate text-xs text-primary underline-offset-2 hover:underline"
                      >
                        来源会话：{row.sessionTitle}
                      </Link>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                        row.amount < 0
                          ? "text-destructive"
                          : "text-green-600 dark:text-green-500"
                      }`}
                    >
                      {row.amount > 0 ? "+" : ""}
                      {row.amount.toLocaleString("zh-CN")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canLoadMore ? (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tailLoading}
              onClick={() => void loadMore()}
            >
              {tailLoading ? "加载中…" : "加载更多"}
            </Button>
            {tailError ? (
              <p className="text-xs text-destructive">{tailError}</p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          余额会随对话自动扣减；离开本页后侧栏与首页仍会定期刷新。
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-auto px-0 text-xs text-muted-foreground"
          onClick={() => void mutate()}
        >
          立即刷新列表
        </Button>
      </div>
    </div>
  );
}
