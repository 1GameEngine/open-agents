import type { AvailableModel } from "@/lib/models";

/**
 * Curated language models shown in selectors and `/api/models`.
 * Order is preserved within each provider group in the UI.
 */
export const ALLOWED_LANGUAGE_MODEL_IDS: readonly string[] = [
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2.6",
  "alibaba/qwen3.6-plus",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.3-codex",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-3-flash",
];

const allowedSet = new Set(ALLOWED_LANGUAGE_MODEL_IDS);

export function isAllowedLanguageModelId(modelId: string): boolean {
  return allowedSet.has(modelId);
}

export function filterAndOrderAvailableLanguageModels(
  models: AvailableModel[],
): AvailableModel[] {
  const byId = new Map(models.map((m) => [m.id, m]));
  const ordered: AvailableModel[] = [];
  for (const id of ALLOWED_LANGUAGE_MODEL_IDS) {
    const model = byId.get(id);
    if (model) {
      ordered.push(model);
    }
  }
  return ordered;
}
