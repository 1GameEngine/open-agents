/**
 * Creates a minimal session + chat and records one `deductPoints` turn so the
 * sidebar balance drops and `/settings/points` shows a ledger row (same path
 * as real chat completion, without calling the AI gateway).
 *
 * Run from apps/web with env loaded:
 *   bun run scripts/run-with-env.ts bun run scripts/seed-points-transaction-demo.ts
 *
 * Optional: POINTS_DEMO_USD_COST (default 0.005 → 5 pts), POINTS_DEMO_BASE_URL
 */
import { nanoid } from "nanoid";
import path from "node:path";
import { db } from "@/lib/db/client";
import { chats, sessions, userPoints } from "@/lib/db/schema";
import { DAILY_FREE_POINTS } from "@/lib/points/constants";
import {
  checkAndResetDailyPoints,
  deductPoints,
  usdToPoints,
} from "@/lib/points/service-core";

const SANDBOX_ROOT =
  process.env.SANDBOX_ROOT_DIR ?? path.join(process.cwd(), "data", "sandboxes");

async function main() {
  const keyRow = await db.query.apiKeys.findFirst();
  if (!keyRow) {
    console.error("No API key / user in database. Run bootstrap first.");
    process.exit(1);
  }

  const userId = keyRow.userId;
  const sessionId = nanoid();
  const chatId = nanoid();
  const sandboxDir = path.join(SANDBOX_ROOT, `session_${sessionId}`);
  const today = new Date().toISOString().slice(0, 10);

  const usdRaw = process.env.POINTS_DEMO_USD_COST;
  const usdCost =
    usdRaw !== undefined && usdRaw !== "" ? Number.parseFloat(usdRaw) : 0.005;
  if (!Number.isFinite(usdCost) || usdCost < 0) {
    console.error("POINTS_DEMO_USD_COST must be a non-negative number.");
    process.exit(1);
  }

  const costPoints = usdToPoints(usdCost);
  if (costPoints === 0) {
    console.error(
      "usd cost rounds to 0 points; choose a larger POINTS_DEMO_USD_COST.",
    );
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      title: "积分流水演示会话",
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
      title: "演示对话",
      modelId: "moonshotai/kimi-k2.5",
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

  await checkAndResetDailyPoints(userId);

  await deductPoints({
    userId,
    sessionId,
    chatId,
    modelId: "moonshotai/kimi-k2.5",
    usdCost,
  });

  const after = await checkAndResetDailyPoints(userId);
  const port = process.env.PORT ?? "3000";
  const base = process.env.POINTS_DEMO_BASE_URL ?? `http://127.0.0.1:${port}`;
  const chatUrl = `${base.replace(/\/$/u, "")}/sessions/${sessionId}/chats/${chatId}`;
  const ledgerUrl = `${base.replace(/\/$/u, "")}/settings/points`;

  console.log("\nRecorded one point deduction (consume ledger row).");
  console.log(`  USD cost: ${usdCost} → ${costPoints} pt(s)`);
  console.log(`  Balance after: ${after} / ${DAILY_FREE_POINTS}`);
  console.log(`\nOpen chat: ${chatUrl}`);
  console.log(`Open ledger: ${ledgerUrl}\n`);
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
