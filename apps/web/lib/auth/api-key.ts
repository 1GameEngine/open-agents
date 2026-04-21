import { headers } from "next/headers";
import { validateApiKey } from "@/lib/db/api-keys";

export interface ApiKeyAuthResult {
  ok: true;
  userId: string;
  username: string;
  /** Always 'api-key' in self-hosted mode. */
  authProvider: "api-key";
}

export interface ApiKeyAuthFailure {
  ok: false;
  response: Response;
}

export type ApiKeyAuthOutcome = ApiKeyAuthResult | ApiKeyAuthFailure;

/**
 * Extract the Bearer token from the Authorization header of the current
 * Next.js request and validate it against the api_keys table.
 *
 * Usage in a Route Handler:
 *   const auth = await requireApiKey();
 *   if (!auth.ok) return auth.response;
 *   const { userId } = auth;
 */
export async function requireApiKey(): Promise<ApiKeyAuthOutcome> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return {
      ok: false,
      response: Response.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      ),
    };
  }

  const rawKey = authorization.slice("Bearer ".length).trim();
  if (!rawKey) {
    return {
      ok: false,
      response: Response.json({ error: "Empty API key" }, { status: 401 }),
    };
  }

  const result = await validateApiKey(rawKey);
  if (!result) {
    return {
      ok: false,
      response: Response.json(
        { error: "Invalid or expired API key" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, userId: result.userId, username: result.username, authProvider: "api-key" as const };
}
