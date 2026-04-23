"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import type { PointsBalanceResponse } from "@/app/api/points/balance/route";

/**
 * Fetches the current user's daily points balance.
 * Re-validates automatically after each AI response completes (caller should
 * call `mutate()` after a chat round-trip).
 */
export function usePointsBalance() {
  const { data, error, isLoading, mutate } = useSWR<PointsBalanceResponse>(
    "/api/points/balance",
    fetcher,
    {
      // Revalidate every 30 s so the display stays reasonably fresh.
      refreshInterval: 30_000,
      // Keep showing stale data while revalidating to avoid flicker.
      revalidateOnFocus: false,
    },
  );

  return {
    balance: data?.balance,
    dailyMax: data?.dailyMax,
    isLoading,
    error: error ?? null,
    mutate,
  };
}
