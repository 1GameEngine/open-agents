/**
 * End-to-end check: one real /api/chat turn (AI Gateway) → points decrease →
 * GET /api/points/transactions shows a consume row.
 *
 * Prerequisites:
 *   - Stack running: `bun run mock:sso` + `bun run web:dev:pglite` (or Postgres + `bun run web`)
 *   - `AI_GATEWAY_API_KEY` set (e.g. in apps/web/.env.local)
 *   - Bootstrap API key matches env (default dev key in apps/web/.env)
 *
 * Run:
 *   bun run --cwd apps/web e2e:points-ai
 *
 * Env:
 *   E2E_BASE_URL          — default http://127.0.0.1:3000
 *   E2E_SELF_HOSTED_API_KEY — default: NEXT_PUBLIC_SELF_HOSTED_API_KEY then BOOTSTRAP_API_KEY
 *   E2E_CHAT_PROMPT       — default "Reply with exactly: OK"
 *   E2E_STREAM_TIMEOUT_MS — max time to read chat stream (default 300_000)
 *   E2E_POLL_TIMEOUT_MS   — max time to wait for ledger (default 120_000)
 */
import { randomUUID } from "node:crypto";

type PointsBalanceJson = { balance: number; dailyMax: number };
type PointsTransactionsJson = {
  items: Array<{ id: string; points: number; sessionTitle: string }>;
};

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

function resolveApiKey(): string {
  const fromExplicit = env("E2E_SELF_HOSTED_API_KEY");
  if (fromExplicit) return fromExplicit;
  const pub = env("NEXT_PUBLIC_SELF_HOSTED_API_KEY");
  if (pub) return pub;
  const boot = env("BOOTSTRAP_API_KEY");
  if (boot) return boot;
  throw new Error(
    "Set E2E_SELF_HOSTED_API_KEY or NEXT_PUBLIC_SELF_HOSTED_API_KEY or BOOTSTRAP_API_KEY",
  );
}

async function readStreamToEnd(
  body: ReadableStream<Uint8Array> | null,
  timeoutMs: number,
): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`Stream read exceeded ${timeoutMs}ms`);
      }
      const { done } = await reader.read();
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

async function fetchJson<T>(
  base: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  const res = await fetch(`${base.replace(/\/$/u, "")}${path}`, init);
  const text = await res.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  if (!env("AI_GATEWAY_API_KEY")) {
    console.error("AI_GATEWAY_API_KEY is required for a real model call.");
    process.exit(1);
  }

  const base = env("E2E_BASE_URL", "http://127.0.0.1:3000")!;
  const apiKey = resolveApiKey();
  const authHeader = { Authorization: `Bearer ${apiKey}` };
  const prompt =
    env("E2E_CHAT_PROMPT", "Reply with exactly the two letters: OK") ?? "OK";
  const streamTimeout = Number(env("E2E_STREAM_TIMEOUT_MS", "300000"));
  const pollTimeout = Number(env("E2E_POLL_TIMEOUT_MS", "120000"));

  const health = await fetch(`${base}/api/auth/info`, { headers: authHeader });
  if (!health.ok) {
    console.error(
      `GET /api/auth/info failed (${health.status}). Is the app up and is the API key valid?\n${await health.text()}`,
    );
    process.exit(1);
  }

  const balanceBeforeRes = await fetchJson<PointsBalanceJson>(
    base,
    "/api/points/balance",
    { headers: authHeader },
  );
  if (!balanceBeforeRes.ok || !balanceBeforeRes.json) {
    console.error(
      "GET /api/points/balance failed:",
      balanceBeforeRes.status,
      balanceBeforeRes.text,
    );
    process.exit(1);
  }
  const balanceBefore = balanceBeforeRes.json.balance;
  console.log(`Balance before: ${balanceBefore}`);

  const createRes = await fetchJson<{
    session: { id: string };
    chat: { id: string };
  }>(base, "/api/sessions", {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "E2E points AI chat" }),
  });
  if (!createRes.ok || !createRes.json?.session || !createRes.json?.chat) {
    console.error(
      "POST /api/sessions failed:",
      createRes.status,
      createRes.text,
    );
    process.exit(1);
  }
  const sessionId = createRes.json.session.id;
  const chatId = createRes.json.chat.id;
  console.log(`Session ${sessionId} chat ${chatId}`);

  const sandboxRes = await fetchJson<unknown>(base, "/api/sandbox", {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, sandboxType: "local-fs" }),
  });
  if (!sandboxRes.ok) {
    console.error(
      "POST /api/sandbox failed:",
      sandboxRes.status,
      sandboxRes.text,
    );
    process.exit(1);
  }

  const userMessageId = `e2e-user-${randomUUID()}`;
  const chatBody = {
    sessionId,
    chatId,
    messages: [
      {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
  };

  console.log("POST /api/chat (consuming full stream)…");
  const chatRes = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(chatBody),
  });
  if (!chatRes.ok) {
    const errText = await chatRes.text();
    console.error("POST /api/chat failed:", chatRes.status, errText);
    process.exit(1);
  }
  await readStreamToEnd(chatRes.body, streamTimeout);
  console.log("Chat stream finished.");

  const deadline = Date.now() + pollTimeout;
  let lastBalance = balanceBefore;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const b = await fetchJson<PointsBalanceJson>(base, "/api/points/balance", {
      headers: authHeader,
    });
    const t = await fetchJson<PointsTransactionsJson>(
      base,
      "/api/points/transactions",
      { headers: authHeader },
    );
    if (b.ok && b.json) lastBalance = b.json.balance;
    if (t.ok && t.json?.items) lastCount = t.json.items.length;

    const sessionRows =
      t.json?.items.filter((row) => row.sessionTitle.includes("E2E points")) ??
      [];
    if (lastBalance < balanceBefore && sessionRows.length > 0) {
      console.log(`Balance after: ${lastBalance} (was ${balanceBefore})`);
      console.log(
        `Ledger: ${sessionRows.length} consume row(s) for this session title.`,
      );
      console.log("E2E passed.");
      process.exit(0);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.error(
    `Timeout: balance ${lastBalance} (start ${balanceBefore}), ledger items ${lastCount}.`,
  );
  console.error(
    "If balance did not drop, check workflow logs and AI_GATEWAY_API_KEY.",
  );
  process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
