/**
 * API Key management endpoints (self-hosted mode).
 *
 * GET  /api/auth/api-keys        — list all keys for the authenticated user
 * POST /api/auth/api-keys        — create a new key (returns raw key once)
 * DELETE /api/auth/api-keys/:id  — delete a key
 */
import { requireApiKey } from "@/lib/auth/api-key";
import { createApiKey, listApiKeys } from "@/lib/db/api-keys";
import { z } from "zod";

export async function GET() {
  const auth = await requireApiKey();
  if (!auth.ok) return auth.response;

  const keys = await listApiKeys(auth.userId);
  return Response.json({ keys });
}

const createSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApiKey();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, expiresAt } = parsed.data;
  const { rawKey, keyId } = await createApiKey(
    auth.userId,
    name ?? "default",
    expiresAt ? new Date(expiresAt) : undefined,
  );

  return Response.json(
    {
      id: keyId,
      key: rawKey,
      name: name ?? "default",
      message: "Store this key securely — it will not be shown again.",
    },
    { status: 201 },
  );
}
