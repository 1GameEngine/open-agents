/**
 * Vercel OAuth callback — removed in self-hosted mode.
 * Authentication is handled via API keys (/api/auth/api-keys).
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { error: "Vercel OAuth is not available in self-hosted mode. Use API key authentication." },
    { status: 410 },
  );
}
