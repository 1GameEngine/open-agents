/**
 * Next.js instrumentation hook.
 *
 * This file runs once when the Next.js server starts (both in development and
 * production). It is used to start the Workflow world so that the
 * graphile-worker queue subscriber is active for the lifetime of the process.
 *
 * Self-hosted mode uses @workflow/world-postgres.
 * The world is configured via the WORKFLOW_TARGET_WORLD and
 * WORKFLOW_POSTGRES_URL environment variables (see .env).
 *
 * In development, you can use PGlite as a zero-dependency PostgreSQL substitute:
 *   WORKFLOW_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres
 * and start the PGlite socket server separately:
 *   npx pglite-server --db=memory:// --port=5432
 */
export async function register() {
  // Skip edge runtime — graphile-worker requires Node.js APIs
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  try {
    const { getWorld } = await import("workflow/runtime");
    const world = await getWorld();
    await world.start?.();
    console.log("[workflow] world started successfully");
  } catch (error) {
    // Log but do not crash the server — the app can still serve requests
    // without the workflow world, but scheduled/durable workflows will not run.
    console.error("[workflow] failed to start world:", error);
  }
}
