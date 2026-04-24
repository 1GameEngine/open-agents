import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type SelectRow = {
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

let selectRows: SelectRow[] = [];

const fakeDb = {
  select: (_columns: unknown) => ({
    from: (_pt: unknown) => ({
      innerJoin: (_sessions: unknown, _on: unknown) => ({
        where: (_condition: unknown) => ({
          orderBy: (_order: unknown) => ({
            limit: (_n: number) => ({
              offset: (_o: number) => Promise.resolve(selectRows),
            }),
          }),
        }),
      }),
    }),
  }),
};

mock.module("./client", () => ({
  db: fakeDb,
}));

const pointTransactionsModulePromise = import("./point-transactions");

beforeEach(() => {
  selectRows = [];
});

describe("getPointTransactionsPage", () => {
  test("returns joined session title for consume rows", async () => {
    const { getPointTransactionsPage } = await pointTransactionsModulePromise;

    const createdAt = new Date("2026-04-24T12:00:00.000Z");
    selectRows = [
      {
        id: "tx-1",
        sessionId: "sess-1",
        chatId: "chat-1",
        type: "consume",
        amount: -5,
        modelId: "moonshotai/kimi-k2.5",
        usdCost: 0.005,
        createdAt,
        sessionTitle: "My session",
      },
    ];

    const rows = await getPointTransactionsPage({
      userId: "user-1",
      limit: 20,
      offset: 0,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionTitle).toBe("My session");
    expect(rows[0]?.amount).toBe(-5);
    expect(rows[0]?.type).toBe("consume");
  });
});
