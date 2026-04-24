"use client";
import useSWR from "swr";
import type { PointsBalanceResponse } from "@/app/api/points/balance/route";
import { DAILY_FREE_POINTS } from "@/lib/points/constants";
import { POINTS_BALANCE_SWR_KEY } from "@/lib/points/swr-key";
import { fetcher } from "@/lib/swr";

/**
 * Fetches the current user's daily points balance.
 * Re-validates automatically after each AI response completes (caller should
 * call `mutate()` after a chat round-trip).
 */
export function usePointsBalance() {
  const { data, error, isLoading, mutate } = useSWR<PointsBalanceResponse>(
    POINTS_BALANCE_SWR_KEY,
    fetcher,
    {
      // Revalidate on an interval so menu / chat UIs reflect usage without manual refresh.
      refreshInterval: 12_000,
      // Keep showing stale data while revalidating to avoid flicker.
      revalidateOnFocus: false,
    },
  );

  return {
    balance: data?.balance ?? null,
    dailyMax: data?.dailyMax ?? DAILY_FREE_POINTS,
    isLoading,
    error: error ?? null,
    mutate,
  };
}
