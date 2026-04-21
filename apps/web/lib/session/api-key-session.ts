import { validateApiKey } from "@/lib/db/api-keys";
import type { Session } from "./types";

export async function getSessionFromRawApiKey(
  rawKey: string,
): Promise<Session | undefined> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return undefined;
  }

  const validated = await validateApiKey(trimmed);
  if (!validated) {
    return undefined;
  }

  return {
    created: Date.now(),
    authProvider: "api-key",
    user: {
      id: validated.userId,
      username: validated.username,
    },
  };
}
