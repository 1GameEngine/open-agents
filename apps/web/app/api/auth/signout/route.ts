/**
 * Sign-out endpoint.
 *
 * In self-hosted mode there is no session cookie — authentication is stateless
 * (API key per request). This endpoint is kept for API compatibility but is
 * effectively a no-op.
 */
export async function POST(): Promise<Response> {
  return Response.json({ ok: true });
}
