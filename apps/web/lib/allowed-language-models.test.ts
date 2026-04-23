import { describe, expect, test } from "bun:test";
import {
  ALLOWED_LANGUAGE_MODEL_IDS,
  filterAndOrderAvailableLanguageModels,
} from "./allowed-language-models";
import type { AvailableModel } from "./models";

function model(id: string): AvailableModel {
  return {
    id,
    name: id,
    modelType: "language",
  } as AvailableModel;
}

describe("allowed-language-models", () => {
  test("filterAndOrderAvailableLanguageModels keeps only allowlisted ids in list order", () => {
    const input = [
      model("openai/gpt-5.4"),
      model("moonshotai/kimi-k2.6"),
      model("moonshotai/kimi-k2.5"),
      model("anthropic/claude-haiku-4.5"),
    ];

    expect(
      filterAndOrderAvailableLanguageModels(input).map((m) => m.id),
    ).toEqual(["moonshotai/kimi-k2.5", "moonshotai/kimi-k2.6"]);
  });

  test("ALLOWED_LANGUAGE_MODEL_IDS matches documented curated set", () => {
    expect([...ALLOWED_LANGUAGE_MODEL_IDS]).toEqual([
      "moonshotai/kimi-k2.5",
      "moonshotai/kimi-k2.6",
      "alibaba/qwen3.6-plus",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4-nano",
      "openai/gpt-5.3-codex",
      "google/gemini-3.1-flash-lite-preview",
      "google/gemini-3-flash",
    ]);
  });
});
