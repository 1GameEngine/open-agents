import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";
import type { PointConsumeLedgerRow } from "@/lib/points/transaction-history";

let sessionUserId: string | null = "user-ledger-1";
const listRows: PointConsumeLedgerRow[] = [];

mock.module("@/lib/session/server", () => ({
  getSessionFromReq: async () =>
    sessionUserId
      ? {
          user: { id: sessionUserId, username: "t", name: "T" },
        }
      : undefined,
}));

mock.module("@/lib/points/transaction-history", () => ({
  listTodayConsumePointTransactions: async (userId: string) =>
    userId === sessionUserId ? [...listRows] : [],
}));

const routeModulePromise = import("./route");

function createRequest(): NextRequest {
  return {
    nextUrl: new URL("http://localhost/api/points/transactions"),
    url: "http://localhost/api/points/transactions",
    headers: new Headers(),
  } as unknown as NextRequest;
}

describe("GET /api/points/transactions", () => {
  beforeEach(() => {
    sessionUserId = "user-ledger-1";
    listRows.length = 0;
  });

  test("returns 401 when not authenticated", async () => {
    sessionUserId = null;
    const { GET } = await routeModulePromise;
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  test("returns items with href for consume rows", async () => {
    const createdAt = new Date("2026-04-24T12:00:00.000Z");
    listRows.push({
      id: "tx-1",
      amount: -5,
      modelId: "moonshotai/kimi-k2.5",
      usdCost: 0.005,
      createdAt,
      sessionId: "sess-1",
      chatId: "chat-1",
      sessionTitle: "My session",
      chatTitle: "Tab one",
    });
    const { GET } = await routeModulePromise;
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ points: number; href: string; sessionTitle: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.points).toBe(5);
    expect(body.items[0]?.href).toBe("/sessions/sess-1/chats/chat-1");
    expect(body.items[0]?.sessionTitle).toBe("My session");
  });
});
