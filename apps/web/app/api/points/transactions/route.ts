import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPointTransactionsPage } from "@/lib/db/point-transactions";
import { getSessionFromReq } from "@/lib/session/server";

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PointTransactionApiRow = {
  id: string;
  sessionId: string;
  chatId: string;
  type: "consume" | "daily_reset";
  amount: number;
  modelId: string | null;
  usdCost: number | null;
  createdAt: string;
  sessionTitle: string;
};

export interface PointsTransactionsResponse {
  items: PointTransactionApiRow[];
  nextOffset: number | null;
}

/**
 * GET /api/points/transactions?offset=&limit=
 *
 * Paginated points ledger for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { offset, limit } = parsed.data;
  const pageSize = limit;

  try {
    const rows = await getPointTransactionsPage({
      userId: session.user.id,
      limit: pageSize + 1,
      offset,
    });

    const hasMore = rows.length > pageSize;
    const slice = hasMore ? rows.slice(0, pageSize) : rows;
    const nextOffset = hasMore ? offset + pageSize : null;

    const items: PointTransactionApiRow[] = slice.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      chatId: row.chatId,
      type: row.type,
      amount: row.amount,
      modelId: row.modelId,
      usdCost: row.usdCost,
      createdAt: row.createdAt.toISOString(),
      sessionTitle: row.sessionTitle,
    }));

    return Response.json({
      items,
      nextOffset,
    } satisfies PointsTransactionsResponse);
  } catch (error) {
    console.error("[points/transactions] Failed to list transactions:", error);
    return Response.json(
      { error: "Failed to load points transactions" },
      { status: 500 },
    );
  }
}
