import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

interface MockGatewayModel extends Record<string, unknown> {
  id: string;
  name?: string;
  description?: string | null;
  modelType: string;
  context_window?: number;
}

const gatewayModels: MockGatewayModel[] = [];
const requestedUrls: string[] = [];

let gatewayError: unknown = null;
let modelsDevApiData: unknown = {};
let currentSession: {
  authProvider?: "vercel" | "github";
  user: { id: string; email?: string; username?: string; avatar?: string };
} | null = null;

const originalFetch = globalThis.fetch;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

mock.module("ai", () => ({
  gateway: {
    getAvailableModels: async () => {
      if (gatewayError) {
        throw gatewayError;
      }

      return { models: gatewayModels };
    },
  },
}));

mock.module("server-only", () => ({}));

mock.module("@/lib/auth/api-key", () => ({
  requireApiKey: async () => {
    const _s = currentSession;
    if (!_s)
      return {
        ok: false as const,
        response: Response.json(
          { error: "Not authenticated" },
          { status: 401 },
        ),
      };
    return {
      ok: true as const,
      userId: _s.user.id,
      username: _s.user.id,
      authProvider: "api-key" as const,
    };
  },
}));

const routeModulePromise = import("./route");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("/api/models context window enrichment", () => {
  beforeEach(() => {
    gatewayModels.length = 0;
    requestedUrls.length = 0;
    gatewayError = null;
    modelsDevApiData = {};
    currentSession = { user: { id: "user-1", username: "test-user" } };

    globalThis.fetch = mock((input: RequestInfo | URL, _init?: RequestInit) => {
      requestedUrls.push(getRequestUrl(input));
      return Promise.resolve(
        new Response(JSON.stringify(modelsDevApiData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;
  });

  test("overrides gateway context windows from models.dev", async () => {
    gatewayModels.push(
      {
        id: "openai/gpt-5.3-codex",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "moonshotai/kimi-k2.6",
        modelType: "language",
        context_window: 128_000,
      },
      {
        id: "anthropic/claude-opus-4.6",
        modelType: "language",
        context_window: 200_000,
      },
      {
        id: "openai/gpt-4o-mini",
        modelType: "language",
        context_window: 128_000,
      },
      {
        id: "openai/image-gen",
        modelType: "image",
        context_window: 200_000,
      },
    );

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
      moonshotai: {
        models: {
          "kimi-k2.6": {
            limit: { context: 256_000 },
          },
        },
      },
      anthropic: {
        models: {
          "claude-opus-4.6": {
            limit: { context: 1_000_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };
    const contextById = new Map(
      body.models.map((model) => [model.id, model.context_window]),
    );

    expect(body.models.map((m) => m.id)).toEqual([
      "moonshotai/kimi-k2.6",
      "openai/gpt-5.3-codex",
    ]);
    expect(contextById.get("openai/gpt-5.3-codex")).toBe(400_000);
    expect(contextById.get("moonshotai/kimi-k2.6")).toBe(256_000);
    expect(contextById.has("anthropic/claude-opus-4.6")).toBe(false);
    expect(contextById.has("openai/gpt-4o-mini")).toBe(false);
    expect(contextById.has("openai/image-gen")).toBe(false);
    expect(requestedUrls).toContain("https://models.dev/api.json");
  });

  test("self-hosted mode returns only allowlisted models (trial opus filter does not expand the list)", async () => {
    gatewayModels.push(
      {
        id: "anthropic/claude-opus-4.6",
        modelType: "language",
      },
      {
        id: "anthropic/claude-haiku-4.5",
        modelType: "language",
      },
      {
        id: "deepseek/deepseek-v4-flash",
        modelType: "language",
      },
    );
    // self-hosted: no authProvider restriction
    currentSession = { user: { id: "user-1", username: "test-user" } };

    const { GET } = await routeModulePromise;
    const response = await GET(
      new Request("https://self-hosted.example/api/models"),
    );
    const body = (await response.json()) as {
      models: Array<{ id: string }>;
    };

    // Curated allowlist applies; Claude models are not hidden by trial logic but are not in the shortlist
    expect(body.models.map((model) => model.id)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });

  test("keeps gateway context window when models.dev only has related ids", async () => {
    gatewayModels.push({
      id: "openai/gpt-5.4-mini",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      openai: {
        models: {
          "gpt-5": {
            limit: { context: 272_000 },
          },
          "gpt-5.3-codex": {
            limit: { context: 400_000 },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{ id: string; context_window?: number }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]?.id).toBe("openai/gpt-5.4-mini");
    expect(body.models[0]?.context_window).toBe(200_000);
  });

  test("keeps valid models.dev metadata when sibling fields are invalid", async () => {
    gatewayModels.push({
      id: "openai/gpt-5.3-codex",
      modelType: "language",
      context_window: 200_000,
    });

    modelsDevApiData = {
      invalidProvider: "bad",
      openai: {
        models: {
          "gpt-5.3-codex": {
            limit: { context: "400_000" },
            cost: {
              input: 1.25,
              output: 10,
              context_over_200k: {
                input: 2.5,
              },
            },
          },
          broken: {
            limit: { context: "not-a-number" },
            cost: { input: "expensive" },
          },
        },
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        context_window?: number;
        cost?: {
          input?: number;
          output?: number;
          context_over_200k?: {
            input?: number;
          };
        };
      }>;
    };

    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      id: "openai/gpt-5.3-codex",
      context_window: 200_000,
      cost: {
        input: 1.25,
        output: 10,
        context_over_200k: {
          input: 2.5,
        },
      },
    });
  });

  test("recovers from gateway validation errors when response still includes models", async () => {
    gatewayError = {
      response: {
        models: [
          {
            id: "moonshotai/kimi-k2.6",
            name: "Kimi K2.6",
            description: "Curated model",
            modelType: "language",
          },
          {
            id: "openai/gpt-5.4-broken",
            modelType: "language",
          },
          {
            id: "cohere/rerank-v3.5",
            name: "Cohere Rerank 3.5",
            description: "Reranking model",
            modelType: "reranking",
          },
        ],
      },
    };

    const { GET } = await routeModulePromise;
    const response = await GET(new Request("http://localhost/api/models"));

    expect(response.ok).toBe(true);

    const body = (await response.json()) as {
      models: Array<{
        id: string;
        name: string;
        description?: string | null;
        modelType?: string;
      }>;
    };

    expect(body.models).toEqual([
      {
        id: "moonshotai/kimi-k2.6",
        name: "Kimi K2.6",
        description: "Curated model",
        modelType: "language",
      },
    ]);
  });
});
