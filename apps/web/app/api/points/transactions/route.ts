import type { NextRequest } from "next/server";
import { getSessionFromReq } from "@/lib/session/server";
import { listTodayConsumePointTransactions } from "@/lib/points/transaction-history";

export type PointsTransactionItem = {
  id: string;
  /** Negative for consumption */
  amount: number;
  /** Absolute points consumed (for display) */
  points: number;
  modelId: string | null;
  usdCost: number | null;
  createdAt: string;
  sessionId: string;
  chatId: string;
  sessionTitle: string;
  chatTitle: string;
  /** Path to open the originating chat */
  href: string;
};

export type PointsTransactionsResponse = {
  items: PointsTransactionItem[];
};

/**
 * GET /api/points/transactions
 *
 * Today's point consumption ledger (UTC) for the signed-in user.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromReq(request);
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const rows = await listTodayConsumePointTransactions(session.user.id);
    const items: PointsTransactionItem[] = rows.map((row) => {
      const points = Math.abs(row.amount);
      return {
        id: row.id,
        amount: row.amount,
        points,
        modelId: row.modelId,
        usdCost: row.usdCost,
        createdAt: row.createdAt.toISOString(),
        sessionId: row.sessionId,
        chatId: row.chatId,
        sessionTitle: row.sessionTitle,
        chatTitle: row.chatTitle,
        href: `/sessions/${row.sessionId}/chats/${row.chatId}`,
      };
    });

    return Response.json({ items } satisfies PointsTransactionsResponse);
  } catch (error) {
    console.error("[points/transactions] Failed to list transactions:", error);
    return Response.json(
      { error: "Failed to load point transactions" },
      { status: 500 },
    );
  }
}
