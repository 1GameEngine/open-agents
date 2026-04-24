"use client";

import { Coins, ExternalLink } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePointsBalance } from "@/hooks/use-points-balance";
import { DAILY_FREE_POINTS } from "@/lib/points/constants";
import { POINTS_TRANSACTIONS_SWR_KEY } from "@/lib/points/swr-key";
import type { PointsTransactionsResponse } from "@/app/api/points/transactions/route";
import { fetcher } from "@/lib/swr";

function formatPointsDelta(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("en-US")}`;
}

export function PointsHistorySection() {
  const { balance, dailyMax, isLoading: balanceLoading } = usePointsBalance();
  const { data, error, isLoading } = useSWR<PointsTransactionsResponse>(
    POINTS_TRANSACTIONS_SWR_KEY,
    fetcher,
    {
      refreshInterval: 12_000,
      revalidateOnFocus: true,
    },
  );

  const dailyCap = dailyMax ?? DAILY_FREE_POINTS;
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily points</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Free quota resets each UTC day. Usage from AI turns is deducted as
          points (1 pt ≈ $0.001 of reported cost).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Coins className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Remaining today
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {balanceLoading && balance === null ? (
                <span className="inline-block h-9 w-28 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  {(balance ?? 0).toLocaleString("en-US")}
                  <span className="text-lg font-normal text-muted-foreground">
                    {" "}
                    / {dailyCap.toLocaleString("en-US")}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">History</h2>
        {error ? (
          <p className="text-sm text-destructive">
            Could not load history. Try refreshing the page.
          </p>
        ) : isLoading && transactions.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No point activity yet. Start a session and send a message to see
            deductions here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    Time (UTC)
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Change</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead className="hidden sm:table-cell">Model</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((row) => {
                  const sessionHref = `/sessions/${row.sessionId}/chats/${row.chatId}`;
                  const isReset = row.type === "daily_reset";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {new Date(row.createdAt)
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 19)}
                      </TableCell>
                      <TableCell
                        className={
                          row.amount < 0
                            ? "font-medium tabular-nums text-destructive"
                            : "font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {formatPointsDelta(row.amount)}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {isReset ? (
                          <span className="text-sm text-muted-foreground">
                            Daily quota
                          </span>
                        ) : (
                          <Button variant="link" className="h-auto p-0" asChild>
                            <Link
                              href={sessionHref}
                              className="inline-flex max-w-full items-center gap-1 truncate text-left"
                            >
                              <span className="truncate">
                                {row.sessionTitle}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:table-cell">
                        {row.modelId ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
