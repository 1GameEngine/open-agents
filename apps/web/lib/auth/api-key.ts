import { cookies, headers } from "next/headers";
import { validateApiKey } from "@/lib/db/api-keys";
import { SELF_HOSTED_API_KEY_COOKIE_NAME } from "@/lib/session/constants";

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
function unauthorizedResponse(message: string): ApiKeyAuthFailure {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 401 }),
  };
}

export async function requireApiKey(): Promise<ApiKeyAuthOutcome> {
  const cookieStore = await cookies();
  const cookieApiKey = cookieStore.get(SELF_HOSTED_API_KEY_COOKIE_NAME)?.value;
  if (cookieApiKey) {
    const result = await validateApiKey(cookieApiKey);
    if (result) {
      return {
        ok: true,
        userId: result.userId,
        username: result.username,
        authProvider: "api-key" as const,
      };
    }
  }

  const headerStore = await headers();
  const authorization = headerStore.get("authorization") ?? "";

  let rawKey: string | undefined;
  if (authorization.startsWith("Bearer ")) {
    rawKey = authorization.slice("Bearer ".length).trim();
  }

  if (!rawKey) {
    const cookieStore = await cookies();
    rawKey = cookieStore.get(SELF_HOSTED_API_KEY_COOKIE_NAME)?.value?.trim();
  }

  if (!rawKey) {
    return unauthorizedResponse(
      "Missing API key. Sign in via SSO, set Authorization: Bearer oha_... on API requests, or use local dev NEXT_PUBLIC_SELF_HOSTED_API_KEY (see README). AI_GATEWAY_API_KEY is only used server-side.",
    );
  }

  const result = await validateApiKey(rawKey);

  if (!result) {
    return unauthorizedResponse(
      "Invalid or expired self-hosted API key. Ensure your oha_ key exists in DB (bootstrap/api-keys), matches your session cookie, or use Authorization: Bearer oha_....",
    );
  }

  return {
    ok: true,
    userId: result.userId,
    username: result.username,
    authProvider: "api-key" as const,
  };
}
