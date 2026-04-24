import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pointTransactions, sessions } from "@/lib/db/schema";

export type PointTransactionHistoryRow = {
  id: string;
  sessionId: string;
  chatId: string;
  type: "consume" | "daily_reset";
  amount: number;
  modelId: string | null;
  usdCost: number | null;
  createdAt: Date;
  sessionTitle: string;
};

/**
 * Ledger rows for the points UI, newest first. Joins session title for display.
 */
export async function listPointTransactionHistory(
  userId: string,
  options: { limit?: number } = {},
): Promise<PointTransactionHistoryRow[]> {
  const rawLimit = options.limit ?? 100;
  const limit = Math.min(Math.max(rawLimit, 1), 200);

  const rows = await db
    .select({
      id: pointTransactions.id,
      sessionId: pointTransactions.sessionId,
      chatId: pointTransactions.chatId,
      type: pointTransactions.type,
      amount: pointTransactions.amount,
      modelId: pointTransactions.modelId,
      usdCost: pointTransactions.usdCost,
      createdAt: pointTransactions.createdAt,
      sessionTitle: sessions.title,
    })
    .from(pointTransactions)
    .innerJoin(sessions, eq(sessions.id, pointTransactions.sessionId))
    .where(eq(pointTransactions.userId, userId))
    .orderBy(desc(pointTransactions.createdAt))
    .limit(limit);

  return rows;
}
