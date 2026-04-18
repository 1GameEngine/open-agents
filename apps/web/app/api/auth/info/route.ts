/**
 * GET /api/auth/info
 *
 * Returns the authenticated user's info based on the API key in the
 * Authorization header. In self-hosted mode there is no OAuth provider,
 * so Vercel reconnect fields are always false.
 */
import type { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/auth/api-key";
import { getGitHubAccount } from "@/lib/db/accounts";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { userExists } from "@/lib/db/users";
import type { SessionUserInfo } from "@/lib/session/types";

const UNAUTHENTICATED: SessionUserInfo = { user: undefined };

export async function GET(_req: NextRequest) {
  const auth = await requireApiKey();
  if (!auth.ok) {
    return Response.json(UNAUTHENTICATED, { status: 401 });
  }

  const userId = auth.userId;

  const [exists, ghAccount, installations] = await Promise.all([
    userExists(userId),
    getGitHubAccount(userId),
    getInstallationsByUserId(userId),
  ]);

  if (!exists) {
    return Response.json(UNAUTHENTICATED, { status: 401 });
  }

  const hasGitHubAccount = ghAccount !== null;
  const hasGitHubInstallations = installations.length > 0;
  const hasGitHub = hasGitHubAccount || hasGitHubInstallations;

  const data: SessionUserInfo = {
    user: {
      id: userId,
      username: auth.username,
      email: undefined,
      avatar: "",
    },
    authProvider: "github",
    hasGitHub,
    hasGitHubAccount,
    hasGitHubInstallations,
    vercelReconnectRequired: false,
  };

  return Response.json(data);
}
