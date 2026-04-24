import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats, pointTransactions, sessions } from "@/lib/db/schema";

/**
 * Returns today's date at 00:00:00.000 UTC.
 */
function startOfTodayUtc(): Date {
  const isoDate = new Date().toISOString().slice(0, 10);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export type PointConsumeLedgerRow = {
  id: string;
  amount: number;
  modelId: string | null;
  usdCost: number | null;
  createdAt: Date;
  sessionId: string;
  chatId: string;
  sessionTitle: string;
  chatTitle: string;
};

/**
 * Lists today's `consume` point transactions for a user (UTC day), newest first,
 * with session and chat titles for display and deep links.
 */
export async function listTodayConsumePointTransactions(
  userId: string,
  options?: { limit?: number },
): Promise<PointConsumeLedgerRow[]> {
  const limit = options?.limit ?? 100;
  const start = startOfTodayUtc();

  const rows = await db
    .select({
      id: pointTransactions.id,
      amount: pointTransactions.amount,
      modelId: pointTransactions.modelId,
      usdCost: pointTransactions.usdCost,
      createdAt: pointTransactions.createdAt,
      sessionId: pointTransactions.sessionId,
      chatId: pointTransactions.chatId,
      sessionTitle: sessions.title,
      chatTitle: chats.title,
    })
    .from(pointTransactions)
    .innerJoin(sessions, eq(pointTransactions.sessionId, sessions.id))
    .innerJoin(chats, eq(pointTransactions.chatId, chats.id))
    .where(
      and(
        eq(pointTransactions.userId, userId),
        eq(pointTransactions.type, "consume"),
        gte(pointTransactions.createdAt, start),
      ),
    )
    .orderBy(desc(pointTransactions.createdAt))
    .limit(limit);

  return rows;
}
