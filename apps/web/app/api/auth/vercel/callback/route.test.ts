/**
 * Tests for GET /api/auth/vercel/callback (self-hosted mode)
 * Vercel OAuth is disabled in self-hosted mode; the endpoint returns 410 Gone.
 */
import { describe, expect, test } from "bun:test";
import type { NextRequest } from "next/server";

const routeModulePromise = import("./route");

function createRequest(origin = "https://self-hosted.example"): NextRequest {
  const url = `${origin}/api/auth/vercel/callback?code=code-123&state=state-123`;
  return { nextUrl: new URL(url), url } as NextRequest;
}

describe("GET /api/auth/vercel/callback", () => {
  test("returns 410 Gone — Vercel OAuth is disabled in self-hosted mode", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body).toMatchObject({ error: expect.stringContaining("API key") });
  });
});
