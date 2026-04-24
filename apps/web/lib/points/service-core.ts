import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { DAILY_FREE_POINTS } from "@/lib/points/constants";
import { usdToPoints } from "@/lib/points/cost-to-points";
import { pointTransactions, userPoints } from "@/lib/db/schema";

export { usdToPoints } from "@/lib/points/cost-to-points";

/**
 * Returns today's date in YYYY-MM-DD format (UTC).
 */
function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Checks the user's current daily points balance, resetting it to
 * DAILY_FREE_POINTS if the stored date is not today (UTC).
 *
 * Uses an UPSERT so the first call for a brand-new user also works.
 *
 * @returns The number of points available after any necessary reset.
 */
export async function checkAndResetDailyPoints(
  userId: string,
): Promise<number> {
  const today = getTodayUtc();

  // Upsert: create the row if it doesn't exist, then read it back.
  await db
    .insert(userPoints)
    .values({
      userId,
      lastResetDate: today,
      dailyPoints: DAILY_FREE_POINTS,
    })
    .onConflictDoNothing();

  const row = await db.query.userPoints.findFirst({
    where: eq(userPoints.userId, userId),
  });

  if (!row) {
    // Should never happen after the upsert above, but be defensive.
    return 0;
  }

  // If the stored date is stale, reset the balance for today.
  if (row.lastResetDate !== today) {
    await db
      .update(userPoints)
      .set({
        dailyPoints: DAILY_FREE_POINTS,
        lastResetDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userPoints.userId, userId));

    return DAILY_FREE_POINTS;
  }

  return row.dailyPoints;
}

/**
 * Deducts `costPoints` from the user's daily balance and records a
 * point_transactions row keyed by sessionId + chatId.
 *
 * The deduction is performed with a single atomic UPDATE so concurrent
 * requests cannot produce a negative balance race condition.
 *
 * If `usdCost` is not provided (gateway did not report a cost), the
 * deduction defaults to 1 point to ensure every turn is tracked.
 */
export async function deductPoints(params: {
  userId: string;
  sessionId: string;
  chatId: string;
  modelId: string;
  usdCost?: number;
}): Promise<void> {
  const { userId, sessionId, chatId, modelId, usdCost } = params;

  const costPoints = usdCost !== undefined ? usdToPoints(usdCost) : 1;

  if (costPoints === 0) {
    return;
  }

  // Atomic deduction — clamp at 0 so the balance never goes negative.
  await db
    .update(userPoints)
    .set({
      dailyPoints: sql`GREATEST(${userPoints.dailyPoints} - ${costPoints}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(userPoints.userId, userId));

  // Append the ledger entry.
  await db.insert(pointTransactions).values({
    id: nanoid(),
    userId,
    sessionId,
    chatId,
    type: "consume",
    amount: -costPoints,
    modelId,
    usdCost: usdCost ?? null,
  });
}
