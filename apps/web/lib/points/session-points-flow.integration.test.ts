import { describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import path from "node:path";

mock.module("server-only", () => ({}));

const { getPointTransactionsPage } =
  await import("@/lib/db/point-transactions");
const { db } = await import("@/lib/db/client");
const { chats, sessions, userPoints } = await import("@/lib/db/schema");
const { DAILY_FREE_POINTS } = await import("@/lib/points/constants");
const { checkAndResetDailyPoints, deductPoints } =
  await import("@/lib/points/service");

const SANDBOX_ROOT =
  process.env.SANDBOX_ROOT_DIR ?? path.join(process.cwd(), "data", "sandboxes");

/** Opt-in: avoids hanging when POSTGRES_URL points at a down local DB. */
const shouldRun =
  process.env.RUN_POINTS_FLOW_INTEGRATION === "1" &&
  Boolean(process.env.POSTGRES_URL?.trim());

describe.skipIf(!shouldRun)("session points flow (integration)", () => {
  test(
    "deductPoints lowers balance and ledger lists consume row",
    async () => {
      const keyRow = await db.query.apiKeys.findFirst();
      if (!keyRow) {
        throw new Error("No API key — run bootstrap after migrations.");
      }
      const userId = keyRow.userId;
      const row = await db.query.userPoints.findFirst({
        where: eq(userPoints.userId, userId),
      });
      const priorRow = row
        ? { dailyPoints: row.dailyPoints, lastResetDate: row.lastResetDate }
        : null;
      const today = new Date().toISOString().slice(0, 10);
      const sessionId = nanoid();
      const chatId = nanoid();
      const sandboxDir = path.join(SANDBOX_ROOT, `session_${sessionId}`);

      await db
        .insert(userPoints)
        .values({
          userId,
          lastResetDate: today,
          dailyPoints: DAILY_FREE_POINTS,
        })
        .onConflictDoUpdate({
          target: userPoints.userId,
          set: {
            lastResetDate: today,
            dailyPoints: DAILY_FREE_POINTS,
            updatedAt: new Date(),
          },
        });

      const balanceBefore = await checkAndResetDailyPoints(userId);
      expect(balanceBefore).toBe(DAILY_FREE_POINTS);

      try {
        await db.insert(sessions).values({
          id: sessionId,
          userId,
          title: "Points flow verification",
          status: "running",
          sandboxState: {
            type: "local-fs",
            sandboxDir,
            workingDirectory: sandboxDir,
          },
          lifecycleState: "active",
          lifecycleVersion: 1,
        });

        await db.insert(chats).values({
          id: chatId,
          sessionId,
          title: "Verify chat",
          modelId: "moonshotai/kimi-k2.5",
        });

        await deductPoints({
          userId,
          sessionId,
          chatId,
          modelId: "moonshotai/kimi-k2.5",
          usdCost: 0.005,
        });

        const balanceAfter = await checkAndResetDailyPoints(userId);
        expect(balanceAfter).toBe(balanceBefore - 5);

        const page = await getPointTransactionsPage({
          userId,
          limit: 20,
          offset: 0,
        });
        const hit = page.find(
          (r) =>
            r.sessionId === sessionId &&
            r.chatId === chatId &&
            r.type === "consume" &&
            r.amount === -5,
        );
        expect(hit).toBeDefined();
        expect(hit?.sessionTitle).toBe("Points flow verification");
      } finally {
        await db.delete(sessions).where(eq(sessions.id, sessionId));

        if (priorRow) {
          await db
            .update(userPoints)
            .set({
              dailyPoints: priorRow.dailyPoints,
              lastResetDate: priorRow.lastResetDate,
              updatedAt: new Date(),
            })
            .where(eq(userPoints.userId, userId));
        } else {
          await db.delete(userPoints).where(eq(userPoints.userId, userId));
        }
      }
    },
    { timeout: 60_000 },
  );
});
