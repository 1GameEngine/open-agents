import { describe, expect, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import type { ModelVariant } from "@/lib/model-variants";
import {
  buildModelOptions,
  getDefaultModelOptionId,
  groupByProvider,
  withMissingModelOption,
} from "./model-options";
import type { AvailableModel } from "./models";

function createModel(input: {
  id: string;
  name?: string;
  description?: string | null;
  contextWindow?: number;
}): AvailableModel {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    context_window: input.contextWindow,
    modelType: "language",
  } as unknown as AvailableModel;
}

describe("model options", () => {
  test("buildModelOptions includes base models and variants for allowlisted bases", () => {
    const models: AvailableModel[] = [
      createModel({
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 mini",
        description: "Base model",
        contextWindow: 400_000,
      }),
    ];

    const variants: ModelVariant[] = [
      {
        id: "variant:gpt-5.4-mini-medium",
        name: "GPT-5.4 mini (medium reasoning)",
        baseModelId: "openai/gpt-5.4-mini",
        providerOptions: { reasoningEffort: "medium" },
      },
    ];

    const options = buildModelOptions(models, variants);

    expect(options).toEqual([
      {
        id: "openai/gpt-5.4-mini",
        label: "GPT-5.4 mini",
        shortLabel: "GPT-5.4 mini",
        description: "Base model",
        isVariant: false,
        contextWindow: 400_000,
        provider: "openai",
      },
      {
        id: "variant:gpt-5.4-mini-medium",
        label: "GPT-5.4 mini (medium reasoning)",
        shortLabel: "GPT-5.4 mini (medium reasoning)",
        description: "Variant of GPT-5.4 mini",
        isVariant: true,
        contextWindow: 400_000,
        provider: "openai",
      },
    ]);
  });

  test("buildModelOptions omits variants when base model is not in the allowlist", () => {
    const models: AvailableModel[] = [
      createModel({
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 mini",
        contextWindow: 128_000,
      }),
    ];

    const variants: ModelVariant[] = [
      {
        id: "variant:off-list",
        name: "Custom",
        baseModelId: "openai/gpt-5",
        providerOptions: {},
      },
    ];

    const options = buildModelOptions(models, variants);

    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe("openai/gpt-5.4-mini");
  });

  test("buildModelOptions strips provider prefix for shortLabel", () => {
    const models: AvailableModel[] = [
      createModel({
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
      }),
    ];

    const options = buildModelOptions(models, []);

    expect(options[0].shortLabel).toBe("Opus 4.6");
    expect(options[0].label).toBe("Claude Opus 4.6");
  });

  test("groupByProvider puts priority providers first, preserves insertion order", () => {
    const options = [
      {
        id: "deepseek/deepseek-v4-flash",
        label: "DeepSeek V4 Flash",
        shortLabel: "V4 Flash",
        isVariant: false,
        provider: "deepseek",
      },
      {
        id: "google/gemini-2.5",
        label: "Gemini 2.5",
        shortLabel: "2.5",
        isVariant: false,
        provider: "google",
      },
      {
        id: "openai/gpt-5",
        label: "GPT-5",
        shortLabel: "GPT-5",
        isVariant: false,
        provider: "openai",
      },
      {
        id: "moonshotai/kimi-k2.6",
        label: "Kimi K2.6",
        shortLabel: "Kimi K2.6",
        isVariant: false,
        provider: "moonshotai",
      },
      {
        id: "variant:opus-custom",
        label: "Opus Custom",
        shortLabel: "Opus Custom",
        isVariant: true,
        provider: "anthropic",
      },
      {
        id: "anthropic/claude-opus-4.6",
        label: "Claude Opus 4.6",
        shortLabel: "Opus 4.6",
        isVariant: false,
        provider: "anthropic",
      },
    ];

    const groups = groupByProvider(options);

    expect(groups.map((g) => g.provider)).toEqual([
      "deepseek",
      "moonshotai",
      "openai",
      "google",
      "anthropic",
    ]);
    // Within anthropic: preserves original order (variant first, base second)
    expect(groups[4].options[0].id).toBe("variant:opus-custom");
    expect(groups[4].options[1].id).toBe("anthropic/claude-opus-4.6");
  });

  test("withMissingModelOption appends missing variant option", () => {
    const result = withMissingModelOption([], "variant:removed");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "variant:removed",
      label: "removed (missing)",
      shortLabel: "removed (missing)",
      description: "Variant no longer exists",
      isVariant: true,
      contextWindow: undefined,
      provider: "unknown",
    });
  });

  test("withMissingModelOption appends legacy placeholder for unknown base model ids", () => {
    const original = [
      {
        id: "openai/gpt-5",
        label: "GPT-5",
        shortLabel: "GPT-5",
        isVariant: false,
        provider: "openai",
      },
    ];

    const result = withMissingModelOption(original, "openai/unknown-model");

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "openai/unknown-model",
      label: "openai/unknown-model (legacy)",
      isVariant: false,
      provider: "openai",
    });
  });

  test("withMissingModelOption returns original list when id already exists", () => {
    const original = [
      {
        id: "variant:existing",
        label: "Existing Variant",
        shortLabel: "Existing Variant",
        isVariant: true,
        provider: "openai",
      },
    ];

    expect(withMissingModelOption(original, "variant:existing")).toBe(original);
  });

  test("getDefaultModelOptionId prefers repository default model when present", () => {
    const options = [
      {
        id: APP_DEFAULT_MODEL_ID,
        label: "DeepSeek V4 Flash",
        shortLabel: "V4 Flash",
        isVariant: false,
        provider: "deepseek",
      },
      {
        id: "openai/gpt-5",
        label: "GPT-5",
        shortLabel: "GPT-5",
        isVariant: false,
        provider: "openai",
      },
    ];

    expect(getDefaultModelOptionId(options)).toBe(APP_DEFAULT_MODEL_ID);
  });

  test("getDefaultModelOptionId falls back to first option when default is missing", () => {
    const options = [
      {
        id: "openai/gpt-5",
        label: "GPT-5",
        shortLabel: "GPT-5",
        isVariant: false,
        provider: "openai",
      },
    ];

    expect(getDefaultModelOptionId(options)).toBe("openai/gpt-5");
  });
});
