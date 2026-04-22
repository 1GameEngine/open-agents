import { beforeEach, describe, expect, mock, test } from "bun:test";

let headerValue = "";
let validateResult: { userId: string; username: string } | null = null;

mock.module("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "authorization" ? headerValue : null),
  }),
}));

mock.module("@/lib/db/api-keys", () => ({
  validateApiKey: async () => validateResult,
}));

const authModulePromise = import("./api-key");

describe("requireApiKey error messaging", () => {
  beforeEach(() => {
    headerValue = "";
    validateResult = null;
  });

  test("returns actionable hint when Authorization header is missing", async () => {
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("/api/models requires a self-hosted API key");
    expect(body.error).toContain("AI_GATEWAY_API_KEY is only used server-side");
  });

  test("returns actionable hint when Bearer token is empty", async () => {
    headerValue = "Bearer   ";
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("Authorization: Bearer oha_...");
  });

  test("returns actionable hint when API key is invalid", async () => {
    headerValue = "Bearer oha_invalid";
    validateResult = null;
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("Invalid or expired self-hosted API key");
    expect(body.error).toContain("bootstrap/api-keys");
  });
});
