import { filterModelsForSession } from "@/lib/model-access";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";
import { requireApiKey } from "@/lib/auth/api-key";

const CACHE_CONTROL = "private, no-store";

export async function GET(req: Request) {
  const authResult = await requireApiKey();
  if (!authResult.ok) return authResult.response;

  try {
    const models = await fetchAvailableLanguageModelsWithContext();
    // In self-hosted mode there are no managed-template restrictions.
    const session = { user: { id: authResult.userId } };

    return Response.json(
      { models: filterModelsForSession(models, session, req.url) },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch available models:", error);
    return Response.json(
      { error: "Failed to fetch available models" },
      { status: 500 },
    );
  }
}
