import { beforeEach, describe, expect, mock, test } from "bun:test";

// Must appear before any import that transitively pulls in server-only
mock.module("server-only", () => ({}));

// ── Mutable DB state ──────────────────────────────────────────────
interface FakeUserPointsRow {
  userId: string;
  lastResetDate: string;
  dailyPoints: number;
}

let userPointsStore = new Map<string, FakeUserPointsRow>();
const insertedTransactions: unknown[] = [];

/**
 * Resolve a Drizzle `sql` template expression for GREATEST(col - cost, 0).
 * The queryChunks layout is: ["GREATEST(", colRef, " - ", costPoints, ", 0)"]
 * so the cost is at index 3.
 */
function resolveSqlExpr(expr: unknown, currentValue: number): number {
  if (typeof expr === "number") return expr;
  const chunks = (expr as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return currentValue;
  // chunk[3] is the costPoints number
  const cost = typeof chunks[3] === "number" ? chunks[3] : 0;
  return Math.max(currentValue - cost, 0);
}

// ── DB mock ───────────────────────────────────────────────────────
mock.module("@/lib/db/client", () => {
  const db = {
    insert: (_table: unknown) => ({
      values: (row: unknown) => {
        const r = row as Record<string, unknown>;
        // point_transactions rows include `type`; user_points rows do not
        if (typeof r.type === "string") {
          insertedTransactions.push(row);
          return Promise.resolve(undefined);
        }
        return {
          // Used by userPoints UPSERT
          onConflictDoNothing: async () => {
            const up = row as FakeUserPointsRow;
            if (!userPointsStore.has(up.userId)) {
              userPointsStore.set(up.userId, { ...up });
            }
          },
        };
      },
    }),

    update: (_table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (_condition: unknown) => {
          for (const [uid, row] of userPointsStore.entries()) {
            const updates: Partial<FakeUserPointsRow> = {};

            if (typeof patch.dailyPoints === "number") {
              updates.dailyPoints = patch.dailyPoints;
            } else if (patch.dailyPoints !== undefined) {
              // sql template expression — resolve GREATEST(current - cost, 0)
              updates.dailyPoints = resolveSqlExpr(
                patch.dailyPoints,
                row.dailyPoints,
              );
            }

            if (typeof patch.lastResetDate === "string") {
              updates.lastResetDate = patch.lastResetDate;
            }

            userPointsStore.set(uid, { ...row, ...updates });
          }
        },
      }),
    }),

    query: {
      userPoints: {
        findFirst: async (_opts?: unknown) => {
          const rows = [...userPointsStore.values()];
          return rows[0] ?? null;
        },
      },
    },
  };
  return { db };
});

mock.module("nanoid", () => ({ nanoid: () => "test-nanoid-id" }));

// ── Import module under test (after all mocks) ────────────────────
const { usdToPoints, checkAndResetDailyPoints, deductPoints } =
  await import("./service-impl");

// ── Helpers ───────────────────────────────────────────────────────
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function seedUser(
  userId: string,
  opts: { dailyPoints?: number; lastResetDate?: string } = {},
) {
  userPointsStore.set(userId, {
    userId,
    dailyPoints: opts.dailyPoints ?? 10_000,
    lastResetDate: opts.lastResetDate ?? todayUtc(),
  });
}

// ─────────────────────────────────────────────────────────────────
// usdToPoints — pure function, no DB interaction
// ─────────────────────────────────────────────────────────────────
describe("usdToPoints", () => {
  test("returns 0 for zero cost", () => {
    expect(usdToPoints(0)).toBe(0);
  });

  test("returns 0 for negative cost", () => {
    expect(usdToPoints(-1)).toBe(0);
  });

  test("returns at least 1 for any positive cost (minimum floor)", () => {
    expect(usdToPoints(0.000001)).toBe(1);
  });

  test("converts $0.001 exactly to 1 point", () => {
    expect(usdToPoints(0.001)).toBe(1);
  });

  test("rounds up fractional points (ceil): $0.0001 → 1 pt", () => {
    expect(usdToPoints(0.0001)).toBe(1);
  });

  test("rounds up fractional points (ceil): $0.0015 → 2 pts", () => {
    expect(usdToPoints(0.0015)).toBe(2);
  });

  test("rounds up fractional points (ceil): $0.0034 → 4 pts", () => {
    expect(usdToPoints(0.0034)).toBe(4);
  });

  test("converts $1.00 to 1000 points", () => {
    expect(usdToPoints(1)).toBe(1000);
  });

  test("converts $10.00 to 10000 points", () => {
    expect(usdToPoints(10)).toBe(10_000);
  });

  test("converts $0.1234 to 124 points (ceil of 123.4)", () => {
    expect(usdToPoints(0.1234)).toBe(124);
  });

  test("handles large cost: $5.678 → 5678 pts", () => {
    expect(usdToPoints(5.678)).toBe(5678);
  });
});

