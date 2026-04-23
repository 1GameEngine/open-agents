import type { NextRequest } from "next/server";
import { getSessionFromReq } from "@/lib/session/server";
import { checkAndResetDailyPoints } from "@/lib/points/service";
import { DAILY_FREE_POINTS } from "@/lib/db/schema";

export interface PointsBalanceResponse {
  balance: number;
  dailyMax: number;
}

/**
 * GET /api/points/balance
 *
 * Returns the current user's daily points balance (after lazy reset if needed).
 * Used by the chat UI to display remaining quota next to each message cost.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const balance = await checkAndResetDailyPoints(session.user.id);
    return Response.json({ balance, dailyMax: DAILY_FREE_POINTS } satisfies PointsBalanceResponse);
  } catch (error) {
    console.error("[points/balance] Failed to get balance:", error);
    return Response.json({ error: "Failed to get points balance" }, { status: 500 });
  }
}
