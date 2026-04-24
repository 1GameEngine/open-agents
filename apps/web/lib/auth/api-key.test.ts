import { beforeEach, describe, expect, mock, test } from "bun:test";

let headerValue = "";
let cookieValue: string | undefined;
let validateResult: { userId: string; username: string } | null = null;

mock.module("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "authorization" ? headerValue : null),
  }),
  cookies: async () => ({
    get: (name: string) =>
      name === "oha_self_hosted_api_key"
        ? cookieValue !== undefined
          ? { value: cookieValue }
          : undefined
        : undefined,
  }),
}));

mock.module("@/lib/db/api-keys", () => ({
  validateApiKey: async () => validateResult,
}));

const authModulePromise = import("./api-key");

describe("requireApiKey error messaging", () => {
  beforeEach(() => {
    headerValue = "";
    cookieValue = undefined;
    validateResult = null;
  });

  test("returns actionable hint when no Authorization and no API key cookie", async () => {
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("Missing API key");
    expect(body.error).toContain("SSO");
    expect(body.error).toContain("AI_GATEWAY_API_KEY is only used server-side");
  });

  test("accepts raw key from self-hosted API key cookie when Authorization is absent", async () => {
    cookieValue = "oha_from_cookie";
    validateResult = { userId: "u1", username: "alice" };
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.userId).toBe("u1");
    expect(result.username).toBe("alice");
  });

  test("uses Authorization header when Bearer token is non-empty", async () => {
    headerValue = "Bearer oha_header";
    cookieValue = "oha_cookie";
    validateResult = { userId: "u2", username: "bob" };
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.userId).toBe("u2");
  });

  test("returns actionable hint when Bearer token is empty and no cookie", async () => {
    headerValue = "Bearer   ";
    const { requireApiKey } = await authModulePromise;
    const result = await requireApiKey();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("Missing API key");
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