// ─────────────────────────────────────────────────────────────────
// checkAndResetDailyPoints
// ─────────────────────────────────────────────────────────────────
describe("checkAndResetDailyPoints", () => {
  beforeEach(() => {
    userPointsStore = new Map();
    insertedTransactions.length = 0;
  });

  test("creates a new row for a brand-new user and returns 10000", async () => {
    const result = await checkAndResetDailyPoints("new-user");
    expect(result).toBe(10_000);
    expect(userPointsStore.has("new-user")).toBe(true);
  });

  test("returns current balance when the stored date is today", async () => {
    seedUser("user-1", { dailyPoints: 7_500 });
    const result = await checkAndResetDailyPoints("user-1");
    expect(result).toBe(7_500);
  });

  test("resets balance to 10000 when stored date is yesterday", async () => {
    seedUser("user-1", { dailyPoints: 0, lastResetDate: yesterdayUtc() });
    const result = await checkAndResetDailyPoints("user-1");
    expect(result).toBe(10_000);
  });

  test("updates lastResetDate to today after a reset", async () => {
    seedUser("user-1", { dailyPoints: 0, lastResetDate: yesterdayUtc() });
    await checkAndResetDailyPoints("user-1");
    expect(userPointsStore.get("user-1")?.lastResetDate).toBe(todayUtc());
  });

  test("does not reset balance when stored date is already today", async () => {
    seedUser("user-1", { dailyPoints: 3_000 });
    await checkAndResetDailyPoints("user-1");
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(3_000);
  });

  test("returns 0 when balance is exhausted and date is today", async () => {
    seedUser("user-1", { dailyPoints: 0 });
    const result = await checkAndResetDailyPoints("user-1");
    expect(result).toBe(0);
  });

  test("returns 10000 after reset even when previous balance was 0", async () => {
    seedUser("user-1", { dailyPoints: 0, lastResetDate: yesterdayUtc() });
    const result = await checkAndResetDailyPoints("user-1");
    expect(result).toBe(10_000);
  });

  test("new user row has today's date as lastResetDate", async () => {
    await checkAndResetDailyPoints("brand-new");
    expect(userPointsStore.get("brand-new")?.lastResetDate).toBe(todayUtc());
  });

  test("idempotent: calling twice on same user with today's date returns same balance", async () => {
    seedUser("user-1", { dailyPoints: 4_200 });
    const first = await checkAndResetDailyPoints("user-1");
    const second = await checkAndResetDailyPoints("user-1");
    expect(first).toBe(4_200);
    expect(second).toBe(4_200);
  });
});

// ─────────────────────────────────────────────────────────────────
// deductPoints
// ─────────────────────────────────────────────────────────────────
describe("deductPoints", () => {
  beforeEach(() => {
    userPointsStore = new Map();
    insertedTransactions.length = 0;
  });

  const baseParams = {
    userId: "user-1",
    sessionId: "session-1",
    chatId: "chat-1",
    modelId: "openai/gpt-4o",
  };

  test("deducts the correct number of points for a known USD cost ($0.005 → 5 pts)", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.005 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_995);
  });

  test("deducts 1 point when usdCost is undefined (fallback minimum)", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: undefined });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_999);
  });

  test("does nothing when usdCost is exactly 0", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(10_000);
  });

  test("does nothing when usdCost is negative", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: -1 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(10_000);
  });

  test("deducts ceil(usdCost * 1000) for fractional costs ($0.0034 → 4 pts)", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.0034 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_996);
  });

  test("deducts 1 point minimum for tiny positive costs ($0.0000001 → 1 pt)", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.0000001 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_999);
  });

  test("clamps balance to 0 when cost exceeds remaining points", async () => {
    seedUser("user-1", { dailyPoints: 2 });
    // $1.00 → 1000 pts, balance only 2
    await deductPoints({ ...baseParams, usdCost: 1 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(0);
  });

  test("balance never goes negative", async () => {
    seedUser("user-1", { dailyPoints: 1 });
    await deductPoints({ ...baseParams, usdCost: 5 }); // 5000 pts
    expect(userPointsStore.get("user-1")?.dailyPoints).toBeGreaterThanOrEqual(
      0,
    );
  });

  test("deducts $1.00 (1000 pts) from a full 10000-point balance correctly", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 1 });
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_000);
  });

  test("multiple sequential deductions accumulate correctly", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.001 }); // 1 pt
    await deductPoints({ ...baseParams, usdCost: 0.002 }); // 2 pts
    await deductPoints({ ...baseParams, usdCost: 0.003 }); // 3 pts
    expect(userPointsStore.get("user-1")?.dailyPoints).toBe(9_994);
  });

  test("inserts a transaction record for each deduction", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.005 });
    expect(insertedTransactions).toHaveLength(1);
  });

  test("does not insert a transaction record when cost is 0", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0 });
    expect(insertedTransactions).toHaveLength(0);
  });

  test("transaction record contains correct userId, sessionId, chatId", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({
      userId: "user-42",
      sessionId: "session-99",
      chatId: "chat-77",
      modelId: "anthropic/claude-3",
      usdCost: 0.01,
    });
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(tx.userId).toBe("user-42");
    expect(tx.sessionId).toBe("session-99");
    expect(tx.chatId).toBe("chat-77");
  });

  test("transaction record type is 'consume'", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.005 });
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(tx.type).toBe("consume");
  });

  test("transaction record amount is negative", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.005 });
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(typeof tx.amount).toBe("number");
    expect(tx.amount as number).toBeLessThan(0);
  });

  test("transaction record stores usdCost when provided", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams, usdCost: 0.005 });
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(tx.usdCost).toBe(0.005);
  });

  test("transaction record stores null usdCost when not provided", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({ ...baseParams }); // no usdCost
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(tx.usdCost).toBeNull();
  });

  test("transaction record stores the modelId", async () => {
    seedUser("user-1", { dailyPoints: 10_000 });
    await deductPoints({
      ...baseParams,
      modelId: "anthropic/claude-3",
      usdCost: 0.002,
    });
    const tx = insertedTransactions[0] as Record<string, unknown>;
    expect(tx.modelId).toBe("anthropic/claude-3");
  });
});
