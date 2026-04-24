import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pointTransactions, sessions } from "@/lib/db/schema";

export type PointTransactionListRow = {
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
 * Ledger rows for the points UI (newest first), scoped to the user.
 * Joins `sessions` so we can show titles and enforce ownership.
 */
export async function getPointTransactionsPage(params: {
  userId: string;
  limit: number;
  offset: number;
}): Promise<PointTransactionListRow[]> {
  const { userId, limit, offset } = params;

  return db
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
    .where(
      and(eq(pointTransactions.userId, userId), eq(sessions.userId, userId)),
    )
    .orderBy(desc(pointTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}
