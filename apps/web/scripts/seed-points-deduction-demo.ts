/**
 * Inserts a minimal session + chat, resets today's points to the daily max,
 * then runs one `deductPoints` call (same path as post-chat workflow) so the
 * sidebar balance and /settings/points history show a real consume row.
 *
 * Prefer user `1game:dev-local-1` (Mock SSO default) when present.
 *
 * From apps/web (with DB running, e.g. `bun run dev:pglite`):
 *   bun run scripts/run-with-env.ts bun run scripts/seed-points-deduction-demo.ts
 */
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import path from "node:path";
import { db } from "@/lib/db/client";
import {
  chats,
  chatMessages,
  pointTransactions,
  sessions,
  users,
  userPoints,
} from "@/lib/db/schema";
import { DAILY_FREE_POINTS } from "@/lib/points/constants";
import {
  checkAndResetDailyPoints,
  deductPoints,
} from "@/lib/points/service-impl";
import { usdToPoints } from "@/lib/points/cost-to-points";

const MOCK_1GAME_EXTERNAL_ID = "1game:dev-local-1";
const DEMO_USD_COST = 0.005;

const SANDBOX_ROOT =
  process.env.SANDBOX_ROOT_DIR ?? path.join(process.cwd(), "data", "sandboxes");

async function resolveUserId(): Promise<string> {
  const ssoUser = await db.query.users.findFirst({
    where: and(
      eq(users.provider, "1game"),
      eq(users.externalId, MOCK_1GAME_EXTERNAL_ID),
    ),
  });
  if (ssoUser) {
    return ssoUser.id;
  }

  const first = await db.query.users.findFirst();
  if (!first) {
    console.error(
      "No users in the database. Log in once via mock SSO or run bootstrap.",
    );
    process.exit(1);
  }

  console.warn(
    `[seed-points-deduct] No user with externalId ${MOCK_1GAME_EXTERNAL_ID}; using first user (${first.username}).`,
  );
  return first.id;
}

async function main() {
  const userId = await resolveUserId();
  const sessionId = nanoid();
  const chatId = nanoid();
  const userMsgId = nanoid();
  const assistantMsgId = nanoid();
  const sandboxDir = path.join(SANDBOX_ROOT, `session_${sessionId}`);
  const today = new Date().toISOString().slice(0, 10);
  const modelId = "moonshotai/kimi-k2.5";
  const costPoints = usdToPoints(DEMO_USD_COST);

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      title: "Points deduction demo",
      status: "running",
      sandboxState: {
        type: "local-fs",
        sandboxDir,
        workingDirectory: sandboxDir,
      },
      lifecycleState: "active",
      lifecycleVersion: 1,
    });

    await tx.insert(chats).values({
      id: chatId,
      sessionId,
      title: "Demo chat (deduction)",
      modelId,
    });

    await tx.insert(chatMessages).values({
      id: userMsgId,
      chatId,
      role: "user",
      parts: {
        id: userMsgId,
        role: "user",
        parts: [{ type: "text", text: "Seed message (no AI)." }],
      },
    });

    await tx.insert(chatMessages).values({
      id: assistantMsgId,
      chatId,
      role: "assistant",
      parts: {
        id: assistantMsgId,
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Synthetic assistant turn for points ledger demo.",
          },
        ],
        metadata: {
          selectedModelId: modelId,
          modelId,
          totalMessageCost: DEMO_USD_COST,
        },
      },
    });

    await tx
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
  });

  await deductPoints({
    userId,
    sessionId,
    chatId,
    modelId,
    usdCost: DEMO_USD_COST,
  });

  const balance = await checkAndResetDailyPoints(userId);
  const recent = await db
    .select({
      amount: pointTransactions.amount,
      type: pointTransactions.type,
      sessionTitle: sessions.title,
    })
    .from(pointTransactions)
    .innerJoin(sessions, eq(sessions.id, pointTransactions.sessionId))
    .where(eq(pointTransactions.userId, userId))
    .orderBy(desc(pointTransactions.createdAt))
    .limit(5);
  const lastConsume = recent.find((r) => r.type === "consume");

  const port = process.env.PORT ?? "3000";
  const base = process.env.POINTS_DEMO_BASE_URL ?? `http://127.0.0.1:${port}`;

  console.log("\n[seed-points-deduct] Done.");
  console.log(`  User:        ${userId}`);
  console.log(
    `  Deducted:    ${costPoints} pts ($${String(DEMO_USD_COST)} → balance ${balance})`,
  );
  console.log(`  Session:     ${sessionId}`);
  console.log(`  Chat:        ${chatId}`);
  if (lastConsume) {
    console.log(
      `  Last ledger: amount=${lastConsume.amount} session="${lastConsume.sessionTitle}"`,
    );
  }
  console.log(
    `\n  Chat URL:    ${base.replace(/\/$/u, "")}/sessions/${sessionId}/chats/${chatId}`,
  );
  console.log(`  Points page: ${base.replace(/\/$/u, "")}/settings/points\n`);
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
