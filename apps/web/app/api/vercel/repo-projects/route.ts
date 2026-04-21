/**
 * Vercel project listing — removed in self-hosted mode.
 * Vercel project integration is not available in self-hosted deployments.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      error: "Vercel project integration is not available in self-hosted mode.",
    },
    { status: 410 },
  );
}
