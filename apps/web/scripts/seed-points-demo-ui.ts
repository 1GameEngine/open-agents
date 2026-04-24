/**
 * Seeds a minimal session + assistant message with totalMessageCost metadata
 * so the session chat page shows MessageModelPill (points charged + balance).
 *
 * Run from apps/web with env loaded (same as other scripts):
 *   bun run scripts/run-with-env.ts bun run scripts/seed-points-demo-ui.ts
 */
import { nanoid } from "nanoid";
import path from "node:path";
import { db } from "@/lib/db/client";
import { chatMessages, chats, sessions, userPoints } from "@/lib/db/schema";

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
  const userMsgId = nanoid();
  const assistantMsgId = nanoid();
  const sandboxDir = path.join(SANDBOX_ROOT, `session_${sessionId}`);

  const today = new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      title: "Points UI demo",
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
      title: "Demo chat",
      modelId: "moonshotai/kimi-k2.5",
    });

    await tx.insert(chatMessages).values({
      id: userMsgId,
      chatId,
      role: "user",
      parts: {
        id: userMsgId,
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
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
            text: "Demo assistant reply for points display (no AI call).",
          },
        ],
        metadata: {
          selectedModelId: "moonshotai/kimi-k2.5",
          modelId: "moonshotai/kimi-k2.5",
          totalMessageCost: 0.005,
        },
      },
    });

    await tx
      .insert(userPoints)
      .values({
        userId,
        lastResetDate: today,
        dailyPoints: 9_995,
      })
      .onConflictDoUpdate({
        target: userPoints.userId,
        set: {
          lastResetDate: today,
          dailyPoints: 9_995,
          updatedAt: new Date(),
        },
      });
  });

  const port = process.env.PORT ?? "3000";
  const base = process.env.POINTS_DEMO_BASE_URL ?? `http://127.0.0.1:${port}`;
  const url = `${base.replace(/\/$/u, "")}/sessions/${sessionId}/chats/${chatId}`;

  console.log("\nSeeded demo session for points UI.");
  console.log(`Open: ${url}`);
  console.log(
    "Hover the last assistant bubble → model pill should show turn points (5 pts for $0.005) and remaining balance.\n",
  );
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
