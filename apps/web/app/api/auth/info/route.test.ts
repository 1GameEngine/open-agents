/**
 * Tests for GET /api/auth/info (self-hosted, API-key auth)
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { NextRequest } from "next/server";

// ── Mutable state ──────────────────────────────────────────────────
type ApiKeyResult =
  | { ok: true; userId: string; username: string; authProvider: "api-key" }
  | { ok: false; response: Response };

let apiKeyResult: ApiKeyResult = {
  ok: true,
  userId: "user-1",
  username: "self-hosted-user",
  authProvider: "api-key",
};
let exists = true;
let githubAccount: { id: string } | null = null;
let installations: Array<{ installationId: number }> = [];

// ── Module mocks ───────────────────────────────────────────────────
mock.module("@/lib/auth/api-key", () => ({
  requireApiKey: async () => apiKeyResult,
}));
mock.module("@/lib/db/users", () => ({
  userExists: async () => exists,
}));
mock.module("@/lib/db/accounts", () => ({
  getGitHubAccount: async () => githubAccount,
}));
mock.module("@/lib/db/installations", () => ({
  getInstallationsByUserId: async () => installations,
}));

const routeModulePromise = import("./route");

function createRequest(): NextRequest {
  return {
    nextUrl: new URL("http://localhost/api/auth/info"),
    url: "http://localhost/api/auth/info",
    headers: new Headers({ authorization: "Bearer test-key" }),
  } as unknown as NextRequest;
}

describe("GET /api/auth/info", () => {
  beforeEach(() => {
    apiKeyResult = {
      ok: true,
      userId: "user-1",
      username: "self-hosted-user",
      authProvider: "api-key",
    };
    exists = true;
    githubAccount = null;
    installations = [];
  });

  test("returns 401 when API key is missing or invalid", async () => {
    apiKeyResult = {
      ok: false,
      response: Response.json({ error: "Invalid API key" }, { status: 401 }),
    };
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  test("returns 401 when the user record no longer exists", async () => {
    exists = false;
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  test("returns user info with no GitHub when no account linked", async () => {
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      user: { id: "user-1", username: "self-hosted-user" },
      authProvider: "github",
      hasGitHub: false,
      hasGitHubAccount: false,
      hasGitHubInstallations: false,
      vercelReconnectRequired: false,
    });
  });

  test("returns hasGitHub=true when GitHub account is linked", async () => {
    githubAccount = { id: "gh-123" };
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      hasGitHub: true,
      hasGitHubAccount: true,
      hasGitHubInstallations: false,
    });
  });

  test("returns hasGitHubInstallations=true when installations exist", async () => {
    installations = [{ installationId: 42 }];
    const { GET } = await routeModulePromise;
    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      hasGitHub: true,
      hasGitHubAccount: false,
      hasGitHubInstallations: true,
    });
  });
});
