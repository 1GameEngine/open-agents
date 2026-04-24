/**
 * End-to-end check: one real POST /api/chat (Vercel AI Gateway) → workflow
 * finish → points balance drops and /api/points/transactions shows a consume row.
 *
 * Prerequisites:
 * - `AI_GATEWAY_API_KEY` set (same as normal dev).
 * - Next + DB running, e.g. `bun run dev:pglite` from apps/web.
 * - A valid self-hosted API key for the user you want to debit (bootstrap key).
 *
 * Run from apps/web:
 *   E2E_API_KEY=oha_... bun run scripts/run-with-env.ts bun run scripts/e2e-real-ai-points.ts
 *
 * Optional env:
 *   E2E_APP_BASE_URL   — default http://127.0.0.1:3000
 *   E2E_CHAT_MESSAGE   — default short prompt (English) to minimize tokens
 *   E2E_POLL_MS        — default 4000
 *   E2E_TIMEOUT_MS     — default 180000
 */

const baseUrl = (
  process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/u, "");
const apiKey = process.env.E2E_API_KEY?.trim();
const userMessage =
  process.env.E2E_CHAT_MESSAGE?.trim() ??
  "Reply with exactly one word: OK. No tools.";

const pollMs = readPositiveInt(process.env.E2E_POLL_MS, 4000);
const timeoutMs = readPositiveInt(process.env.E2E_TIMEOUT_MS, 180_000);

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requireApiKey(): string {
  if (!apiKey) {
    throw new Error(
      "E2E_API_KEY is required (self-hosted API key, e.g. from bootstrap / SSO cookie key).",
    );
  }
  return apiKey;
}

function mergeHeaders(
  base: Record<string, string>,
  extra?: HeadersInit,
): Headers {
  const h = new Headers(base);
  if (!extra) {
    return h;
  }
  const extraH = new Headers(extra);
  for (const [k, v] of extraH.entries()) {
    h.set(k, v);
  }
  return h;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const bearer = { Authorization: `Bearer ${requireApiKey()}` };
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = mergeHeaders(
    method === "GET" || method === "HEAD"
      ? bearer
      : { ...bearer, "content-type": "application/json" },
    init?.headers,
  );

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

interface PointsBalanceResponse {
  balance: number;
  dailyMax: number;
}

interface PointsTransactionsResponse {
  transactions: Array<{
    id: string;
    sessionId: string;
    chatId: string;
    type: "consume" | "daily_reset";
    amount: number;
  }>;
}

interface CreateSessionResponse {
  session: { id: string };
  chat: { id: string };
}

async function drainStreamBody(res: Response): Promise<void> {
  if (!res.body) {
    return;
  }
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error(
      "AI_GATEWAY_API_KEY is missing. Set it in apps/web/.env.local (or env) so /api/chat can call the gateway.",
    );
    process.exit(1);
  }

  console.log(`[e2e-real-ai-points] Base URL: ${baseUrl}`);

  const beforeBalance = await jsonFetch<PointsBalanceResponse>(
    "/api/points/balance",
  );
  console.log(
    `[e2e-real-ai-points] Balance before: ${beforeBalance.balance} / ${beforeBalance.dailyMax}`,
  );

  const created = await jsonFetch<CreateSessionResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      title: "E2E points — real AI",
    }),
  });

  const { id: sessionId } = created.session;
  const { id: chatId } = created.chat;
  console.log(`[e2e-real-ai-points] Session ${sessionId}, chat ${chatId}`);

  await jsonFetch("/api/sandbox", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      sandboxType: "local-fs",
    }),
  });
  console.log("[e2e-real-ai-points] Sandbox ready (local-fs).");

  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: mergeHeaders({
      Authorization: `Bearer ${requireApiKey()}`,
      "content-type": "application/json",
    }),
    body: JSON.stringify({
      sessionId,
      chatId,
      messages: [
        {
          id: `e2e-user-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text: userMessage }],
        },
      ],
    }),
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`/api/chat → ${chatRes.status}: ${errText.slice(0, 800)}`);
  }

  console.log("[e2e-real-ai-points] Streaming chat response (draining body)…");
  await drainStreamBody(chatRes);
  console.log("[e2e-real-ai-points] Stream finished.");

  const deadline = Date.now() + timeoutMs;
  let lastBalance = beforeBalance.balance;
  let sawConsumeForSession = false;

  while (Date.now() < deadline) {
    const bal = await jsonFetch<PointsBalanceResponse>("/api/points/balance");
    lastBalance = bal.balance;

    const tx = await jsonFetch<PointsTransactionsResponse>(
      "/api/points/transactions?limit=20",
    );
    sawConsumeForSession = tx.transactions.some(
      (row) =>
        row.sessionId === sessionId && row.type === "consume" && row.amount < 0,
    );

    if (lastBalance < beforeBalance.balance || sawConsumeForSession) {
      console.log(
        `[e2e-real-ai-points] OK — balance after: ${lastBalance} (was ${beforeBalance.balance}); ledger hit for session: ${sawConsumeForSession}`,
      );
      process.exit(0);
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  console.error(
    `[e2e-real-ai-points] Timeout after ${timeoutMs}ms. Last balance: ${lastBalance} (unchanged vs ${beforeBalance.balance}).`,
  );
  console.error(
    "If the model run succeeded but balance did not move, check gateway cost metadata (totalMessageCost) in workflow logs.",
  );
  process.exit(1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
