/**
 * Tests for GET /api/auth/vercel/callback (self-hosted mode)
 * Vercel OAuth is disabled in self-hosted mode; the endpoint returns 410 Gone.
 */
import { describe, expect, test } from "bun:test";

const routeModulePromise = import("./route");

describe("GET /api/auth/vercel/callback", () => {
  test("returns 410 Gone — Vercel OAuth is disabled in self-hosted mode", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.stringContaining("API key") });
  });
});
