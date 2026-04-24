import type { NextRequest } from "next/server";
import { listPointTransactionHistory } from "@/lib/db/point-transactions";
import { getSessionFromReq } from "@/lib/session/server";

export type PointTransactionHistoryItem = {
  id: string;
  sessionId: string;
  chatId: string;
  type: "consume" | "daily_reset";
  amount: number;
  modelId: string | null;
  usdCost: number | null;
  createdAt: string;
  sessionTitle: string;
};

export type PointsTransactionsResponse = {
  transactions: PointTransactionHistoryItem[];
};

/**
 * GET /api/points/transactions
 *
 * Returns recent point ledger rows for the current user (newest first).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsed =
    limitParam !== null ? Number.parseInt(limitParam, 10) : undefined;
  const limit =
    parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;

  try {
    const rows = await listPointTransactionHistory(session.user.id, {
      limit,
    });
    const transactions: PointTransactionHistoryItem[] = rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      chatId: row.chatId,
      type: row.type,
      amount: row.amount,
      modelId: row.modelId,
      usdCost: row.usdCost,
      createdAt: row.createdAt.toISOString(),
      sessionTitle: row.sessionTitle,
    }));
    return Response.json({ transactions } satisfies PointsTransactionsResponse);
  } catch (error) {
    console.error("[points/transactions] Failed to list transactions:", error);
    return Response.json(
      { error: "Failed to load point transactions" },
      { status: 500 },
    );
  }
}
